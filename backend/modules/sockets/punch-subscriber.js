'use strict';
const { CHANNEL } = require('../services/punch-publisher');
const { RECONCILE_CHANNEL } = require('../services/reconcile-publisher');
const logger = require('../helpers/logger');

// The API-side half of the seam services/punch-publisher.js describes.
//
// Ingestion runs in worker.js; the socket server runs in app.js. They are separate processes,
// so the worker publishes onto a Redis channel and this file re-emits each payload into the
// matching school's room. Nothing on the publish side changes — this is the additive half that
// punch-publisher.js's header comment was written against.
//
// Two channels now, one subscriber: raw punches (the fast path) and reconcile-complete (the
// slow path). They share a connection because a second SUBSCRIBE on the same client costs
// nothing — Redis pub/sub is push, so neither channel adds a polling loop.

const ROOM_PREFIX = 'school:';

/**
 * Fan a punch payload into the class rooms of the students it mentions.
 *
 * Only STUDENT punches have a class. Staff and teacher punches are school-wide — a class room
 * would have nothing to do with them, and the teacher panel that these rooms exist for shows
 * pupils, not colleagues.
 *
 * Each class receives ONLY its own punches, not the whole batch filtered client-side: the room
 * is the access boundary, so a class-scoped socket must never be sent another class's data.
 */
const emitToClassRooms = (io, payload) => {
    const byClass = new Map();
    for (const punch of payload.punches) {
        if (punch.personType !== 'student' || !punch.class) continue;
        if (!byClass.has(punch.class)) byClass.set(punch.class, []);
        byClass.get(punch.class).push(punch);
    }

    for (const [className, punches] of byClass) {
        io.to(`${ROOM_PREFIX}${payload.adminId}:class:${className}`)
            .emit('attendance:punch', { ...payload, count: punches.length, punches });
    }
};

let subscriber = null;

/**
 * Subscribe to the punch channel and fan every payload into its school's room.
 * NEVER throws: a Redis outage must cost the live nudge and nothing else — the REST calendar
 * and the whole HTTP API keep working, and a page refresh still shows the punches, which are
 * already committed to Mongo by the time anything is published.
 *
 * @param {Server} io the Socket.io server from socket-server.js
 */
const startPunchSubscriber = (io) => {
    if (!io || subscriber) return;

    try {
        // Required lazily, exactly as punch-publisher.js and controllers/attendance.js do:
        // queues/connection.js THROWS at require-time when Redis is not configured, and a
        // missing REDIS_URL must not take down the HTTP server on boot.
        const { connection } = require('../queues/connection');

        // .duplicate(), never the shared instance. An ioredis client in subscriber mode
        // refuses every normal command, and `connection` is what both BullMQ Queues run on —
        // subscribing on it would break enqueueing fleet-wide. This costs exactly one extra
        // long-lived connection and no polling commands: SUBSCRIBE is push, not a loop.
        subscriber = connection.duplicate();

        subscriber.on('error', (error) => logger.error('punch-subscriber.error', error));

        subscriber.subscribe(CHANNEL, RECONCILE_CHANNEL, (error) => {
            if (error) return logger.error('punch-subscriber.subscribeFailed', error);
            logger.info('punch-subscriber.subscribed', {
                channels: [CHANNEL, RECONCILE_CHANNEL],
            });
        });

        subscriber.on('message', (channel, raw) => {
            if (channel !== CHANNEL && channel !== RECONCILE_CHANNEL) return;
            try {
                const payload = JSON.parse(raw);
                // No adminId means no room to deliver to. Dropping it is correct: broadcasting
                // to every school is the one thing this layer must never do.
                if (!payload || !payload.adminId) return;

                // Reconcile is school-wide — its summary has no per-class dimension, and every
                // page that cares responds by refetching its own scope anyway.
                if (channel === RECONCILE_CHANNEL) {
                    io.to(`${ROOM_PREFIX}${payload.adminId}`).emit('attendance:reconciled', payload);
                    return;
                }

                io.to(`${ROOM_PREFIX}${payload.adminId}`).emit('attendance:punch', payload);
                if (Array.isArray(payload.punches)) emitToClassRooms(io, payload);
            } catch (error) {
                // One malformed message must not kill the listener for every school.
                logger.error('punch-subscriber.badPayload', error);
            }
        });
    } catch (error) {
        logger.error('punch-subscriber.startFailed', error);
        subscriber = null;
    }
};

/**
 * Release the subscriber connection on shutdown. Safe to call when it never started.
 */
const stopPunchSubscriber = async () => {
    if (!subscriber) return;
    try {
        await subscriber.quit();
    } catch (error) {
        logger.error('punch-subscriber.stopFailed', error);
    } finally {
        subscriber = null;
    }
};

module.exports = { startPunchSubscriber, stopPunchSubscriber, ROOM_PREFIX };
