'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { ValidationError, NotFoundError } = require('../../errors');
const messages = require('../../helpers/messages/student.messages');
const {
    MODULE, titleCase, getNextSession, loadClassIndex, resolvePlacement,
    buildEnrollmentMatch, promotionLookups,
} = require('../../helpers/student/student.utils');

// Class Promotion — year-end Promote/Detain per student, creating NEXT-session placements.
// The current session's enrollments are only ever read here (class-promotion.md).
//
// Confirm is a background job (queues/student-queue.js → workers/student-worker.js): a
// whole cohort can be thousands of students, processed in bounded per-chunk transactions.

const queue = () => require('../../queues/student-queue');

// A single class, however large, stays well under this; it bounds the roster read.
const MAX_ROSTER = 3000;

// Nursery/LKG/UKG (200/201/202) come BEFORE 1st — the sentinel numbers sort after 12.
const classOrder = (classNumber) => (classNumber >= 200 ? classNumber - 300 : classNumber);

/**
 * Every placement a student could be promoted INTO: each configured class other than the
 * current one, per section (or per stream × section for a streamed class, plus a bare
 * "stream later" option that surfaces the Stream + Subject Group warning).
 */
const buildTargetOptions = (classIndex, currentClassId) => {
    const entries = [...classIndex.values()]
        .filter((entry) => String(entry.doc._id) !== String(currentClassId))
        .sort((a, b) => classOrder(a.doc.class) - classOrder(b.doc.class));

    const options = [];
    for (const entry of entries) {
        const base = { classId: String(entry.doc._id), class: entry.doc.class, classLabel: entry.label };
        if (entry.doc.hasStreams) {
            options.push({ ...base, key: `${base.classId}`, label: `${entry.label} (stream later)`, streamId: null, sectionId: null, streamed: true });
            for (const stream of entry.doc.streams || []) {
                const streamLabel = titleCase(stream.name);
                const sections = stream.sections || [];
                if (sections.length === 0) {
                    options.push({ ...base, key: `${base.classId}:${stream._id}`, label: `${entry.label} - ${streamLabel}`, streamId: String(stream._id), sectionId: null, streamed: true });
                }
                for (const section of sections) {
                    options.push({
                        ...base,
                        key: `${base.classId}:${stream._id}:${section._id}`,
                        label: `${entry.label} - ${streamLabel} - ${section.name}`,
                        streamId: String(stream._id),
                        sectionId: String(section._id),
                        streamed: true,
                    });
                }
            }
        } else {
            const sections = entry.doc.sections || [];
            if (sections.length === 0) {
                options.push({ ...base, key: base.classId, label: entry.label, streamId: null, sectionId: null, streamed: false });
            }
            for (const section of sections) {
                options.push({
                    ...base,
                    key: `${base.classId}::${section._id}`,
                    label: `${entry.label} - ${section.name}`,
                    streamId: null,
                    sectionId: String(section._id),
                    streamed: false,
                });
            }
        }
    }
    return options;
};

/** The class that naturally follows `current` in this school's own configured sequence. */
const nextClassId = (classIndex, current) => {
    const later = [...classIndex.values()]
        .filter((entry) => classOrder(entry.doc.class) > classOrder(current.doc.class))
        .sort((a, b) => classOrder(a.doc.class) - classOrder(b.doc.class));
    return later.length ? String(later[0].doc._id) : null;
};

const loadRosterEnrollments = (adminId, query) => StudentEnrollmentModel.aggregate([
    { $match: buildEnrollmentMatch(adminId, query.session, query) },
    { $limit: MAX_ROSTER },
    { $lookup: { from: StudentProfileModel.collection.name, localField: 'studentId', foreignField: '_id', as: 'student' } },
    { $unwind: '$student' },
    {
        $project: {
            studentId: 1, classId: 1, class: 1, streamId: 1, groupId: 1, sectionId: 1, rollNumber: 1,
            'student.name': 1, 'student.admissionNo': 1, 'student.photoUrl': 1,
        },
    },
]);

