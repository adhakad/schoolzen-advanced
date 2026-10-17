'use strict';
const ShiftV2Model = require('../../models/attendance/shift');
const RosterV2Model = require('../../models/attendance/roster');
const ClassShiftV2Model = require('../../models/attendance/class-shift');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/attendance.messages');
const cacheInvalidation = require('../../helpers/attendance/cache-invalidation');
const { shiftDuplicate, rethrowShiftDuplicate } = require('../../helpers/attendance/duplicate-key');
const { isTimeRangeValid } = require('../../helpers/attendance/status');
const { COLLATION, matcher, paginate } = require('../../helpers/staff/lookups');
const { loadShifts } = require('../../services/attendance-v2/shift-lookup');
const { logActivity } = require('../../services/activity-log.service');
const { withTransaction } = require('../../helpers/with-transaction');

const MODULE = 'attendance';
const ENTITY = 'Shift';
const STAFF_ONLY = ['halfDayAfterMinutes', 'earlyOutMinutes', 'lateOutMinutes'];

// Manage Shifts — a small CRUD list read from the near-static cache. Typed throws only.

const notFound = (id) => new NotFoundError(messages.notFound(), { module: MODULE, context: { id } });

/** People (distinct staff on any roster) and classes currently pointing at each shift. */
const usageCounts = async (adminId, shiftIds) => {
    const [roster, classes] = await Promise.all([
        RosterV2Model.aggregate([
            { $match: { adminId, shiftIds: { $in: shiftIds } } },
            { $unwind: '$shiftIds' },
            { $match: { shiftIds: { $in: shiftIds } } },
            { $group: { _id: '$shiftIds', staff: { $addToSet: '$staffId' } } },
            { $project: { count: { $size: '$staff' } } },
        ]),
        ClassShiftV2Model.aggregate([
            { $match: { adminId, shiftId: { $in: shiftIds } } },
            { $group: { _id: '$shiftId', count: { $sum: 1 } } },
        ]),
    ]);
    const counts = new Map(shiftIds.map((id) => [id, { people: 0, classes: 0 }]));
    roster.forEach((row) => { if (counts.has(row._id)) counts.get(row._id).people = row.count; });
    classes.forEach((row) => { if (counts.has(row._id)) counts.get(row._id).classes = row.count; });
    return counts;
};

let GetShifts = async (req, res) => {
    const { adminId, search, page, limit } = req.query;
    const all = await loadShifts(adminId);
    const matches = matcher(search);
    const result = paginate(all.filter((row) => matches(row.name)), page, limit);
    const counts = await usageCounts(adminId, result.rows.map((row) => row._id));
    result.rows = result.rows.map((row) => ({ ...row, ...counts.get(row._id) }));
    result.summary = {
        total: all.length,
        active: all.filter((row) => row.status === 'active').length,
        inactive: all.filter((row) => row.status === 'inactive').length,
    };
    return res.status(200).json(result);
};

/** Every shift — Roster's assign dropdown and the grid's legend (same cached key). */
let GetShiftOptions = async (req, res) => {
    const rows = await loadShifts(req.query.adminId);
    return res.status(200).json({ rows });
};

/** Business rules Joi can't express with a code: start < end, staff-only fields. */
const assertShiftRules = (body) => {
    if (!isTimeRangeValid(body.startTime, body.endTime)) {
        throw new ValidationError(messages.shiftTimeRangeInvalid(), {
            module: MODULE,
            code: 'SHIFT_TIME_RANGE_INVALID',
            fields: [{ field: 'endTime', message: messages.shiftTimeRangeInvalid(), code: 'SHIFT_TIME_RANGE_INVALID' }],
        });
    }
    if (body.scope === 'students') {
        const supplied = STAFF_ONLY.filter((field) => body[field] != null);
        if (supplied.length) {
            const message = 'This field only applies to staff shifts.';
            throw new ValidationError(message, {
                module: MODULE,
                code: 'SHIFT_FIELD_NOT_APPLICABLE',
                fields: supplied.map((field) => ({ field, message, code: 'SHIFT_FIELD_NOT_APPLICABLE' })),
            });
        }
    }
};

