'use strict';
const mongoose = require('mongoose');
const HolidayV2Model = require('../../models/holiday/holiday');
const HolidayTemplateV2Model = require('../../models/holiday/holiday-template');
const StaffV2Model = require('../../models/staff/staff');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const cacheService = require('../cache/cache.service');
const cacheKeys = require('../cache/cache-keys');
const { offKeysFor, coversDay } = require('../../helpers/holiday/holiday-rules');
const { toDateKey } = require('../../helpers/date-only');
const { nowWallClock } = require('../../helpers/attendance-time');
const logger = require('../../helpers/logger');

// THE working-day calendar (holiday/templates.md): the one place Leave and Attendance ask
// "is this day off for this person?". A person's calendar is their assigned template — or
// the school's Default when none is assigned — computed from the template's CURRENT
// holidayIds, never a snapshot.
//
// Batched: any number of people resolve in two person queries plus one cached calendar per
// distinct template.

const { ObjectId } = mongoose.Types;
const DEFAULT_NAME = 'Default';
const CI = { locale: 'en', strength: 2 };

/** The school's Default template id, seeded (Sunday off) on first use. Race-safe upsert. */
const ensureDefaultTemplate = (adminId) => cacheService.wrap(
    cacheKeys.holiday.defaultTemplate(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const existing = await HolidayTemplateV2Model.findOne({ adminId, isDefault: true }, '_id').lean();
        if (existing) return String(existing._id);
        // A school may already own a template literally named "Default" — adopt it.
        const named = await HolidayTemplateV2Model.findOneAndUpdate({ adminId, name: DEFAULT_NAME }, { $set: { isDefault: true } }, { new: true })
            .collation(CI).lean().catch(() => null);
        if (named) return String(named._id);
        try {
            const created = await HolidayTemplateV2Model.create({ adminId, isDefault: true, name: DEFAULT_NAME, holidayIds: [], weeklyOffDays: [0] });
            return String(created._id);
        } catch (error) {
            // Lost the seed race to a concurrent first request — the partial unique index won.
            const winner = await HolidayTemplateV2Model.findOne({ adminId, isDefault: true }, '_id').lean();
            if (winner) return String(winner._id);
            throw error;
        }
    }
);

/** { weeklyOffDays, ranges } for one template — `{adminId}:holiday:templates:{id}`. */
const loadCalendar = (adminId, templateId) => cacheService.wrap(
    cacheKeys.holiday.template(adminId, templateId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const template = await HolidayTemplateV2Model.findOne({ _id: templateId, adminId }, 'holidayIds weeklyOffDays').lean();
        if (!template) return null;
        const holidays = template.holidayIds.length
            ? await HolidayV2Model.find({ adminId, _id: { $in: template.holidayIds } }, 'startDateKey endDateKey').lean()
            : [];
        return {
            weeklyOffDays: template.weeklyOffDays || [],
            ranges: holidays.map((row) => ({ startDateKey: row.startDateKey, endDateKey: row.endDateKey })),
        };
    }
);

const validIds = (ids) => ids.map(String).filter((id) => ObjectId.isValid(id));

/** Map<"type|id", templateId|null> — the assigned template per person. */
const assignedTemplates = async (adminId, sessionId, people) => {
    const staffIds = validIds(people.filter((p) => p.personType === 'staff').map((p) => p.personId));
    const studentIds = validIds(people.filter((p) => p.personType === 'student').map((p) => p.personId));
    const [staff, enrollments] = await Promise.all([
        staffIds.length ? StaffV2Model.find({ adminId, _id: { $in: staffIds } }, 'holidayTemplateId').lean() : [],
        studentIds.length && sessionId
            ? StudentEnrollmentModel.find(
                { adminId, sessionId: new ObjectId(String(sessionId)), studentId: { $in: studentIds.map((id) => new ObjectId(id)) } },
                'studentId holidayTemplateId'
            ).lean()
            : [],
    ]);
    const result = new Map();
    staff.forEach((row) => result.set(`staff|${row._id}`, row.holidayTemplateId ? String(row.holidayTemplateId) : null));
    enrollments.forEach((row) => result.set(`student|${row.studentId}`, row.holidayTemplateId ? String(row.holidayTemplateId) : null));
    return result;
};

