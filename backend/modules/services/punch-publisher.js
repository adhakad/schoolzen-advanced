'use strict';
const logger = require('../helpers/logger');

// The seam between the FAST path and Phase 7's Socket.io layer.
//
// Ingestion runs in the WORKER process; the socket server will run in the API process.
// They cannot call each other in-process, so the worker publishes onto a Redis channel and
// Phase 7's API-side subscriber re-emits into the `school:<adminId>` room. Phase 7 is then
// purely additive: a subscriber + an io.emit, with nothing in this file or the ingest path
// needing to change.
//
// This is the ONLY non-BullMQ use of Redis in the pipeline, and it stores nothing — pub/sub
// is fire-and-forget, so it does not turn Redis into the general-purpose cache the
// architecture doc rules out (config/config.js documents the same boundary).

const CHANNEL = 'attendance:punch';

// A punch batch during the 8-10am peak can be thousands of rows. The live board only ever
// renders the most recent arrivals, so cap the payload rather than pushing a whole school
// day through pub/sub.
const MAX_PAYLOAD_PUNCHES = 200;

/**
 * Fire-and-forget notification that new punches landed for a school.
 * NEVER throws: a Redis hiccup must not fail an ingest run whose PunchLog rows are already
 * committed. The punches are in Mongo either way — only the live nudge is lost, and the
 * next batch (or a page refresh) resolves it.
 *
 * @param {String} adminId
 * @param {Array}  punches [{ personType, personId, punchTime, dateKey, class }, ...]
 *                 `class` is the student's class, or null for staff/teacher — it is what
 *                 sockets/punch-subscriber.js fans a punch into its class room by.
 */
const publishPunchBatch = async (adminId, punches) => {
    if (!adminId || !Array.isArray(punches) || punches.length === 0) return;

    try {
        // Required lazily. queues/connection.js throws at require-time when Redis is not
        // configured, and that must not take down a process that merely touched this file.
        const { connection } = require('../queues/connection');

        const payload = {
            adminId,
            count: punches.length,
            // Newest first — the live board prepends.
            punches: [...punches]
                .sort((a, b) => b.punchTime - a.punchTime)
                .slice(0, MAX_PAYLOAD_PUNCHES)
                .map((punch) => ({
                    personType: punch.personType,
                    personId: punch.personId,
                    punchTime: punch.punchTime,
                    dateKey: punch.dateKey,
                    class: punch.class || null,
                })),
        };

        await connection.publish(CHANNEL, JSON.stringify(payload));
    } catch (error) {
        logger.error('punch-publisher.publishFailed', error);
    }
};

module.exports = { publishPunchBatch, CHANNEL };
