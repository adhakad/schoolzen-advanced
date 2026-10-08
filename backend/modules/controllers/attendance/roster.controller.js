'use strict';
const RosterV2Model = require('../../models/attendance/roster');
const ClassShiftV2Model = require('../../models/attendance/class-shift');
const StaffV2Model = require('../../models/staff/staff');
const { ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/attendance.messages');
const { parseDateKey } = require('../../helpers/date-only');
const { loadClassIndex, titleCase } = require('../../helpers/student/student.utils');
const {
    MODULE, todayKey, monthDays, monthColumns, resolveSessionId, assertAssignableShift, enqueueReconcile, escapeRegExp,
} = require('../../helpers/attendance/context');
const { WEEK_OFF, loadShifts } = require('../../services/attendance-v2/shift-lookup');
const { logActivity } = require('../../services/activity-log.service');

// Roster (roster.md) — which shift each staff member works on each day (v2-roster, monthly
// snapshot), and which shift each class/stream/section follows (v2-class-shift).
//
// Past days are locked: attendance may already be recorded against them, so every write
// touches today onward only (the reference's "earlier months are locked" rule).

const MAX_PEOPLE = 1000;

const dateRangeInvalid = (message = messages.dateRangeInvalid()) => new ValidationError(message, {
    module: MODULE,
    code: 'DATE_RANGE_INVALID',
    fields: [{ field: 'month', message, code: 'DATE_RANGE_INVALID' }],
});

/** The editable days of a month: today onward, optionally narrowed by from/to. */
const editableDays = (month, fromDate, toDate) => {
    if (fromDate && toDate && fromDate > toDate) throw dateRangeInvalid();
    const today = todayKey();
    const days = monthDays(month).filter((key) => key >= today
        && (!fromDate || key >= fromDate)
        && (!toDate || key <= toDate));
    if (!days.length) throw dateRangeInvalid('Earlier months are locked — pick the current month or later.');
    return days;
};

/** Keep `shiftIds` equal to the distinct shifts in `days` (what the delete guard counts). */
const refreshShiftIds = (adminId, staffIds, year, month) => RosterV2Model.updateMany(
    { adminId, staffId: { $in: staffIds }, year, month },
    [{
        $set: {
            shiftIds: {
                $setDifference: [
                    { $setUnion: [{ $map: { input: { $objectToArray: { $ifNull: ['$days', {}] } }, in: '$$this.v' } }, []] },
                    [WEEK_OFF],
                ],
            },
            updatedAt: '$$NOW',
        },
    }]
);

/** Splits requested ids into this school's active staff and failed rows (shape 7). */
const partitionStaff = async (adminId, staffIds) => {
    const found = await StaffV2Model.find({ adminId, _id: { $in: staffIds }, status: 'active' }, { _id: 1 }).lean();
    const valid = new Set(found.map((row) => String(row._id)));
    const failed = staffIds
        .map((id, row) => ({ row, id }))
        .filter((entry) => !valid.has(entry.id))
        .map((entry) => ({ row: entry.row, id: entry.id, code: 'PERSON_NOT_FOUND', message: messages.personNotFound() }));
    if (!valid.size) {
        throw new ValidationError(messages.bulkRowsFailed(failed.length, staffIds.length), { module: MODULE, code: 'BULK_ROWS_FAILED', rows: failed });
    }
    return { valid: [...valid], failed };
};

const rosterStats = (rows, days, shifts) => {
    // "This week" side card: the current week's days that fall in this month.
    const today = todayKey();
    const weekDays = days.filter((col) => {
        const diff = (new Date(`${col.dateKey}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000;
        return diff >= -3 && diff <= 3;
    }).map((col) => col.dateKey);
    const probe = weekDays.includes(today) ? today : weekDays[0] || days[0].dateKey;
    const counts = new Map();
    let unassigned = 0;
    rows.forEach((row) => {
        const value = row.days[probe];
        if (!value || value === WEEK_OFF) { if (!value) unassigned += 1; return; }
        counts.set(value, (counts.get(value) || 0) + 1);
    });
    return {
        date: probe,
        byShift: shifts.filter((shift) => counts.has(shift._id)).map((shift) => ({ shiftId: shift._id, name: shift.name, count: counts.get(shift._id) })),
        unassigned,
    };
};

/** Staff date-grid: one staff scan + one roster scan for the month. */
let GetStaffRoster = async (req, res) => {
    const { adminId, month, departmentId, designationId, search } = req.query;
    const { year, month: monthNo } = parseDateKey(`${month}-01`);

    const filter = { adminId, status: 'active' };
    if (departmentId) filter.departmentId = departmentId;
    if (designationId) filter.designationId = designationId;
    if (search) {
        const pattern = new RegExp(escapeRegExp(search), 'i');
        filter.$or = [{ name: pattern }, { empCode: pattern }];
    }
    const staff = await StaffV2Model.find(filter, { name: 1, empCode: 1, designation: 1 }).sort({ name: 1 }).limit(MAX_PEOPLE + 1).lean();
    const truncated = staff.length > MAX_PEOPLE;
    const people = staff.slice(0, MAX_PEOPLE);

    const [rosters, shifts] = await Promise.all([
        RosterV2Model.find({ adminId, year, month: monthNo, staffId: { $in: people.map((row) => String(row._id)) } }, { staffId: 1, days: 1 }).lean(),
        loadShifts(adminId),
    ]);
    const byStaff = new Map(rosters.map((doc) => [doc.staffId, doc.days || {}]));
    const rows = people.map((row) => ({
        _id: String(row._id),
        name: row.name,
        empCode: row.empCode || null,
        designation: row.designation || null,
        days: byStaff.get(String(row._id)) || {},
    }));

    // Legend: only shifts actually in use this month (roster.md).
    const used = new Set();
    let weekOffUsed = false;
    rows.forEach((row) => Object.values(row.days).forEach((value) => {
        if (value === WEEK_OFF) weekOffUsed = true;
        else used.add(value);
    }));
    const days = monthColumns(month);
    return res.status(200).json({
        month,
        days,
        rows,
        truncated,
        legend: { shifts: shifts.filter((shift) => used.has(shift._id)), weekOff: weekOffUsed },
        stats: rosterStats(rows, days, shifts),
    });
};

/** Bulk assign: one bulkWrite for every selected person × every editable day. */
let AssignStaffRoster = async (req, res) => {
    const { adminId, staffIds, shiftId, month, weekdays, fromDate, toDate } = req.body;
    const days = editableDays(month, fromDate, toDate);
    await assertAssignableShift(adminId, shiftId);
    const { valid, failed } = await partitionStaff(adminId, staffIds);

    const set = { updatedAt: new Date() };
    days.forEach((key) => {
        set[`days.${key}`] = weekdays.includes(new Date(`${key}T00:00:00Z`).getUTCDay()) ? shiftId : WEEK_OFF;
    });
    const { year, month: monthNo } = parseDateKey(days[0]);
    await RosterV2Model.bulkWrite(valid.map((staffId) => ({
        updateOne: {
            filter: { adminId, staffId, year, month: monthNo },
            update: { $set: set, $setOnInsert: { createdAt: new Date() } },
            upsert: true,
        },
    })), { ordered: false });
    await refreshShiftIds(adminId, valid, year, monthNo);

    if (days[0] === todayKey()) await enqueueReconcile(adminId, days[0]);
    await logActivity(req, { module: MODULE, action: 'attendance.roster.assign', meta: { shiftId, month, people: valid.length, days: days.length } });

    return res.status(200).json({
        message: messages.rosterAssigned(valid.length, days.length),
        updated: valid.length,
        failed,
        warning: failed.length ? { code: 'BULK_ROWS_FAILED', message: messages.bulkRowsFailed(failed.length, staffIds.length) } : null,
    });
};

/** Delete Selected — clears today onward in the month; past days stay as recorded. */
let ClearStaffRoster = async (req, res) => {
    const { adminId, staffIds, month } = req.body;
    const days = editableDays(month);
    const { valid, failed } = await partitionStaff(adminId, staffIds);
    const unset = {};
    days.forEach((key) => { unset[`days.${key}`] = ''; });
    const { year, month: monthNo } = parseDateKey(days[0]);
    await RosterV2Model.updateMany({ adminId, staffId: { $in: valid }, year, month: monthNo }, { $unset: unset });
    await refreshShiftIds(adminId, valid, year, monthNo);

    if (days[0] === todayKey()) await enqueueReconcile(adminId, days[0]);
    await logActivity(req, { module: MODULE, action: 'attendance.roster.clear', meta: { month, people: valid.length } });
    return res.status(200).json({
        message: messages.rosterCleared(valid.length),
        updated: valid.length,
        failed,
        warning: failed.length ? { code: 'BULK_ROWS_FAILED', message: messages.bulkRowsFailed(failed.length, staffIds.length) } : null,
    });
};

// ---- Students: class / stream / section shifts --------------------------------------------

const targetKey = (target) => `${target.classId}|${target.streamId || ''}|${target.sectionId || ''}`;

/**
 * The Class → Stream → Section hierarchy (same nesting as Classes & Sections). A heading
 * with children has no checkbox — the shift is set at the leaf level.
 */
const buildHierarchy = (classIndex) => {
    const rows = [];
    [...classIndex.values()]
        .sort((a, b) => (a.doc.order ?? 0) - (b.doc.order ?? 0))
        .forEach((entry) => {
            const classId = String(entry.doc._id);
            const streams = entry.doc.hasStreams ? entry.doc.streams || [] : [];
            const sections = entry.doc.hasStreams ? [] : entry.doc.sections || [];
            const leafClass = !streams.length && !sections.length;
            rows.push({ key: `${classId}||`, level: 0, label: entry.label, classId, streamId: null, sectionId: null, selectable: leafClass });
            sections.forEach((section) => rows.push({
                key: `${classId}||${section._id}`, level: 1, label: `Section ${section.name}`, classId, streamId: null, sectionId: String(section._id), selectable: true,
            }));
            streams.forEach((stream) => {
                const streamSections = stream.sections || [];
                rows.push({
                    key: `${classId}|${stream._id}|`, level: 1, label: titleCase(stream.name), classId, streamId: String(stream._id), sectionId: null, selectable: !streamSections.length,
                });
                streamSections.forEach((section) => rows.push({
                    key: `${classId}|${stream._id}|${section._id}`, level: 2, label: `Section ${section.name}`, classId, streamId: String(stream._id), sectionId: String(section._id), selectable: true,
                }));
            });
        });
    return rows;
};

let GetClassShifts = async (req, res) => {
    const { adminId, session } = req.query;
    const sessionId = await resolveSessionId(adminId, session);
    const [classIndex, assigned, shifts] = await Promise.all([
        loadClassIndex(adminId),
        ClassShiftV2Model.find({ adminId, sessionId }, { classId: 1, streamId: 1, sectionId: 1, shiftId: 1 }).lean(),
        loadShifts(adminId),
    ]);
    const byKey = new Map(assigned.map((row) => [targetKey(row), row.shiftId]));
    const rows = buildHierarchy(classIndex).map((row) => ({ ...row, shiftId: row.selectable ? byKey.get(row.key) || null : null }));
    const used = new Set(rows.map((row) => row.shiftId).filter(Boolean));
    const byShift = shifts.filter((shift) => used.has(shift._id)).map((shift) => ({
        shiftId: shift._id, name: shift.name, count: rows.filter((row) => row.shiftId === shift._id).length,
    }));
    return res.status(200).json({
        rows,
        legend: { shifts: shifts.filter((shift) => used.has(shift._id)), weekOff: false },
        stats: { byShift, unassigned: rows.filter((row) => row.selectable && !row.shiftId).length },
    });
};

/** Each target must be a real leaf of this school's class tree; the rest fail per row. */
const partitionTargets = async (adminId, targets) => {
    const classIndex = await loadClassIndex(adminId);
    const leaves = new Set(buildHierarchy(classIndex).filter((row) => row.selectable).map((row) => row.key));
    const valid = [];
    const failed = [];
    targets.forEach((target, row) => {
        if (leaves.has(targetKey(target))) valid.push(target);
        else failed.push({ row, code: 'NOT_FOUND', message: messages.notFound() });
    });
    if (!valid.length) {
        throw new ValidationError(messages.bulkRowsFailed(failed.length, targets.length), { module: MODULE, code: 'BULK_ROWS_FAILED', rows: failed });
    }
    return { valid, failed };
};

let AssignClassShifts = async (req, res) => {
    const { adminId, session, targets, shiftId } = req.body;
    const sessionId = await resolveSessionId(adminId, session);
    await assertAssignableShift(adminId, shiftId);
    const { valid, failed } = await partitionTargets(adminId, targets);
    const now = new Date();
    const actor = String(req.user && req.user.id || 'admin');
    await ClassShiftV2Model.bulkWrite(valid.map((target) => ({
        updateOne: {
            filter: { adminId, sessionId, classId: target.classId, streamId: target.streamId || null, sectionId: target.sectionId || null },
            update: { $set: { shiftId, updatedBy: actor, updatedAt: now }, $setOnInsert: { createdAt: now } },
            upsert: true,
        },
    })), { ordered: false });
    await enqueueReconcile(adminId, todayKey());
    await logActivity(req, { module: MODULE, action: 'attendance.class-shift.assign', meta: { shiftId, classes: valid.length } });
    return res.status(200).json({
        message: messages.classShiftAssigned(valid.length),
        updated: valid.length,
        failed,
        warning: failed.length ? { code: 'BULK_ROWS_FAILED', message: messages.bulkRowsFailed(failed.length, targets.length) } : null,
    });
};

let ClearClassShifts = async (req, res) => {
    const { adminId, session, targets } = req.body;
    const sessionId = await resolveSessionId(adminId, session);
    const { valid, failed } = await partitionTargets(adminId, targets);
    await ClassShiftV2Model.deleteMany({
        adminId,
        sessionId,
        $or: valid.map((target) => ({ classId: target.classId, streamId: target.streamId || null, sectionId: target.sectionId || null })),
    });
    await enqueueReconcile(adminId, todayKey());
    await logActivity(req, { module: MODULE, action: 'attendance.class-shift.clear', meta: { classes: valid.length } });
    return res.status(200).json({
        message: messages.classShiftCleared(valid.length),
        updated: valid.length,
        failed,
        warning: failed.length ? { code: 'BULK_ROWS_FAILED', message: messages.bulkRowsFailed(failed.length, targets.length) } : null,
    });
};

module.exports = {
    GetStaffRoster,
    AssignStaffRoster,
    ClearStaffRoster,
    GetClassShifts,
    AssignClassShifts,
    ClearClassShifts,
    editableDays,
    buildHierarchy,
};