/**
 * Map<"type|id", Set<dateKey>> — every non-working day in from..to for each person.
 * `people`: [{ personType, personId }]; students resolve through `sessionId`'s enrollment.
 */
const getOffKeysForPeople = async (adminId, sessionId, people, fromKey, toKey) => {
    const result = new Map();
    if (!people.length) return result;
    const [assigned, defaultId] = await Promise.all([assignedTemplates(adminId, sessionId, people), ensureDefaultTemplate(adminId)]);
    const templateIds = new Set([defaultId]);
    assigned.forEach((id) => { if (id) templateIds.add(id); });

    const offByTemplate = new Map();
    await Promise.all([...templateIds].map(async (id) => {
        const calendar = await loadCalendar(adminId, id);
        offByTemplate.set(id, calendar ? offKeysFor(calendar, fromKey, toKey) : null);
    }));
    const fallback = offByTemplate.get(defaultId) || new Set();
    people.forEach((p) => {
        const key = `${p.personType}|${p.personId}`;
        result.set(key, offByTemplate.get(assigned.get(key)) || fallback);
    });
    return result;
};

/** One person's off-days — Leave Apply / Approve. */
const getOffKeysForPerson = async (adminId, sessionId, personType, personId, fromKey, toKey) =>
    (await getOffKeysForPeople(adminId, sessionId, [{ personType, personId }], fromKey, toKey)).get(`${personType}|${personId}`) || new Set();

/** Active staff / this session's students with no template — the Leave/Attendance banner. */
const getCoverage = async (adminId, sessionId) => {
    const [unassignedStaff, unassignedStudents] = await Promise.all([
        StaffV2Model.countDocuments({ adminId, status: 'active', holidayTemplateId: null }),
        sessionId ? StudentEnrollmentModel.countDocuments({ adminId, sessionId: new ObjectId(String(sessionId)), holidayTemplateId: null }) : 0,
    ]);
    return { unassignedStaff, unassignedStudents };
};

/** Map<templateId, people using it> (staff + enrollments in any session). */
const countAssigned = async (adminId, templateIds) => {
    const ids = validIds(templateIds).map((id) => new ObjectId(id));
    const group = (Model) => Model.aggregate([
        { $match: { adminId, holidayTemplateId: { $in: ids } } },
        { $group: { _id: '$holidayTemplateId', count: { $sum: 1 } } },
    ]);
    const counts = new Map(ids.map((id) => [String(id), 0]));
    if (!ids.length) return counts;
    const [staff, students] = await Promise.all([group(StaffV2Model), group(StudentEnrollmentModel)]);
    staff.concat(students).forEach((row) => counts.set(String(row._id), (counts.get(String(row._id)) || 0) + row.count));
    return counts;
};

const todayKey = () => toDateKey(nowWallClock());

/**
 * A calendar change can turn today into (or out of) a holiday — re-run today's reconcile so
 * attendance follows (holiday/errors.md shape 9). `ranges` limits it to writes touching
 * today; omit for assignment/template changes. Best effort: never fails the request.
 */
const enqueueReconcileToday = async (adminId, ranges) => {
    const today = todayKey();
    if (ranges && !ranges.some((range) => coversDay(range, today))) return;
    try {
        // Required lazily so pure scripts can load this file without a Redis connection.
        const { addReconcileJob } = require('../../queues/attendance-v2-queue');
        await addReconcileJob({ adminId, dateKey: today });
    } catch (error) {
        logger.warn('holiday.reconcileEnqueueFailed', { adminId, reason: error.message });
    }
};

/** Every write that changes a calendar drops the template keys (they embed holiday ranges). */
const invalidateCalendars = (adminId) => cacheService.delPattern(cacheKeys.holiday.templatesPattern(adminId));

module.exports = {
    DEFAULT_NAME,
    ensureDefaultTemplate,
    loadCalendar,
    assignedTemplates,
    getOffKeysForPeople,
    getOffKeysForPerson,
    getCoverage,
    countAssigned,
    enqueueReconcileToday,
    invalidateCalendars,
    todayKey,
};