let GetPromotionRoster = async (req, res) => {
    const { adminId, session, classId } = req.query;
    const classIndex = await loadClassIndex(adminId);
    const current = classIndex.get(String(classId));
    if (!current) {
        throw new ValidationError(messages.classNotConfigured(), { module: MODULE, fields: [{ field: 'classId', message: messages.classNotConfigured() }] });
    }

    const [nextSession, enrollments] = await Promise.all([
        getNextSession(session),
        loadRosterEnrollments(adminId, req.query),
    ]);
    const studentIds = enrollments.map((item) => item.studentId);

    const [results, placedNext] = await Promise.all([
        promotionLookups.examResultFor(adminId, session, studentIds),
        StudentEnrollmentModel.find({ adminId, session: nextSession, studentId: { $in: studentIds } }, 'studentId').lean(),
    ]);
    const placedSet = new Set(placedNext.map((item) => String(item.studentId)));

    const targetOptions = buildTargetOptions(classIndex, classId);
    const defaultClassId = nextClassId(classIndex, current);
    const defaultTarget = targetOptions.find((option) => option.classId === defaultClassId) || null;

    // Roll order first (how a teacher reads the list), then name for rows without one.
    enrollments.sort((a, b) => (a.rollNumber ?? Infinity) - (b.rollNumber ?? Infinity)
        || String(a.student.name).localeCompare(String(b.student.name)));

    return res.status(200).json({
        session,
        nextSession,
        currentClass: { classId: String(classId), label: current.label },
        defaultTargetKey: defaultTarget ? defaultTarget.key : null,
        targetOptions,
        rows: enrollments.map((item) => ({
            enrollmentId: String(item._id),
            studentId: String(item.studentId),
            rollNumber: item.rollNumber,
            name: item.student.name,
            admissionNo: item.student.admissionNo,
            photoUrl: item.student.photoUrl || null,
            examResult: results.get(String(item.studentId)) || 'not-set',
            alreadyPlaced: placedSet.has(String(item.studentId)),
        })),
    });
};

/**
 * Turn the page's decisions into a checked plan: every row validated against the roster
 * scope, every Promote target checked against Academic Setup, plus the counts and the two
 * non-blocking warnings the confirm modal must show (class-promotion.md).
 */
