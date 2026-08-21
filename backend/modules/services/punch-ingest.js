'use strict';
const crypto = require('crypto');
const PunchLogModel = require('../models/punch-log');
const BiometricMappingModel = require('../models/biometric-mapping');
const DeviceModel = require('../models/devices/device');
const { fetchWdmsTransactions } = require('./wdms-transaction');
const { publishPunchBatch } = require('./punch-publisher');
const { toWdmsEmpCode } = require('./wdms-employee');
const { getExpectedShiftsForDate } = require('./roster-lookup');
const { getStudentShiftMap } = require('./class-shift-lookup');
const { buildShiftWindows } = require('./attendance-status');
const { parseWdmsPunchTime } = require('../helpers/attendance-time');
const { toUtcMidnight, toDateKey } = require('../helpers/date-only');
const logger = require('../helpers/logger');

// THE FAST PATH. Pull a school-day's raw punches out of WDMS, keep only the punches that
// MEAN something, and land those in PunchLog. Still no status, no banding, no Holiday or
// Leave resolution — every derived value is the reconcile worker's job
// (services/attendance-reconcile.js).
//
// WHAT "MEAN SOMETHING" MEANS, and why the filtering happens HERE rather than at read time:
// a terminal reports every card tap. A child who taps at the gate, again on the way to
// assembly, and twice more at lunch produces four rows describing one arrival. Stored, they
// are four rows of landfill per person per day at 2M students — and they make the punch
// trail in the day-detail modal unreadable for the one human who ever looks at it. So:
//
//   staff / teacher -> the FIRST punch in the arrival window and the FIRST in the
//                      departure window. At most 2 rows per person per day.
//   student         -> the FIRST punch in the arrival window. At most 1 row per day.
//                      A school does not clock children out (see computeStatus).
//   no shift        -> nothing to measure against, so only the double-tap throttle applies
//                      and the rest is kept. reconcile then skips them and says so via
//                      its unshiftedPunchers warn.
//
// THREE CONSEQUENCES, all intended:
//   1. PunchLog is no longer a complete audit trail of taps. It is a record of the punches
//      that decided the day. DailyAttendance.punchCount is therefore 1 or 2, not a tap count.
//   2. A punch discarded because the person had no shift AT INGEST TIME cannot be recovered
//      by assigning them one later — only by re-pulling that window from WDMS.
//   3. This path is no longer zero-computation. It now costs a fixed ~5 extra indexed reads
//      per school-day (Roster scan + its Shift lookup, ClassShift scan + its Shift lookup,
//      Student class lookup) — independent of headcount AND of punch volume, which is what
//      keeps it viable during the 8-10am peak.
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

// The minimum gap between two punches by the same person that we are willing to treat as
// two separate events.
//
// This is the FALLBACK filter — it applies ONLY to people with no resolvable shift, because
// for everyone else filterToShiftWindows() below has already reduced the day to one arrival
// and (for staff) one departure. Hence the deliberately blunt default of 18000s / 5 hours:
// with no shift to measure against, the only defensible assumption is that a person's day
// contains one arrival and one departure separated by most of a working day.
//
// It must NOT be applied to shifted people. A 09:00-13:00 shift has its in and out punches
// four hours apart, and a 5-hour throttle would silently delete the departure.
const MIN_PUNCH_INTERVAL_MS = (Number(process.env.MIN_PUNCH_INTERVAL_SECONDS) || 18000) * 1000;

/**
 * Collapse device double-taps for people with NO shift assigned.
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

// `${personType}|${personId}` — the same composite key the reconcile worker batches on.
const personKeyOf = (personType, personId) => `${personType}|${personId}`;

/**
 * Reduce a school-day's mapped punches to the ones that decide the day.
 *
 * See the file header for the rules and for why this runs before insertMany. In short:
 * one arrival per person, plus one departure for staff and teachers, and nothing else.
 *
 * Grouped by the punch's OWN dateKey rather than the requested one — a terminal with a
 * skewed clock emits punches either side of midnight, and each calendar day has to resolve
 * against its own roster.
 *
 * Cost: one getStudentShiftMap for the whole call (ClassShift has no date dimension) plus
 * one getExpectedShiftsForDate per distinct dateKey — normally exactly one. Shift windows
 * are memoised per shift+day, so a 500-pupil class on one shift builds one pair of windows,
 * not 500.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {Array}  args.rows mapped PunchLog documents, unsorted
 * @returns {Promise<{ kept: Array, unshifted: Array, windowFilteredCount: Number,
 *                     unshiftedPersonCount: Number }>}
 *          `unshifted` is handed to throttlePunches by the caller; `kept` is already final.
 */
