'use strict';
const ClassShiftModel = require('../models/class-shift');
const ShiftModel = require('../models/shift');
const StudentModel = require('../models/student');
const { toUtcMidnight, toDateKey } = require('../helpers/date-only');
const { nowWallClock } = require('../helpers/attendance-time');
const logger = require('../helpers/logger');

// ---------------------------------------------------------------------------
// INTERNAL HELPER — queue the attendance recompute after a class's shift changes
//
// Same reasoning as controllers/roster.js's enqueueReconcileForDates: ClassShift supplies
// the baseline services/attendance-status.js measures a student's punch against, so
// re-pointing class 5 from an 08:00 shift to a 10:00 one silently invalidates every
// DailyAttendance row already written for that class. Without this the calendar keeps
// showing Late until something unrelated re-reconciles the day.
//
// Only TODAY is enqueued. ClassShift has no date dimension, so a change notionally affects
// every past day too — but back-dating a month of recomputes off a settings edit would
// rewrite history the school has already seen and signed off. Today is the day still being
// collected, and it is the one that matters.
//
// Never throws: the rows are already committed and the request already succeeded, so a
// Redis blip must not turn that into a 500.
// ---------------------------------------------------------------------------
const enqueueReconcileToday = async (adminId) => {
    if (!adminId) return false;
    try {
        // Lazily required for the reason spelled out in controllers/attendance.js:
        // queues/connection.js throws at require-time without Redis, and routes.js requires
        // this controller at boot.
        const { addReconcileJob } = require('../queues/attendance-reconcile-queue');
        // "Today" in the SCHOOL wall clock — a container running UTC would otherwise still
        // be on yesterday for the whole of the morning punch window.
        const dateKey = toDateKey(toUtcMidnight(nowWallClock()));
        await addReconcileJob(adminId, dateKey, { delay: 0 });
        logger.info('class-shift.reconcileEnqueued', { adminId, dateKey });
        return true;
    } catch (error) {
        logger.error('class-shift.reconcileEnqueueFailed', error);
        return false;
    }
};

// ---------------------------------------------------------------------------
// GET /classes/:adminId
// The classes this school actually runs, taken from its own student records.
//
// Deliberately NOT models/class.js: that collection is GLOBAL (no adminId) and always
// returns the same 15 rows, so it would offer a one-form-entry primary school the option of
// mapping a shift to class 12.
// ---------------------------------------------------------------------------
let GetClassOptions = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        const classes = await StudentModel.distinct('class', { adminId: adminId });
        // Numeric sort, then stringified — 200/201/202 (NURSERY/LKG/UKG) sort after the
        // numbered classes, which is wrong pedagogically but matches how every other list
        // in this codebase orders them.
        const sorted = classes
            .filter((value) => value !== null && value !== undefined)
            .sort((a, b) => Number(a) - Number(b))
            .map((value) => String(value));
        return res.status(200).json(sorted);
    } catch (error) {
        logger.error('class-shift.GetClassOptions', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// GET /:adminId
// Every class -> shift mapping for one school, with the shift joined in for display.
// ---------------------------------------------------------------------------
let GetAllClassShift = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        const classShiftList = await ClassShiftModel.find({ adminId: adminId }).lean();
        if (classShiftList.length === 0) return res.status(200).json([]);

        // One lookup for the distinct shifts, not one per row — a school with 12 classes on
        // 2 shifts should cost 2 documents, not 12 round-trips.
        const shiftIds = [...new Set(classShiftList.map((row) => row.shiftId))];
        const shiftList = await ShiftModel.find({ _id: { $in: shiftIds } }).lean();
        const shiftById = new Map(shiftList.map((shift) => [shift._id.toString(), shift]));

        const rows = classShiftList.map((row) => {
            const shift = shiftById.get(row.shiftId) || null;
            return {
                _id: row._id,
                adminId: row.adminId,
                class: row.class,
                shiftId: row.shiftId,
                shiftName: shift ? shift.name : '',
                startTime: shift ? shift.startTime : '',
                endTime: shift ? shift.endTime : '',
            };
        });
        // Numeric order so the table reads 1, 2, 10 rather than 1, 10, 2.
        rows.sort((a, b) => Number(a.class) - Number(b.class));
        return res.status(200).json(rows);
    } catch (error) {
        logger.error('class-shift.GetAllClassShift', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /bulk-assign   { adminId, shiftId, classes: [] }
// Point one or many classes at one shift. Upsert per class, so re-assigning a class that
// already has a shift moves it rather than failing on the unique index.
// ---------------------------------------------------------------------------
let BulkAssignClassShift = async (req, res, next) => {
    const { adminId, shiftId, classes } = req.body;
    try {
        if (!adminId || !shiftId) return res.status(400).json('School and shift are required!');
        if (!Array.isArray(classes) || classes.length === 0) {
            return res.status(400).json('Select at least one class!');
        }

        // The shift must belong to THIS school. Without this check a crafted request could
        // point one school's classes at another school's shift and quietly read its timings.
        const shift = await ShiftModel.findOne({ _id: shiftId, adminId: adminId }).lean();
        if (!shift) return res.status(404).json('Shift not found!');

        const now = new Date();
        // Normalise and de-duplicate before building ops: two spellings of the same class in
        // one payload would otherwise be two upserts racing on the same unique key.
        const classKeys = [...new Set(
            classes.map((value) => String(value).trim()).filter(Boolean)
        )];
        if (classKeys.length === 0) return res.status(400).json('Select at least one class!');

        const writeOps = classKeys.map((classKey) => ({
            updateOne: {
                filter: { adminId: adminId, class: classKey },
                update: {
                    $set: { shiftId: shiftId },
                    $setOnInsert: { createdAt: now },
                },
                upsert: true,
            },
        }));

        await ClassShiftModel.bulkWrite(writeOps, { ordered: false });
        await enqueueReconcileToday(adminId);

        return res.status(200).json('Shift assigned successfully.');
    } catch (error) {
        logger.error('class-shift.BulkAssignClassShift', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// DELETE /:id
// Unmapping a class is as consequential as mapping it — those students lose their baseline
// and drop out of DailyAttendance — so this recomputes too.
// ---------------------------------------------------------------------------
let DeleteClassShift = async (req, res, next) => {
    try {
        const id = req.params.id;
        const removed = await ClassShiftModel.findByIdAndRemove(id);
        if (!removed) return res.status(404).json('Class shift not found!');

        await enqueueReconcileToday(removed.adminId);
        return res.status(200).json('Class shift removed successfully.');
    } catch (error) {
        logger.error('class-shift.DeleteClassShift', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetClassOptions,
    GetAllClassShift,
    BulkAssignClassShift,
    DeleteClassShift,
}