const buildPromotionPlan = async (body) => {
    const { adminId, session, classId, decisions } = body;
    const classIndex = await loadClassIndex(adminId);
    const current = classIndex.get(String(classId));
    if (!current) {
        throw new ValidationError(messages.classNotConfigured(), { module: MODULE, fields: [{ field: 'classId', message: messages.classNotConfigured() }] });
    }

    const [nextSession, enrollments] = await Promise.all([
        getNextSession(session),
        StudentEnrollmentModel.find(buildEnrollmentMatch(adminId, session, body), 'studentId classId class streamId groupId sectionId').limit(MAX_ROSTER).lean(),
    ]);
    const byId = new Map(enrollments.map((item) => [String(item._id), item]));

    const missing = decisions.filter((decision) => !byId.has(decision.enrollmentId)).length;
    if (missing) throw new NotFoundError(messages.studentsNotFound(missing), { module: MODULE });

    const placed = await StudentEnrollmentModel.find(
        { adminId, session: nextSession, studentId: { $in: decisions.map((d) => byId.get(d.enrollmentId).studentId) } },
        'studentId'
    ).lean();
    const placedSet = new Set(placed.map((item) => String(item.studentId)));

    // Each distinct target is checked once, however many students share it.
    const targetCache = new Map();
    const resolveTarget = async (target) => {
        const key = [target.classId, target.streamId, target.groupId, target.sectionId].join(':');
        if (!targetCache.has(key)) {
            targetCache.set(key, resolvePlacement(adminId, target, { classIndex, allowIncomplete: true }).catch((error) => {
                if (error instanceof ValidationError) {
                    throw new ValidationError(messages.promotionTargetInvalid(), { module: MODULE, fields: [{ field: 'decisions', message: messages.promotionTargetInvalid() }] });
                }
                throw error;
            }));
        }
        return targetCache.get(key);
    };

    const items = [];
    const incompleteByClass = new Map();   // target classId -> count missing stream/group
    const targetClassIds = new Set();
    let promoting = 0;
    let detaining = 0;

    for (const decision of decisions) {
        const enrollment = byId.get(decision.enrollmentId);
        let target;
        if (decision.decision === 'detain') {
            // Repeats the same class next session, in the same stream/group/section.
            target = {
                classId: String(enrollment.classId), class: enrollment.class,
                streamId: enrollment.streamId ? String(enrollment.streamId) : null,
                groupId: enrollment.groupId ? String(enrollment.groupId) : null,
                sectionId: enrollment.sectionId ? String(enrollment.sectionId) : null,
                placementIncomplete: false,
            };
            detaining += 1;
        } else {
            const resolved = await resolveTarget(decision.target);
            target = {
                classId: String(resolved.classId), class: resolved.class,
                streamId: resolved.streamId ? String(resolved.streamId) : null,
                groupId: resolved.groupId ? String(resolved.groupId) : null,
                sectionId: resolved.sectionId ? String(resolved.sectionId) : null,
                placementIncomplete: resolved.placementIncomplete,
            };
            promoting += 1;
            if (target.placementIncomplete) {
                incompleteByClass.set(target.classId, (incompleteByClass.get(target.classId) || 0) + 1);
            }
        }
        targetClassIds.add(target.classId);
        items.push({
            enrollmentId: decision.enrollmentId,
            studentId: String(enrollment.studentId),
            decision: decision.decision,
            target,
        });
    }

    // The two non-blocking warnings — surfaced, never silent, never blocking.
    const warnings = [];
    incompleteByClass.forEach((count, targetClassId) => {
        warnings.push({ type: 'stream-missing', message: messages.warnStreamMissing(count, classIndex.get(targetClassId).label) });
    });
    const feeChecks = await Promise.all([...targetClassIds].map(async (targetClassId) => ({
        targetClassId,
        exists: await promotionLookups.hasFeeStructure(adminId, targetClassId, nextSession),
    })));
    feeChecks.filter((check) => !check.exists).forEach((check) => {
        warnings.push({ type: 'fee-structure-missing', message: messages.warnFeeStructureMissing(classIndex.get(check.targetClassId).label, nextSession) });
    });
    const alreadyPlaced = items.filter((item) => placedSet.has(item.studentId)).length;
    if (alreadyPlaced) warnings.push({ type: 'already-placed', message: messages.promotionAlreadyPlaced(alreadyPlaced, nextSession) });

    return {
        nextSession,
        items,
        summary: {
            promoting,
            detaining,
            notDecided: Math.max(0, enrollments.length - decisions.length),
            total: promoting + detaining,
        },
        warnings,
    };
};

let PreviewPromotion = async (req, res) => {
    const plan = await buildPromotionPlan(req.body);
    return res.status(200).json({ nextSession: plan.nextSession, summary: plan.summary, warnings: plan.warnings });
};

let ConfirmPromotion = async (req, res) => {
    if (req.body.decisions.length === 0) {
        throw new ValidationError(messages.promotionNothingDecided(), { module: MODULE, fields: [{ field: 'decisions', message: messages.promotionNothingDecided() }] });
    }
    // Re-planned server-side on confirm: the preview the modal showed may be minutes old.
    const plan = await buildPromotionPlan(req.body);
    const jobId = await queue().addPromotionJob({
        adminId: req.body.adminId,
        fromSession: req.body.session,
        toSession: plan.nextSession,
        classId: String(req.body.classId),
        items: plan.items,
    });

    return res.status(202).json({
        message: messages.promotionQueued(plan.summary.total, plan.nextSession),
        jobId,
        nextSession: plan.nextSession,
        summary: plan.summary,
        warnings: plan.warnings,
    });
};

module.exports = {
    GetPromotionRoster,
    PreviewPromotion,
    ConfirmPromotion,
};
