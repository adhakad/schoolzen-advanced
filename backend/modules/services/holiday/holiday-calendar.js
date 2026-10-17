'use strict';
const mongoose = require('mongoose');
const HolidayV2Model = require('../../models/holiday/holiday');
const HolidayTemplateV2Model = require('../../models/holiday/holiday-template');
const StaffV2Model = require('../../models/staff/staff');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const cacheService = require('../cache/cache.service');
const cacheKeys = require('../cache/cache-keys');
const { holidayKeysFor, coversDay } = require('../../helpers/holiday/holiday-rules');
const { toDateKey } = require('../../helpers/date-only');
const { nowWallClock } = require('../../helpers/attendance-time');
const logger = require('../../helpers/logger');

// A person's HOLIDAY calendar (holiday/templates.md): the dated holidays of their assigned
// template, computed from the template's CURRENT holidayIds, never a snapshot. No template →
// no dated holidays. Whether a day is worked at all is decided by
// services/calendar/working-day.js, which combines this with Leave and the Roster.
//
// Batched: any number of people resolve in two person queries plus one cached calendar per
// distinct template.

const { ObjectId } = mongoose.Types;

/** { ranges } for one template — `{adminId}:holiday:templates:{id}`. */
const loadCalendar = (adminId, templateId) => cacheService.wrap(
    cacheKeys.holiday.template(adminId, templateId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const template = await HolidayTemplateV2Model.findOne({ _id: templateId, adminId }, 'holidayIds').lean();
        if (!template) return null;
        const holidays = template.holidayIds.length
            ? await HolidayV2Model.find({ adminId, _id: { $in: template.holidayIds } }, 'startDateKey endDateKey').lean()
            : [];
        return { ranges: holidays.map((row) => ({ startDateKey: row.startDateKey, endDateKey: row.endDateKey })) };
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
 * Map<"type|id", Set<dateKey>> — the dated holidays in from..to for each person.
 * `people`: [{ personType, personId }]; students resolve through `sessionId`'s enrollment.
 */
// `assigned` (Map<"type|id", templateId|null>) lets a caller that already read the people
// (Overview's grid) skip the staff/enrollment re-read.
const getHolidayKeysForPeople = async (adminId, sessionId, people, fromKey, toKey, assigned = null) => {
    const result = new Map();
    if (!people.length) return result;
    if (!assigned) assigned = await assignedTemplates(adminId, sessionId, people);
    const keysByTemplate = new Map();
    await Promise.all([...new Set([...assigned.values()].filter(Boolean))].map(async (id) => {
        const calendar = await loadCalendar(adminId, id);
        keysByTemplate.set(id, holidayKeysFor(calendar ? calendar.ranges : [], fromKey, toKey));
    }));
    people.forEach((p) => {
        const key = `${p.personType}|${p.personId}`;
        result.set(key, keysByTemplate.get(assigned.get(key)) || new Set());
    });
    return result;
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
    loadCalendar,
    assignedTemplates,
    getHolidayKeysForPeople,
    countAssigned,
    enqueueReconcileToday,
    invalidateCalendars,
    todayKey,
};