const filterToShiftWindows = async ({ adminId, rows }) => {
    const result = { kept: [], unshifted: [], windowFilteredCount: 0, unshiftedPersonCount: 0 };
    if (rows.length === 0) return result;

    // dateKey -> personKey -> that person's punches on that day.
    const byDateKey = new Map();
    for (const row of rows) {
        const dateKey = toDateKey(row.date);
        if (!byDateKey.has(dateKey)) byDateKey.set(dateKey, new Map());
        const byPerson = byDateKey.get(dateKey);
        const personKey = personKeyOf(row.personType, row.personId);
        if (!byPerson.has(personKey)) byPerson.set(personKey, []);
        byPerson.get(personKey).push(row);
    }

    // ClassShift is date-independent, so this resolves every day at once — and only for the
    // students who actually punched, never the whole roll.
    const studentIds = [...new Set(
        rows.filter((row) => row.personType === 'student').map((row) => row.personId),
    )];
    const studentShifts = await getStudentShiftMap(adminId, studentIds);

    // Memo key is shiftId + dateKey: the same shift on two different days is two different
    // pairs of absolute windows.
    const windowsByKey = new Map();

    for (const [dateKey, byPerson] of byDateKey) {
        const date = toUtcMidnight(dateKey);
        const rosterShifts = await getExpectedShiftsForDate(adminId, dateKey);

        for (const [personKey, personRows] of byPerson) {
            const { personType, personId } = personRows[0];

            const shift = personType === 'student'
                ? studentShifts.get(personId)
                : rosterShifts.get(personKey);

            let windows = null;
            if (shift) {
                const memoKey = `${shift._id.toString()}|${dateKey}`;
                if (!windowsByKey.has(memoKey)) {
                    // Returns null on an unparseable startTime/endTime and logs it. Such a
                    // person falls through to the unshifted bucket rather than losing every
                    // punch to a broken settings row.
                    windowsByKey.set(memoKey, buildShiftWindows({ date, shift, adminId }));
                }
                windows = windowsByKey.get(memoKey);
            }

            if (!windows) {
                result.unshifted.push(...personRows);
                result.unshiftedPersonCount += 1;
                continue;
            }

            // Ascending, so "first in the window" is a single forward scan.
            const sorted = [...personRows].sort((a, b) => a.punchTime - b.punchTime);

            // Half-open arrival window, matching the reconcile aggregation exactly: $lt on
            // inTo, so one punch can never be both the arrival and the departure.
            const firstIn = sorted.find((row) => (
                row.punchTime >= windows.inFrom && row.punchTime < windows.inTo
            )) || null;

            // FIRST punch of the departure window, not the last — once somebody has left,
            // a later tap on the way back through the gate is not a second departure.
            // Students never get one at all.
            const firstOut = personType === 'student' ? null : (sorted.find((row) => (
                row.punchTime >= windows.outFrom && row.punchTime <= windows.outTo
            )) || null);

            const keptForPerson = [firstIn, firstOut].filter(Boolean);
            result.kept.push(...keptForPerson);
            result.windowFilteredCount += personRows.length - keptForPerson.length;
        }
    }

    return result;
};

/**
 * Pull + insert one school-day of punches.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {String} args.dateKey "YYYY-MM-DD"
 * @returns {Promise<Object>} {
 *   skipped, reason, fetchedCount, insertedCount, duplicateCount, unmappedCount,
 *   invalidCount, windowFilteredCount, unshiftedPersonCount, throttledCount, dateKeys
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
        // Punches dropped because they fell outside their owner's shift windows.
        windowFilteredCount: 0,
        // People whose punches could not be windowed at all — no Roster row, no ClassShift
        // for their class, or an unparseable shift.
        unshiftedPersonCount: 0,
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

    // Reduce to the punches that decide the day, BEFORE the insert — see the file header.
    const {
        kept: shiftFiltered, unshifted, windowFilteredCount, unshiftedPersonCount,
    } = await filterToShiftWindows({ adminId, rows });

    result.windowFilteredCount = windowFilteredCount;
    result.unshiftedPersonCount = unshiftedPersonCount;

    // The double-tap throttle applies ONLY to the people we could not window. Running it
    // over the shifted set as well would delete the departure punch of any shift shorter
    // than MIN_PUNCH_INTERVAL_SECONDS.
    const { kept: throttledUnshifted, throttledCount } = throttlePunches(unshifted);
    result.throttledCount = throttledCount;

    if (windowFilteredCount > 0 || throttledCount > 0) {
        logger.info('punch-ingest.filteredPunches', {
            adminId, dateKey, windowFilteredCount, throttledCount,
        });
    }
    if (unshiftedPersonCount > 0) {
        // The ingest-side twin of attendance-reconcile's unshiftedPunchers warn. These
        // people's punches are stored but will produce no attendance until somebody gives
        // them a Roster row (staff/teacher) or maps their class to a shift (student).
        logger.warn('punch-ingest.unshiftedPunchers', {
            adminId, dateKey, unshiftedPersonCount,
        });
    }

    const punchRows = [...shiftFiltered, ...throttledUnshifted];
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
    // Against the FILTERED count, not the fetched one — a punch dropped as out-of-window or
    // as a double-tap was never offered to the index, so calling it a duplicate would
    // double-count it.
    result.duplicateCount = punchRows.length - insertedCount;
    // Only the days punches were actually kept for. dateKeySet covers every day the FETCHED
    // punches fell on, which after windowing can include a day nothing survived from —
    // enqueuing a reconcile for that day would be work with no input.
    result.dateKeys = [...new Set(punchRows.map((row) => toDateKey(row.date)))]
        .filter((key) => dateKeySet.has(key));

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
    filterToShiftWindows,
    throttlePunches,
};
