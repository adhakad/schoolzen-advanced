'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const TcStructureModel = require('../../models/certificates/tc-structure');
const TransferCertificateModel = require('../../models/certificates/transfer-certificate');
const { ConflictError, ValidationError, NotFoundError } = require('../../errors');
const messages = require('../../helpers/messages/certificates.messages');
const { withTransaction } = require('../../helpers/with-transaction');
const { TC_FIELDS } = require('../../helpers/certificates/tc-fields');
const { nextSerial, attendanceInRange, feesGate, buildSnapshot } = require('../../helpers/certificates/tc-rules');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, isObjectId, toObjectId, notFound, requireSessionId, ensureStructure,
    issuedCountOf, loadStudentContext,
} = require('../../helpers/certificates/tc-context');
const {
    buildEnrollmentMatch, resolveSearchStudentIds, loadClassIndex, describePlacement,
} = require('../../helpers/student/student.utils');
const { toDateKey, toUtcMidnight } = require('../../helpers/date-only');
const { nowWallClock } = require('../../helpers/attendance-time');
const { buildLetterheadDocument } = require('../../services/pdf/letterhead.service');
const { logActivity } = require('../../services/activity-log.service');

// Generate TC (certificates/generate-tc.md). Every student of the session, filters only
// narrow. Issuing snapshots the student AT ISSUE TIME with the serial taken from the
// school's counter in the same transaction; a reprint renders that snapshot, never live
// data. Issue and cancel need the explicit 'tc-generate' grant (routes); pending fees block
// an issue unless a 'fees-waiver' holder acknowledges them.
//
// Not cached (certificates/optimization.md): the list reflects live issue status.

const MAX_SERIAL_SKIPS = 1000;

const todayKey = () => toDateKey(toUtcMidnight(nowWallClock()));
const dateText = (date) => (date ? new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);
const initialsOf = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();

const fieldError = (field, code, message) => new ValidationError(message, { module: MODULE, code, fields: [{ field, message, code }] });

/** Issued TCs of this school: Map<studentId, tc>. Bounded by "TCs issued so far". */
const loadIssued = async (adminId) => {
    const rows = await TransferCertificateModel.find({ adminId, status: 'issued' }, 'studentId dateOfLeaving serialNumber').lean();
    return new Map(rows.map((row) => [String(row.studentId), row]));
};

/** Status filter on top of search: narrows the enrollment match, never gates. */
const studentIdFilter = (searchIds, issued, status) => {
    const issuedIds = [...issued.keys()];
    if (status === 'issued') {
        const wanted = searchIds ? searchIds.map(String).filter((id) => issued.has(id)) : issuedIds;
        return { $in: wanted.map(toObjectId) };
    }
    if (status === 'notissued') {
        return searchIds
            ? { $in: searchIds.filter((id) => !issued.has(String(id))) }
            : { $nin: issuedIds.map(toObjectId) };
    }
    return searchIds ? { $in: searchIds } : null;
};

const toRow = (classIndex, profiles, issued) => (enrollment) => {
    const studentId = String(enrollment.studentId);
    const profile = profiles.get(studentId) || {};
    const tc = issued.get(studentId) || null;
    const placement = describePlacement(classIndex, enrollment);
    return {
        _id: String(enrollment._id),
        studentId,
        rollNumber: enrollment.rollNumber,
        name: profile.name || '—',
        initials: initialsOf(profile.name),
        admissionNo: profile.admissionNo != null ? profile.admissionNo : null,
        className: [placement.className, placement.streamName].filter(Boolean).join(' '),
        status: tc ? 'issued' : 'notissued',
        tcId: tc ? String(tc._id) : null,
        dateOfLeaving: tc ? dateText(tc.dateOfLeaving) : null,
    };
};

/** GET /tc/students — keyset page over the session's enrollments. */
let ListStudents = async (req, res) => {
    const { adminId, session, search, status, after, limit } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const match = buildEnrollmentMatch(adminId, sessionId, req.query);
    const [searchIds, issued] = await Promise.all([resolveSearchStudentIds(adminId, search), loadIssued(adminId)]);
    const studentFilter = studentIdFilter(searchIds, issued, status);
    if (studentFilter) match.studentId = studentFilter;
    // The filtered total backs the pagination bar's "x–y of N" — first page only.
    const total = after ? null : await StudentEnrollmentModel.countDocuments(match);
    if (after) match._id = { $gt: toObjectId(after) };

    const found = await StudentEnrollmentModel.find(match, 'studentId classId class streamId sectionId rollNumber')
        .sort({ _id: 1 }).limit(limit + 1).lean();
    const page = found.slice(0, limit);
    const [classIndex, profiles] = await Promise.all([
        loadClassIndex(adminId),
        StudentProfileModel.find({ adminId, _id: { $in: page.map((row) => row.studentId) } }, 'name admissionNo').lean()
            .then((rows) => new Map(rows.map((row) => [String(row._id), row]))),
    ]);

    let summary = null;
    if (!after) {
        const [totalStudents, structure] = await Promise.all([
            StudentEnrollmentModel.countDocuments({ adminId, sessionId }),
            ensureStructure(adminId),
        ]);
        summary = { totalStudents, issuedThisSession: issuedCountOf(structure, sessionId) };
    }
    return res.status(200).json({
        rows: page.map(toRow(classIndex, profiles, issued)),
        nextCursor: found.length > limit && page.length ? String(page[page.length - 1]._id) : null,
        total,
        summary,
        canIssue: canEditOf(req, PERMISSIONS.GENERATE),
    });
};

