'use strict';
const IORedis = require('ioredis');
const logger = require('../helpers/logger');

// ONE shared ioredis instance for every Queue and every Worker in the process.
// BullMQ classes that use blocking commands (Worker, QueueEvents) internally .duplicate()
// this connection, so sharing here still yields the connections those need — what it
// avoids is N independent client connections for N queues, which matters on a hosted Redis
// with a connection cap (Upstash's free tier included).
//
// maxRetriesPerRequest MUST be null: BullMQ requires it on any manually-supplied ioredis
// instance handed to a Worker, otherwise a transient Redis blip throws instead of retrying
// and kills the worker mid-job.

const buildRedisUrl = () => {
    if (process.env.REDIS_URL) return process.env.REDIS_URL;

    // Fall back to composing from the Upstash parts. Upstash requires TLS, hence rediss://.
    const { UPSTASH_REDIS_ENDPOINT, UPSTASH_REDIS_PASSWORD, REDIS_PORT } = process.env;
    if (UPSTASH_REDIS_ENDPOINT && UPSTASH_REDIS_PASSWORD) {
        const port = REDIS_PORT || 6379;
        return `rediss://default:${UPSTASH_REDIS_PASSWORD}@${UPSTASH_REDIS_ENDPOINT}:${port}`;
    }
    return null;
};

const redisUrl = buildRedisUrl();

if (!redisUrl) {
    // Loud and immediate — a missing Redis URL otherwise surfaces as jobs that silently
    // never run, which is the hardest failure mode to notice in a background pipeline.
    logger.error('queues.connection.missingRedisUrl', {
        hint: 'Set REDIS_URL, or UPSTASH_REDIS_ENDPOINT + UPSTASH_REDIS_PASSWORD, in backend/.env',
    });
    throw new Error('Redis is not configured — attendance queues cannot start');
}

const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

connection.on('error', (error) => logger.error('queues.connection.error', error));
connection.on('connect', () => logger.info('queues.connection.connected'));

// Shared job retention. removeOnFail keeps a 500-deep failure trail for debugging while
// stopping Redis from accumulating unbounded job history.
const defaultJobOptions = {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
};

// --- Idle Redis cost ---------------------------------------------------------------
// Both workers spend nearly the whole day idle: the sync queue gets one job per school per
// morning, the reconcile queue one per school per 5-minute tick. What that idle time costs
// in Redis commands is set entirely by the two knobs below.

// How long a worker's blocking fetch parks on Redis before returning empty and re-issuing.
// BullMQ's default is 5s = ~17k idle commands per worker per day. 30s cuts that ~6x.
// This costs NO latency: the blocking pop returns the instant a job is pushed, so raising
// it only affects how often an EMPTY queue is re-polled, never how fast a real job starts.
const DRAIN_DELAY_SECONDS = Number(process.env.WORKER_DRAIN_DELAY_SECONDS) || 30;

// The stalled check is a periodic Lua scan that runs on a timer whether or not anything is
// processing — at BullMQ's 30s default that is 2,880 scans per worker per day purely to
// notice a crash. This pipeline is explicitly allowed to lag (see CLAUDE.md's two-speed
// design), so recovering an orphaned job 5 minutes later instead of 30 seconds later costs
// nothing real and removes 90% of those scans.
const STALLED_INTERVAL_MS = Number(process.env.WORKER_STALLED_INTERVAL_MS) || 300000;

// BullMQ's skipStalledCheck is all-or-nothing — there is no "run only when needed" mode.
// Turning it ON removes the timer entirely, and with it the ONLY mechanism that recovers a
// job whose worker died mid-run: that job stays in the active set forever and the school
// silently never syncs. Left OFF by default for that reason; the raised interval above is
// where the Redis saving actually comes from. Flip it only for a short-lived, disposable
// worker where a lost job is acceptable.
const SKIP_STALLED_CHECK = process.env.WORKER_SKIP_STALLED_CHECK === 'true';

// Spread into BOTH Workers so the two never drift apart. `connection` is included here so
// every consumer picks up the shared instance by construction rather than by remembering to
// pass it.
const defaultWorkerOptions = {
    connection,
    drainDelay: DRAIN_DELAY_SECONDS,
    stalledInterval: STALLED_INTERVAL_MS,
    skipStalledCheck: SKIP_STALLED_CHECK,
};

module.exports = { connection, defaultJobOptions, defaultWorkerOptions };
