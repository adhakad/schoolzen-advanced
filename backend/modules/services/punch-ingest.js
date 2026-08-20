'use strict';
const crypto = require('crypto');
const PunchLogModel = require('../models/punch-log');
const BiometricMappingModel = require('../models/biometric-mapping');
const DeviceModel = require('../models/devices/device');
const { fetchWdmsTransactions } = require('./wdms-transaction');
const { publishPunchBatch } = require('./punch-publisher');
const { toWdmsEmpCode } = require('./wdms-employee');
const { parseWdmsPunchTime } = require('../helpers/attendance-time');
const { toUtcMidnight, toDateKey } = require('../helpers/date-only');
const logger = require('../helpers/logger');

// THE FAST PATH. Pull a school-day's raw punches out of WDMS and land them in PunchLog —
// nothing else. No status, no roster, no rule lookup: every derived value is the reconcile
// worker's job (services/attendance-reconcile.js). Keeping this path to "fetch, map, insert,
// notify" is what lets a 2000-school 8-10am peak feel instant while reconciliation lags.
//
// Reads Device ONLY by assignedSchoolId + terminalSn, per the Phase 5 isolation contract —
// it never touches salesPersonId/addedBy or any other sales-side field.

/**
 * sha1(adminId + personId + punchTime) — the dedupe guard behind PunchLog's unique index.
 * Separators matter: without them adminId "1" + personId "23" and "12" + "3" would collide.
 * punchTime is serialised via toISOString() so the hash is stable regardless of how the
 * Date was constructed.
 */
const buildPunchHash = (adminId, personId, punchTime) =>
    crypto.createHash('sha1').update(`${adminId}|${personId}|${punchTime.toISOString()}`).digest('hex');

// WDMS's transaction serializer was not verifiable against a live instance, and the field
// names differ between iclock versions. Same defensive read used by the Phase 5 terminal
// sync — try the known aliases in order rather than hard-failing on one spelling.
const pick = (source, keys) => {
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
};

const readEmpCode = (txn) => pick(txn, ['emp_code', 'employee_code', 'empCode', 'pin', 'user_id']);
const readPunchTime = (txn) => pick(txn, ['punch_time', 'punchTime', 'punch_time_str', 'upload_time', 'checktime']);
const readPunchState = (txn) => pick(txn, ['punch_state', 'punchState', 'punch_state_display', 'checktype']);
const readTerminalSn = (txn) => pick(txn, ['terminal_sn', 'terminalSn', 'sn', 'serial_number', 'device_sn']);

/**
 * Active terminals assigned to this school.
 * Both flags are required: `status` is the sales-side lifecycle ('unassigned'|'active'|
 * 'blocked') while `active` mirrors WDMS's own enabled flag. A device blocked on either
 * side must not be pulled from.
 * @returns {Promise<String[]>}
 */
const getSchoolTerminalSns = async (adminId) => {
    const devices = await DeviceModel
        .find({ assignedSchoolId: adminId, status: 'active', active: true }, { terminalSn: 1, _id: 0 })
        .lean();
    return devices.map((device) => device.terminalSn).filter(Boolean);
};

/**
 * Whole school's emp-code -> person index, loaded ONCE per ingest run.
 * A per-punch findOne would be thousands of round-trips per school per morning; this is a
 * single scan of a collection that holds one row per enrolled person.
 * @returns {Promise<Map<String, {personType: String, personId: String}>>}
 */
const getMappingIndex = async (adminId) => {
    const mappings = await BiometricMappingModel
        .find({ adminId }, { wdmsEmpCode: 1, personType: 1, personId: 1, _id: 0 })
        .lean();

    const index = new Map();
    for (const mapping of mappings) {
        const stored = String(mapping.wdmsEmpCode).trim();
        const person = {
            personType: mapping.personType,
            personId: mapping.personId,
        };
        index.set(stored, person);
        // WDMS caps emp_code at 20 chars, so a mapping stored as the full 24-char personId
        // is registered device-side under its last 20 (see toWdmsEmpCode) and punches come
        // back carrying that short form. Index both so either spelling resolves.
        const short = toWdmsEmpCode(stored);
        if (short && short !== stored) index.set(short, person);
    }
    return index;
};

// A person cannot meaningfully punch twice within this many seconds. Anything closer is the
// terminal double-reading one card swipe, or somebody tapping again because the beep was
// not loud enough.
const MIN_PUNCH_INTERVAL_MS = (Number(process.env.MIN_PUNCH_INTERVAL_SECONDS) || 60) * 1000;

