'use strict';
const DeviceModel = require('../../models/devices/device');
const PunchLogV2Model = require('../../models/attendance/punch-log');
const StaffV2Model = require('../../models/staff/staff');
const StudentProfileModel = require('../../models/student/student');
const { fetchWdmsTransactions } = require('../wdms-transaction');
const { toWdmsEmpCode } = require('../wdms-employee');
const { parseWdmsPunchTime } = require('../../helpers/attendance-time');
const { toDateKey } = require('../../helpers/date-only');
const { buildPunchHash } = require('../../helpers/attendance/status');
const liveStats = require('./live-stats');
const { publishPunches } = require('./publisher');
const logger = require('../../helpers/logger');
const cacheService = require('../cache/cache.service');
const cacheKeys = require('../cache/cache-keys');
const { nowWallClock } = require('../../helpers/attendance-time');

// "Last sync" (Overview's Sync now line) is kept a week — long after the next sync replaces it.
const LAST_SYNC_TTL_SECONDS = 7 * 24 * 60 * 60;

// THE FAST PATH (attendance-overview.md): pull a school-day's raw punches from WDMS, land
// them in v2 PunchLog with one insertMany, emit them over the socket. No status here — the
// reconcile worker computes that later.
//
// The ONE legacy read in the v2 Attendance module: the school's terminal serials come from
// the `device` collection (assignedSchoolId + active) — terminals have no v2 home yet. Every
// person is resolved against v2 Staff / v2 Student: the v2 card pipeline registers each
// person in WDMS under their own id (emp_code = the id's last 20 characters).

const pick = (source, keys) => {
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
};
const readEmpCode = (txn) => pick(txn, ['emp_code', 'employee_code', 'empCode', 'pin', 'user_id']);
const readPunchTime = (txn) => pick(txn, ['punch_time', 'punchTime', 'punch_time_str', 'upload_time', 'checktime']);
const readTerminalSn = (txn) => pick(txn, ['terminal_sn', 'terminalSn', 'sn', 'serial_number', 'device_sn']);

const getSchoolTerminalSns = async (adminId) => {
    const devices = await DeviceModel
        .find({ assignedSchoolId: adminId, status: 'active', active: true }, { terminalSn: 1, _id: 0 })
        .lean();
    return devices.map((device) => device.terminalSn).filter(Boolean);
};

/**
 * WDMS emp_code → v2 person. Two `_id`-only scans per run.
 *
 * Every v2 person is indexed, not only card holders: a person is enrolled on the terminal
 * under their own id (fingerprint / face as well as card), and filtering on `cardNumber` —
 * which no one in the live school had set — silently dropped EVERY punch at this step
 * (attendance-fix1.md §3e diagnosis).
 */
const getPersonIndex = async (adminId) => {
    const [staff, students] = await Promise.all([
        StaffV2Model.find({ adminId }, { _id: 1 }).lean(),
        StudentProfileModel.find({ adminId }, { _id: 1 }).lean(),
    ]);
    const index = new Map();
    staff.forEach((row) => index.set(toWdmsEmpCode(String(row._id)), { personType: 'staff', personId: String(row._id) }));
    students.forEach((row) => index.set(toWdmsEmpCode(String(row._id)), { personType: 'student', personId: String(row._id) }));
    return index;
};

/**
 * Pure: WDMS transactions → PunchLog rows. Unknown codes and unreadable times are dropped —
 * and counted on `rows.unmatched` (the distinct unknown codes), so a sync that maps nobody
 * is visible in the log instead of looking like "no punches".
 */
const toPunchRows = (adminId, transactions, index) => {
    const rows = [];
    const unmatched = new Set();
    transactions.forEach((txn) => {
        const code = readEmpCode(txn);
        const person = code != null ? index.get(toWdmsEmpCode(String(code))) : null;
        const punchTime = parseWdmsPunchTime(readPunchTime(txn));
        if (!person && code != null) unmatched.add(String(code));
        if (!person || !punchTime) return;
        rows.push({
            adminId,
            personType: person.personType,
            personId: person.personId,
            punchTime,
            dateKey: toDateKey(punchTime),
            terminalSn: readTerminalSn(txn) ? String(readTerminalSn(txn)) : null,
            punchHash: buildPunchHash(adminId, person.personId, punchTime),
        });
    });
    rows.unmatched = [...unmatched];
    return rows;
};

/** insertMany, ordered:false — a re-delivered punch collides on punchHash and is skipped. */
const insertPunchRows = async (rows) => {
    if (!rows.length) return [];
    try {
        return await PunchLogV2Model.insertMany(rows, { ordered: false });
    } catch (error) {
        const writeErrors = error.writeErrors || [];
        const genuine = writeErrors.filter((writeError) => (writeError.code || (writeError.err && writeError.err.code)) !== 11000);
        if (!writeErrors.length || genuine.length) {
            logger.error('attendance-v2.ingest.insertFailed', error);
            throw error;
        }
        return error.insertedDocs || [];
    }
};

/**
 * @returns {{ terminals: number, fetched: number, inserted: number, dateKeys: string[] }}
 */
const ingestDay = async (adminId, dateKey) => {
    const terminalSns = await getSchoolTerminalSns(adminId);
    if (!terminalSns.length) return { terminals: 0, fetched: 0, inserted: 0, dateKeys: [] };

    const [transactions, index] = await Promise.all([
        fetchWdmsTransactions({ startTime: `${dateKey} 00:00:00`, endTime: `${dateKey} 23:59:59`, terminalSns }),
        getPersonIndex(adminId),
    ]);
    const rows = toPunchRows(adminId, transactions, index);
    if (rows.unmatched.length) {
        logger.warn('attendance-v2.ingest.unmatchedEmpCodes', { adminId, dateKey, codes: rows.unmatched.slice(0, 20), count: rows.unmatched.length });
    }
    const inserted = await insertPunchRows(rows);
    const dateKeys = [...new Set(inserted.map((row) => row.dateKey))];

    if (inserted.length) {
        await publishPunches(adminId, inserted);
        await Promise.all(dateKeys.map((key) => liveStats.recompute(adminId, key)));
    }
    logger.info('attendance-v2.ingest.done', { adminId, dateKey, fetched: transactions.length, inserted: inserted.length });
    await cacheService.set(cacheKeys.attendance.lastSync(adminId), {
        at: nowWallClock().toISOString(), dateKey, fetched: transactions.length, inserted: inserted.length, unmatched: rows.unmatched.length,
    }, LAST_SYNC_TTL_SECONDS).catch((error) => logger.warn('attendance-v2.ingest.lastSyncWriteFailed', { adminId, reason: error.message }));
    return { terminals: terminalSns.length, fetched: transactions.length, inserted: inserted.length, unmatched: rows.unmatched.length, dateKeys };
};

module.exports = { ingestDay, getSchoolTerminalSns, toPunchRows, insertPunchRows };
