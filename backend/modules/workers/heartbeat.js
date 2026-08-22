'use strict';
const logger = require('../helpers/logger');

// Worker liveness, written by the WORKER process and read by the API process.
//
// This replaces BullMQ's Queue.getWorkers(), which answers the same question by running Redis
// CLIENT LIST. That command is unreliable on managed Redis — Upstash, which this project runs
// on, does not report clients the way a self-hosted server does — so the old health endpoint
// could report zero workers while both were happily processing jobs. A key one side SETs and
// the other GETs needs no introspection and works on any Redis.

const KEY_PREFIX = 'heartbeat:';

// 20s beat against a 60s TTL: two beats may be missed before a worker is called dead, so a GC
// pause or a slow Redis round-trip doesn't produce a false alarm.
const INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS) || 20000;
const TTL_SECONDS = Number(process.env.WORKER_HEARTBEAT_TTL_SECONDS) || 60;

// Redis cost: 2 workers x 3 SET/min is ~8.6k commands/day, roughly doubling the idle traffic
// the 30s drainDelay in queues/connection.js was tuned down to. That is the price of knowing a
// worker died; both knobs are env-tunable if the bill matters more than the detection latency.

const heartbeatKey = (queueName) => `${KEY_PREFIX}${queueName}`;

const timers = new Map();

/**
 * Begin publishing liveness for one queue's worker. Called from inside start*Worker().
 * @param {String} queueName the BullMQ queue name, e.g. 'attendance-sync'
 */
const startHeartbeat = (queueName) => {
    if (timers.has(queueName)) return;

    // Lazy require, as everywhere else that touches Redis: queues/connection.js throws at
    // require-time when Redis is unconfigured.
    const { connection } = require('../queues/connection');

    const beat = async () => {
        try {
            // EX, not PERSIST: if this process dies the key expires on its own, so a dead
            // worker cannot leave a stale "alive" behind.
            await connection.set(heartbeatKey(queueName), Date.now(), 'EX', TTL_SECONDS);
        } catch (error) {
            logger.error('heartbeat.writeFailed', error);
        }
    };

    beat();
    const timer = setInterval(beat, INTERVAL_MS);
    // The heartbeat must never be the reason the process stays alive — without unref() a
    // finished worker would hang on this timer instead of exiting.
    if (typeof timer.unref === 'function') timer.unref();
    timers.set(queueName, timer);

    logger.info('heartbeat.started', { queueName, intervalMs: INTERVAL_MS, ttlSeconds: TTL_SECONDS });
};

/**
 * Read one queue's worker liveness. Called from the API process by the health endpoint.
 * @returns {Promise<{ alive: Boolean, lastBeatAgoMs: Number|null }>}
 */
const readHeartbeat = async (queueName) => {
    try {
        const { connection } = require('../queues/connection');
        const raw = await connection.get(heartbeatKey(queueName));
        if (!raw) return { alive: false, lastBeatAgoMs: null };

        const lastBeatAgoMs = Date.now() - Number(raw);
        return { alive: lastBeatAgoMs < TTL_SECONDS * 1000, lastBeatAgoMs };
    } catch (error) {
        logger.error('heartbeat.readFailed', error);
        return { alive: false, lastBeatAgoMs: null };
    }
};

/**
 * Stop every heartbeat. Called from worker.js's shutdown handler so the final beats don't race
 * the connection being closed underneath them.
 */
const stopHeartbeats = () => {
    for (const timer of timers.values()) clearInterval(timer);
    timers.clear();
};

module.exports = { startHeartbeat, readHeartbeat, stopHeartbeats, heartbeatKey };