/**
 * Collapse device double-taps.
 *
 * Compares each punch against the last ACCEPTED punch for that person, not the last one
 * seen. Five taps two seconds apart therefore collapse to one, not to three — chaining off
 * the last-seen punch would let a slow drip of near-duplicates all survive.
 *
 * Runs before insertMany rather than at reconcile time because a discarded punch has no
 * value at all: PunchLog is an audit trail of what people did, and six identical rows for
 * one swipe are noise in the punch-trail modal as much as they are rows in the database.
 *
 * The unique punchHash index already rejects EXACT re-sends across syncs; this catches the
 * different case of distinct-but-meaningless timestamps.
 *
 * @param {Array} rows PunchLog documents, unsorted
 * @returns {{ kept: Array, throttledCount: Number }}
 */
const throttlePunches = (rows) => {
    if (MIN_PUNCH_INTERVAL_MS <= 0 || rows.length < 2) return { kept: rows, throttledCount: 0 };

    // Sort by person then time so one linear pass sees each person's punches in order.
    const sorted = [...rows].sort((a, b) => {
        const keyA = `${a.personType}|${a.personId}`;
        const keyB = `${b.personType}|${b.personId}`;
        if (keyA !== keyB) return keyA < keyB ? -1 : 1;
        return a.punchTime - b.punchTime;
    });

    const kept = [];
    let currentPersonKey = null;
    let lastAcceptedTime = 0;

    for (const row of sorted) {
        const personKey = `${row.personType}|${row.personId}`;
        if (personKey !== currentPersonKey) {
            // First punch of a new person is always kept.
            currentPersonKey = personKey;
            lastAcceptedTime = row.punchTime.getTime();
            kept.push(row);
            continue;
        }
        if (row.punchTime.getTime() - lastAcceptedTime < MIN_PUNCH_INTERVAL_MS) continue;
        lastAcceptedTime = row.punchTime.getTime();
        kept.push(row);
    }

    return { kept, throttledCount: rows.length - kept.length };
};

/**
 * Pull + insert one school-day of punches.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {String} args.dateKey "YYYY-MM-DD"
 * @returns {Promise<Object>} {
 *   skipped, reason, fetchedCount, insertedCount, duplicateCount, unmappedCount,
 *   invalidCount, throttledCount, dateKeys
 * }
 * `dateKeys` is every calendar day the inserted punches actually fell on — usually just
 * `dateKey`, but a terminal with a skewed clock can emit a punch either side of midnight
 * and each affected day still needs reconciling.
 */
