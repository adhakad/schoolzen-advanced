'use strict';
const logger = require('../../helpers/logger');

// Worker → API seam for the v2 live layer, same design as services/punch-publisher.js: the
// worker publishes onto Redis, sockets/punch-subscriber.js re-emits into `school:<adminId>`.
// Separate channels from the legacy pipeline so a v2 page never sees legacy person ids.
// Payloads stay minimal (performance-principles.md, real-time rule). NEVER throws.

const PUNCH_CHANNEL = 'attendance-v2:punch';
const RECONCILE_CHANNEL = 'attendance-v2:reconciled';
const MAX_PAYLOAD_PUNCHES = 200;

const publish = async (channel, payload) => {
    try {
        const { connection } = require('../../queues/connection');
        await connection.publish(channel, JSON.stringify(payload));
    } catch (error) {
        logger.error('attendance-v2.publishFailed', error);
    }
};

/** punches: [{ personType, personId, punchTime, dateKey }] */
const publishPunches = (adminId, punches) => {
    if (!adminId || !punches.length) return Promise.resolve();
    return publish(PUNCH_CHANNEL, {
        adminId,
        punches: [...punches]
            .sort((a, b) => new Date(b.punchTime) - new Date(a.punchTime))
            .slice(0, MAX_PAYLOAD_PUNCHES)
            .map((punch) => ({ personId: punch.personId, personType: punch.personType, status: 'punched-in', time: punch.punchTime, dateKey: punch.dateKey })),
    });
};

const publishReconciled = (adminId, dateKey, personIds) =>
    publish(RECONCILE_CHANNEL, { adminId, dateKey, count: personIds.length });

module.exports = { PUNCH_CHANNEL, RECONCILE_CHANNEL, publishPunches, publishReconciled };
