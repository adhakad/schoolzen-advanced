'use strict';
const { ValidationError, NotFoundError } = require('../../errors');
const ShiftV2Model = require('../../models/attendance/shift');
const messages = require('../messages/attendance.messages');
const { findSessionId, getActiveSession } = require('../academic-session/session-resolver');
const { toDateKey, toUtcMidnight } = require('../date-only');
const { nowWallClock } = require('../attendance-time');
const logger = require('../logger');

// Small shared pieces of the Attendance controllers: the school's "today", month maths on
// "YYYY-MM" keys, session resolution, the same-tenant shift check, and the lazy queue.
const MODULE = 'attendance';

const todayKey = () => toDateKey(nowWallClock());

/** Every "YYYY-MM-DD" in a "YYYY-MM" month. */
const monthDays = (monthKey) => {
    const [year, month] = monthKey.split('-').map(Number);
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: count }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Column headers for a month grid. */
const monthColumns = (monthKey) => {
    const today = todayKey();
    return monthDays(monthKey).map((dateKey) => ({
        dateKey,
        day: Number(dateKey.slice(8)),
        dow: DOW[toUtcMidnight(dateKey).getUTCDay()],
        isToday: dateKey === today,
        isFuture: dateKey > today,
    }));
};

/** The header's session label → its id, falling back to the active session. */
const resolveSessionId = async (adminId, label) => {
    if (label) {
        const id = await findSessionId(adminId, label);
        if (id) return String(id);
    }
    const active = await getActiveSession(adminId);
    if (!active) throw new ValidationError(messages.sessionMissing(), { module: MODULE, code: 'SESSION_MISSING' });
    return String(active._id);
};

/** SHIFT_NOT_FOUND for a missing OR another school's shift; SHIFT_INACTIVE for a retired one. */
const assertAssignableShift = async (adminId, shiftId) => {
    const shift = await ShiftV2Model.findOne({ _id: shiftId, adminId }).lean();
    if (!shift) {
        throw new NotFoundError(messages.shiftNotFound(), {
            module: MODULE,
            code: 'SHIFT_NOT_FOUND',
            fields: [{ field: 'shiftId', message: messages.shiftNotFound(), code: 'SHIFT_NOT_FOUND' }],
        });
    }
    if (shift.status !== 'active') {
        throw new ValidationError(messages.shiftInactive(), {
            module: MODULE,
            code: 'SHIFT_INACTIVE',
            fields: [{ field: 'shiftId', message: messages.shiftInactive(), code: 'SHIFT_INACTIVE' }],
        });
    }
    return shift;
};

const queue = () => require('../../queues/attendance-v2-queue');

/** Best-effort reconcile enqueue after a write — a Redis outage must not fail the save. */
const enqueueReconcile = async (adminId, dateKey) => {
    try {
        await queue().addReconcileJob({ adminId, dateKey });
        return true;
    } catch (error) {
        logger.warn('attendance-v2.enqueueReconcileFailed', { adminId, dateKey, reason: error.message });
        return false;
    }
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
    MODULE,
    todayKey,
    monthDays,
    monthColumns,
    resolveSessionId,
    assertAssignableShift,
    queue,
    enqueueReconcile,
    escapeRegExp,
};
