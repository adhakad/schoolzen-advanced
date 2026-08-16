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

module.exports = { connection, defaultJobOptions };