const assertNameFree = async (adminId, name, excludeId) => {
    const query = { adminId, name };
    if (excludeId) query._id = { $ne: excludeId };
    if (await ShiftV2Model.findOne(query, '_id').collation(COLLATION).lean()) throw shiftDuplicate();
};

const shiftFields = (body) => ({
    name: body.name,
    startTime: body.startTime,
    endTime: body.endTime,
    earlyInMinutes: body.earlyInMinutes,
    graceMinutes: body.graceMinutes,
    halfDayAfterMinutes: body.halfDayAfterMinutes,
    earlyOutMinutes: body.earlyOutMinutes,
    lateOutMinutes: body.lateOutMinutes,
    status: body.status,
});

let CreateShift = async (req, res) => {
    const { adminId } = req.body;
    assertShiftRules(req.body);
    await assertNameFree(adminId, req.body.name);
    const actor = String(req.user && req.user.id || 'admin');
    const shift = await ShiftV2Model
        .create({ adminId, ...shiftFields(req.body), createdBy: actor, updatedBy: actor })
        .catch(rethrowShiftDuplicate);
    await cacheInvalidation.onShiftsChanged(adminId);
    return res.status(200).json({ message: success.created(ENTITY), shift });
};

let UpdateShift = async (req, res) => {
    const { adminId } = req.body;
    assertShiftRules(req.body);
    // Another school's shift reads exactly like a missing one. The name check runs alongside
    // (it excludes this id either way), so not-found still wins over a duplicate name.
    const [shift, nameCheck] = await Promise.all([
        ShiftV2Model.findOne({ _id: req.params.id, adminId }),
        assertNameFree(adminId, req.body.name, req.params.id).then(() => null, (error) => error),
    ]);
    if (!shift) throw notFound(req.params.id);
    if (nameCheck) throw nameCheck;

    const before = shiftFields(shift);
    Object.assign(shift, shiftFields(req.body), { updatedBy: String(req.user && req.user.id || 'admin'), updatedAt: new Date() });
    // The change and its log entry commit together; the cache is cleared once it has.
    await withTransaction(async (dbSession) => {
        await shift.save({ session: dbSession }).catch(rethrowShiftDuplicate);
        await logActivity(req, { module: MODULE, action: 'attendance.shift.update', targetId: String(shift._id), changes: { before, after: shiftFields(shift) } }, dbSession);
    });
    await cacheInvalidation.onShiftsChanged(adminId);
    return res.status(200).json({ message: success.updated(ENTITY), shift });
};

/** In use → SHIFT_IN_USE with both counts in the payload (errors.md shape 6). Never forced. */
let DeleteShift = async (req, res) => {
    const { adminId } = req.query;
    const [shift, usage] = await Promise.all([
        ShiftV2Model.findOne({ _id: req.params.id, adminId }, 'name').lean(),
        usageCounts(adminId, [String(req.params.id)]),
    ]);
    if (!shift) throw notFound(req.params.id);
    const id = String(shift._id);

    const counts = usage.get(id);
    if (counts.people || counts.classes) {
        throw new ConflictError(messages.shiftInUse(counts.people, counts.classes), {
            module: MODULE,
            code: 'SHIFT_IN_USE',
            context: counts,
            rows: [{ row: 0, code: 'SHIFT_IN_USE', people: counts.people, classes: counts.classes }],
        });
    }

    await withTransaction(async (dbSession) => {
        await ShiftV2Model.deleteOne({ _id: id, adminId }, { session: dbSession });
        await logActivity(req, { module: MODULE, action: 'attendance.shift.delete', targetId: id, meta: { name: shift.name } }, dbSession);
    });
    await cacheInvalidation.onShiftsChanged(adminId);
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = {
    GetShifts,
    GetShiftOptions,
    CreateShift,
    UpdateShift,
    DeleteShift,
    usageCounts,
};