const ingestSchoolDay = async ({ adminId, dateKey }) => {
    const result = {
        skipped: false,
        reason: null,
        fetchedCount: 0,
        insertedCount: 0,
        duplicateCount: 0,
        unmappedCount: 0,
        invalidCount: 0,
        throttledCount: 0,
        dateKeys: [],
    };

    const terminalSns = await getSchoolTerminalSns(adminId);
    if (terminalSns.length === 0) {
        // Belt and braces — the cron scheduler already filters these out before enqueuing,
        // but a manual "Sync now" can reach here for a school with nothing installed.
        result.skipped = true;
        result.reason = 'no-active-device';
        return result;
    }

    const mappingIndex = await getMappingIndex(adminId);
    if (mappingIndex.size === 0) {
        // Devices exist but nobody is enrolled — every punch would be unmappable, so skip
        // the WDMS call entirely rather than fetching a page set we must throw away.
        result.skipped = true;
        result.reason = 'no-biometric-mapping';
        return result;
    }

    const transactions = await fetchWdmsTransactions({
        startTime: `${dateKey} 00:00:00`,
        endTime: `${dateKey} 23:59:59`,
        terminalSns,
    });
    result.fetchedCount = transactions.length;
    if (transactions.length === 0) return result;

    // Which of this school's terminals a punch is allowed to come from. WDMS's
    // terminal_sn filter is a server-side hint we do not fully control the semantics of;
    // re-checking locally guarantees one school can never ingest another's punches.
    const allowedTerminals = new Set(terminalSns);

    const rows = [];
    const dateKeySet = new Set();

    for (const txn of transactions) {
        const empCode = readEmpCode(txn);
        const person = empCode ? mappingIndex.get(String(empCode).trim()) : null;
        if (!person) {
            result.unmappedCount += 1;
            continue;
        }

        const punchTimeRaw = readPunchTime(txn);
        // NEVER `new Date(punchTimeRaw)` — see the header of helpers/attendance-time.js.
        const punchTime = parseWdmsPunchTime(punchTimeRaw);
        if (!punchTime) {
            result.invalidCount += 1;
            continue;
        }

        const terminalSn = readTerminalSn(txn);
        if (terminalSn && !allowedTerminals.has(String(terminalSn).trim())) {
            result.invalidCount += 1;
            continue;
        }

        const date = toUtcMidnight(punchTime);
        dateKeySet.add(toDateKey(date));

        rows.push({
            adminId,
            personType: person.personType,
            personId: person.personId,
            punchTime,
            punchTimeRaw: punchTimeRaw ? String(punchTimeRaw) : null,
            date,
            punchState: readPunchState(txn) != null ? String(readPunchState(txn)) : null,
            source: 'WDMS',
            terminalSn: terminalSn ? String(terminalSn).trim() : null,
            wdmsEmpCode: String(empCode).trim(),
            punchHash: buildPunchHash(adminId, person.personId, punchTime),
        });
    }

    if (result.unmappedCount > 0) {
        // Not an error — students/staff can punch before an admin has linked their card.
        // Worth surfacing though: a sudden spike means an enrolment step was missed.
        logger.warn('punch-ingest.unmappedPunches', {
            adminId, dateKey, unmappedCount: result.unmappedCount,
        });
    }

    if (rows.length === 0) return result;

    // Drop device double-taps BEFORE the insert — a discarded punch is noise in the audit
    // trail as much as it is a row in the database.
    const { kept: punchRows, throttledCount } = throttlePunches(rows);
    result.throttledCount = throttledCount;
    if (throttledCount > 0) {
        logger.info('punch-ingest.throttledPunches', { adminId, dateKey, throttledCount });
    }
    if (punchRows.length === 0) return result;

    // Idempotent by index, not by application code: re-running the same window just
    // collides on punchHash and the duplicates are dropped. ordered:false so one collision
    // does not abort the remaining inserts.
    let insertedCount = 0;
    try {
        const inserted = await PunchLogModel.insertMany(punchRows, { ordered: false });
        insertedCount = inserted.length;
    } catch (error) {
        // Mongoose surfaces the partial success on the thrown BulkWriteError.
        insertedCount = (error.insertedDocs && error.insertedDocs.length)
            || (error.result && error.result.nInserted)
            || 0;

        const writeErrors = (error.writeErrors || (error.result && error.result.getWriteErrors && error.result.getWriteErrors()) || []);
        const nonDuplicate = writeErrors.filter((writeError) => (writeError.code || (writeError.err && writeError.err.code)) !== 11000);
        if (writeErrors.length === 0 || nonDuplicate.length > 0) {
            // A genuine write failure (validation, disk, connection) — not our dedupe
            // guard doing its job. Let the job fail so BullMQ retries it.
            logger.error('punch-ingest.insertFailed', error);
            throw error;
        }
    }

    result.insertedCount = insertedCount;
    // Against the THROTTLED count, not the fetched one — a punch dropped as a double-tap
    // was never offered to the index, so calling it a duplicate would double-count it.
    result.duplicateCount = punchRows.length - insertedCount;
    result.dateKeys = [...dateKeySet];

    // Nothing new landed (a re-sync of a window we already hold, every row rejected by the
    // punchHash index). There is no changed data to reconcile and nothing to notify, so
    // both hand-offs below are skipped.
    if (insertedCount === 0) return result;

    // HAND-OFF TO THE SLOW PATH — this belongs HERE, not in the caller.
    //
    // It used to live in workers/attendance-sync-worker.js, which meant the enqueue was
    // coupled to one specific caller instead of to the insert itself: any other path that
    // ingested punches (a manual re-pull, a backfill script, a future webhook) committed
    // rows to PunchLog that nothing ever turned into DailyAttendance. Putting it directly
    // after the successful insertMany makes "punches landed" and "the day is queued for
    // recompute" a single fact with no way to have one without the other.
    //
    // Every calendar day the punches ACTUALLY fell on is enqueued, not just the requested
    // one — a terminal with a skewed clock emits punches either side of midnight, and the
    // neighbouring day needs recomputing too.
    //
    // Required lazily and never allowed to throw, exactly like publishPunchBatch below:
    // the PunchLog rows are already committed, so a Redis outage must not fail this job and
    // trigger a retry that re-ingests a window it already holds. The 5-minute reconcile
    // sweep in cron-attendance-service.js re-enqueues the day regardless, so a lost enqueue
    // costs latency, never correctness.
    try {
        const { addReconcileJob } = require('../queues/attendance-reconcile-queue');
        for (const affectedDateKey of result.dateKeys) {
            // jobId-deduped inside addReconcileJob, so calling it once per batch (or twice
            // for the same day) collapses into the single queued reconcile. THAT is the
            // debounce — there is no manual timer anywhere.
            await addReconcileJob(adminId, affectedDateKey);
        }
    } catch (queueError) {
        logger.error('punch-ingest.reconcileEnqueueFailed', queueError);
    }

    // The "real-time feel". Fire-and-forget and deliberately last: the rows are already
    // committed, so a publish failure costs a live nudge and nothing else.
    await publishPunchBatch(adminId, punchRows.map((row) => ({
        personType: row.personType,
        personId: row.personId,
        punchTime: row.punchTime,
        dateKey: toDateKey(row.date),
    })));

    return result;
};

module.exports = {
    ingestSchoolDay,
    buildPunchHash,
    getSchoolTerminalSns,
    getMappingIndex,
    throttlePunches,
};