/** What the Issue modal pre-fills. Display only — IssueTc recomputes every value. */
let GetIssueDraft = async (req, res) => {
    const { adminId, session, dateOfLeaving } = req.query;
    const { studentId } = req.params;
    const sessionId = await requireSessionId(adminId, session);
    const leavingKey = dateOfLeaving || todayKey();
    const [ctx, structure, existing] = await Promise.all([
        loadStudentContext(adminId, studentId, sessionId, leavingKey),
        ensureStructure(adminId),
        TransferCertificateModel.exists({ adminId, studentId, status: 'issued' }),
    ]);
    const canWaive = canEditOf(req, PERMISSIONS.FEES_WAIVER);
    return res.status(200).json({
        studentId: String(studentId),
        name: ctx.profile.name,
        serialNumber: structure.nextSerialNumber,
        className: ctx.placement.className,
        nextClassName: ctx.placement.nextClassName,
        workingDays: ctx.attendance.workingDays,
        presentDays: ctx.attendance.presentDays,
        totalDue: ctx.totalDue,
        canOverrideFees: feesGate(ctx.totalDue, canWaive, false).canOverride,
        alreadyIssued: Boolean(existing),
    });
};

/** The printable view: stored snapshot + the shared letterhead header. Never recomputed. */
const buildCertificateView = async (adminId, tc) => {
    const letterhead = await buildLetterheadDocument({ adminId, title: 'TRANSFER CERTIFICATE', fields: [] });
    const snapshot = tc.snapshot || {};
    return {
        _id: String(tc._id),
        studentId: String(tc.studentId),
        serialNumber: tc.serialNumber,
        status: tc.status,
        header: letterhead.header,
        title: letterhead.title,
        admissionNo: snapshot.admissionNo || null,
        fields: TC_FIELDS.map((field) => ({
            no: field.no,
            label: field.printLabel,
            value: snapshot[field.key] == null || snapshot[field.key] === '' ? '—' : String(snapshot[field.key]),
        })),
    };
};

const isDuplicate = (error, key) => error && error.code === 11000 && Boolean((error.keyPattern || {})[key]);

/**
 * POST /tc/:studentId — Issue TC. Server-side validation of every input (errors.md shape 1),
 * adminId-scoped 404s that always respond (shape 4), the fees gate, then ONE transaction:
 * take the serial from the counter (skipping any number already printed), advance it with a
 * conditional update, bump the session's issued counter, create the snapshot. The partial
 * unique {adminId, studentId} index turns a concurrent second issue into TC_ALREADY_ISSUED;
 * the Idempotency-Key (route) replays the first response on a retry.
 */
