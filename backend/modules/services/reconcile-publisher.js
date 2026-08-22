'use strict';
const logger = require('../helpers/logger');

// The SLOW path's half of the seam services/punch-publisher.js describes, and for the same
// reason: reconciliation runs in the WORKER process, the socket server runs in the API
// process, so the only way one can notify the other is a Redis channel.
//
// Why this exists at all: the fast path gives a cell its punch time immediately but genuinely
// cannot say whether 10:32 is Present or Late — that needs the shift, the roster, holidays and
// leave, which is the reconcile worker's job. Until this event existed the page had no way to
// learn that the worker had finished, so a freshly-punched cell sat showing a "pending" dot
// until somebody reloaded. This is the "and now it's decided" notification.
//
// Carries NO per-person detail on purpose. A school-day reconcile can touch every person in
// the school, and pushing that through pub/sub would be far larger than the refetch the page
// does in response. The client is told which school and which date changed and re-reads.

const RECONCILE_CHANNEL = 'attendance:reconciled';

/**
 * Fire-and-forget notification that a school+date has been reconciled.
 * NEVER throws: the DailyAttendance rows are already committed, so a Redis hiccup must not
 * fail a finished job. The next reconcile (or a page load) resolves it.
 *
 * @param {String} adminId
 * @param {String} dateKey "YYYY-MM-DD"
 * @param {Object} [summary] the worker's own counts, for the client to log/ignore
 */
const publishReconcileDone = async (adminId, dateKey, summary) => {
    if (!adminId || !dateKey) return;

    try {
        // Required lazily. queues/connection.js throws at require-time when Redis is not
        // configured, and that must not take down a process that merely touched this file.
        const { connection } = require('../queues/connection');

        await connection.publish(RECONCILE_CHANNEL, JSON.stringify({
            adminId,
            dateKey,
            summary: summary || null,
        }));
    } catch (error) {
        logger.error('reconcile-publisher.publishFailed', error);
    }
};

module.exports = { publishReconcileDone, RECONCILE_CHANNEL };
