'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const AdmitCardModel = require('../../models/examination/admit-card');
const { NotFoundError } = require('../../errors');
const messages = require('../../helpers/messages/examination.messages');
const { buildLetterheadDocument } = require('../../services/pdf/letterhead.service');
const { buildEnrollmentMatch, resolveSearchStudentIds, loadClassIndex, describePlacement } = require('../../helpers/student/student.utils');
const { time12 } = require('../../helpers/examination/exam-rules');
const {
    MODULE, isObjectId, toObjectId, requireSessionId, initialsOf,
} = require('../../helpers/examination/exam-context');

// Generate Admit Card (examination/generate-admit-card.md). No configuration lives here —
// it only READS the AdmitCard documents Admit Card Structure's job generated. Every student
// of the session is listed (one row per card); a student with none shows "No structure set".
//
// Preview/print render each card's own SNAPSHOT (schedule frozen at generation), never the
// live structure. Not cached (examination/optimization.md).

const PRINT_LIMIT = 200;

const shortSession = (label) => String(label || '').replace(/^(\d{4})-\d{2}(\d{2})$/, '$1-$2');
const dateText = (value) => (value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const keyText = (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    return dateText(new Date(Date.UTC(y, m - 1, d)));
};

/** Card scope filter on top of the enrollment filters (cards carry the same placement ids). */
const cardFilter = (adminId, sessionId, filters) => {
    const filter = { adminId, sessionId: toObjectId(sessionId) };
    ['classId', 'streamId', 'groupId', 'sectionId'].forEach((key) => { if (filters[key]) filter[key] = toObjectId(filters[key]); });
    return filter;
};

/** GET /admit-cards — keyset page over the session's students, one row per generated card. */
let ListAdmitCards = async (req, res) => {
    const { adminId, session, search, after, limit } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const baseMatch = buildEnrollmentMatch(adminId, sessionId, req.query);
    const match = { ...baseMatch };
    const ids = await resolveSearchStudentIds(adminId, search);
    if (ids !== null) {
        const or = [{ studentId: { $in: ids } }];
        if (/^\d+$/.test(String(search).trim())) or.push({ rollNumber: Number(String(search).trim()) });
        match.$or = or;
    }
    const total = after ? null : await StudentEnrollmentModel.countDocuments(match);
    if (after) match._id = { $gt: toObjectId(after) };

    const found = await StudentEnrollmentModel.find(match, 'studentId classId class streamId sectionId rollNumber')
        .sort({ _id: 1 }).limit(limit + 1).lean();
    const page = found.slice(0, limit);
    const studentIds = page.map((row) => row.studentId);
    const [classIndex, profiles, cards] = await Promise.all([
        loadClassIndex(adminId),
        StudentProfileModel.find({ adminId, _id: { $in: studentIds } }, 'name').lean()
            .then((rows) => new Map(rows.map((row) => [String(row._id), row]))),
        AdmitCardModel.find({ adminId, sessionId: toObjectId(sessionId), studentId: { $in: studentIds } }, 'studentId examName')
            .sort({ generatedAt: 1 }).lean(),
    ]);
    const cardsBy = new Map();
    cards.forEach((card) => {
        const key = String(card.studentId);
        if (!cardsBy.has(key)) cardsBy.set(key, []);
        cardsBy.get(key).push(card);
    });

    const rows = [];
    page.forEach((enrollment) => {
        const profile = profiles.get(String(enrollment.studentId)) || {};
        const placement = describePlacement(classIndex, enrollment);
        const base = {
            studentId: String(enrollment.studentId),
            name: profile.name || '—',
            initials: initialsOf(profile.name),
            rollNumber: enrollment.rollNumber,
            className: placement.className,
            streamName: placement.streamName,
        };
        const own = cardsBy.get(String(enrollment.studentId)) || [];
        if (!own.length) rows.push({ ...base, rowId: `none-${base.studentId}`, cardId: null, examName: null });
        own.forEach((card) => rows.push({ ...base, rowId: String(card._id), cardId: String(card._id), examName: card.examName }));
    });

    let summary = null;
    if (!after) {
        const [withCard, filtered] = await Promise.all([
            AdmitCardModel.distinct('studentId', cardFilter(adminId, sessionId, req.query)),
            StudentEnrollmentModel.countDocuments(baseMatch),
        ]);
        summary = { withCard: withCard.length, missing: Math.max(0, filtered - withCard.length) };
    }
    return res.status(200).json({
        rows,
        nextCursor: found.length > limit && page.length ? String(page[page.length - 1]._id) : null,
        total,
        summary,
    });
};

/** A card as the print template renders it — snapshot only. */
const cardView = (card) => ({
    cardId: String(card._id),
    studentId: String(card.studentId),
    examName: card.examName,
    name: card.student.name || '—',
    dob: dateText(card.student.dob),
    motherName: card.student.motherName || '—',
    fatherName: card.student.fatherName || '—',
    className: [card.student.className, card.student.streamName].filter(Boolean).join(' '),
    rollNumber: card.student.rollNumber,
    schedule: card.schedule.map((s, i) => ({
        no: i + 1, subjectName: s.subjectName, examDate: keyText(s.examDate), timing: `${time12(s.startTime)} – ${time12(s.endTime)}`,
    })),
});

const titleFor = (examName, session) => `${String(examName).toUpperCase()} ADMIT CARD ${shortSession(session)}`;

/**
 * POST /admit-cards/print { cardIds } — the selected cards (one preview or a print batch),
 * with the shared letterhead header once. Ids with no card (another school's, or removed
 * since the page loaded) are skipped and reported (PRINT_SELECTION_INCOMPLETE).
 */
let PrintAdmitCards = async (req, res) => {
    const { adminId, session, cardIds } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const ids = [...new Set((cardIds || []).filter(isObjectId))].slice(0, PRINT_LIMIT);
    const [cards, letterhead] = await Promise.all([
        AdmitCardModel.find({ adminId, sessionId: toObjectId(sessionId), _id: { $in: ids.map(toObjectId) } }).lean(),
        buildLetterheadDocument({ adminId, title: '', fields: [] }),
    ]);
    if (ids.length === 1 && !cards.length) {
        throw new NotFoundError(messages.recordNotGenerated(), { module: MODULE, code: 'RECORD_NOT_GENERATED' });
    }
    const byId = new Map(cards.map((c) => [String(c._id), c]));
    const documents = ids.filter((id) => byId.has(id)).map((id) => {
        const card = byId.get(id);
        return { ...cardView(card), title: titleFor(card.examName, session) };
    });
    const skipped = ((cardIds || []).length) - documents.length;
    return res.status(200).json({
        header: letterhead.header,
        documents,
        skipped: skipped > 0 ? { count: skipped, code: 'PRINT_SELECTION_INCOMPLETE', message: messages.printSelectionIncomplete(skipped) } : null,
    });
};

module.exports = { ListAdmitCards, PrintAdmitCards };