let IssueTc = async (req, res) => {
    const { adminId, session, dateOfLeaving, reasonForLeaving, qualifiedForPromotion, generalConduct, remarks, acknowledgeFeesPending } = req.body;
    const { studentId } = req.params;
    if (!isObjectId(studentId)) throw notFound({ studentId });
    const sessionId = await requireSessionId(adminId, session);

    if (dateOfLeaving > todayKey()) throw fieldError('dateOfLeaving', 'TC_FIELD_INVALID', messages.dateInFuture());
    const ctx = await loadStudentContext(adminId, studentId, sessionId, dateOfLeaving);
    if (ctx.profile.doa && dateOfLeaving < toDateKey(ctx.profile.doa)) {
        throw fieldError('dateOfLeaving', 'TC_FIELD_INVALID', messages.dateBeforeAdmission());
    }
    if (!attendanceInRange(ctx.attendance.workingDays, ctx.attendance.presentDays)) {
        throw new ValidationError(messages.attendanceRangeInvalid(), { module: MODULE, code: 'TC_ATTENDANCE_RANGE_INVALID' });
    }
    if (await TransferCertificateModel.exists({ adminId, studentId, status: 'issued' })) {
        throw new ConflictError(messages.alreadyIssued(), { module: MODULE, code: 'TC_ALREADY_ISSUED' });
    }

    const canWaive = canEditOf(req, PERMISSIONS.FEES_WAIVER);
    const gate = feesGate(ctx.totalDue, canWaive, acknowledgeFeesPending === true);
    if (!gate.allowed) {
        throw new ConflictError(gate.canOverride ? messages.feesPendingOverride(ctx.totalDue) : messages.feesPending(ctx.totalDue), {
            module: MODULE, code: 'TC_FEES_PENDING',
            fields: [{ field: 'fees', message: String(ctx.totalDue), code: gate.canOverride ? 'TC_FEES_PENDING_OVERRIDABLE' : 'TC_FEES_PENDING' }],
            context: { studentId, totalDue: ctx.totalDue },
        });
    }

    const inputs = { dateOfLeaving: toUtcMidnight(dateOfLeaving), reasonForLeaving, qualifiedForPromotion, generalConduct, remarks };
    const snapshot = buildSnapshot(ctx.profile, ctx.placement, inputs, ctx.attendance);
    await ensureStructure(adminId);

    const tc = await withTransaction(async (dbSession) => {
        const structure = await TcStructureModel.findOne({ adminId }).session(dbSession).lean();
        const taken = structure.nextSerialNumber;
        let serial = taken;
        for (let i = 0; i < MAX_SERIAL_SKIPS
            && await TransferCertificateModel.exists({ adminId, serialNumber: serial }).session(dbSession); i += 1) {
            serial = nextSerial(serial);
        }
        const advanced = await TcStructureModel.findOneAndUpdate(
            { adminId, nextSerialNumber: taken },
            {
                $set: { nextSerialNumber: nextSerial(serial), updatedAt: new Date() },
                $inc: { [`issuedCounts.${String(sessionId)}`]: 1 },
            },
            { new: true, session: dbSession }
        ).lean();
        if (!advanced) throw new ConflictError(messages.serialChanged(), { module: MODULE, code: 'TC_SERIAL_CHANGED' });
        const [created] = await TransferCertificateModel.create([{
            adminId,
            studentId: toObjectId(studentId),
            sessionId,
            enrollmentId: ctx.enrollment._id,
            serialNumber: serial,
            dateOfLeaving: inputs.dateOfLeaving,
            reasonForLeaving,
            qualifiedForPromotion,
            generalConduct,
            remarks: remarks || null,
            snapshot,
            feesDueAtIssue: ctx.totalDue,
            feesOverride: gate.override,
            createdBy: actorOf(req),
        }], { session: dbSession });
        return created.toObject();
    }).catch((error) => {
        if (isDuplicate(error, 'studentId')) throw new ConflictError(messages.alreadyIssued(), { module: MODULE, code: 'TC_ALREADY_ISSUED' });
        if (isDuplicate(error, 'serialNumber')) throw new ConflictError(messages.serialChanged(), { module: MODULE, code: 'TC_SERIAL_CHANGED' });
        throw error;
    });

    await logActivity(req, {
        module: MODULE, action: 'certificates.tc.issue', targetId: String(tc._id),
        meta: {
            studentId: String(studentId), session, serialNumber: tc.serialNumber,
            feesDueAtIssue: tc.feesDueAtIssue, feesOverride: tc.feesOverride,
        },
    });
    return res.status(200).json({
        message: messages.issued(tc.serialNumber),
        certificate: await buildCertificateView(adminId, tc),
        row: { studentId: String(studentId), status: 'issued', tcId: String(tc._id), dateOfLeaving: dateText(tc.dateOfLeaving) },
    });
};

/** GET /tc/:id — reprint: the stored snapshot, same serial forever. */
let GetTc = async (req, res) => {
    const { adminId } = req.query;
    const { id } = req.params;
    if (!isObjectId(id)) throw notFound({ id });
    const tc = await TransferCertificateModel.findOne({ adminId, _id: id }).lean();
    if (!tc) throw notFound({ id });
    return res.status(200).json(await buildCertificateView(adminId, tc));
};

/**
 * POST /tc/:id/cancel — 'tc-generate'. Keeps the document and its serial (a number is never
 * re-issued); the student can then be issued a fresh TC with a new serial.
 */
let CancelTc = async (req, res) => {
    const { adminId, reason } = req.body;
    const { id } = req.params;
    if (!isObjectId(id)) throw notFound({ id });
    const tc = await withTransaction(async (dbSession) => {
        const cancelled = await TransferCertificateModel.findOneAndUpdate(
            { adminId, _id: id, status: 'issued' },
            { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: actorOf(req), cancelReason: reason, updatedAt: new Date() } },
            { new: true, session: dbSession }
        ).lean();
        if (!cancelled) {
            const exists = await TransferCertificateModel.exists({ adminId, _id: id }).session(dbSession);
            if (exists) throw new ConflictError(messages.alreadyCancelled(), { module: MODULE, code: 'TC_ALREADY_CANCELLED' });
            throw new NotFoundError(messages.notFound(), { module: MODULE, code: 'NOT_FOUND', context: { id } });
        }
        await TcStructureModel.updateOne(
            { adminId },
            { $inc: { [`issuedCounts.${String(cancelled.sessionId)}`]: -1 } },
            { session: dbSession }
        );
        return cancelled;
    });
    await logActivity(req, {
        module: MODULE, action: 'certificates.tc.cancel', targetId: String(tc._id),
        meta: { studentId: String(tc.studentId), serialNumber: tc.serialNumber, reason },
    });
    return res.status(200).json({ message: messages.cancelled(tc.serialNumber) });
};

module.exports = { ListStudents, GetIssueDraft, IssueTc, GetTc, CancelTc, buildCertificateView, studentIdFilter };
