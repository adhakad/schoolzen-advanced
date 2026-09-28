'use strict';
const { ConflictError, ValidationError } = require('../errors');
const logger = require('../helpers/logger');

// Idempotency-Key support for v2 write endpoints (student/errors.md, "Double-submit needs a
// backend guard"; error-catalog-conventions.md, concurrency defenses).
//
// The client generates ONE key per form-open (a UUID) and sends it as `Idempotency-Key` on
// the submit. Within the TTL, a second request with the same key:
//   - while the first is still in flight → 409 DUPLICATE_SUBMIT (never a second student);
//   - after the first SUCCEEDED → the first response is replayed, not re-executed.
// Only 2xx responses are remembered. A request that fails (a 400 the person then fixes, a
// 409 duplicate Aadhar) releases the key, so correcting the form and resubmitting — which
// reuses the same key — goes through instead of replaying the old error.
//
// A request without the header is passed straight through: the guard is additive, never a
// new requirement a legacy or scripted caller could trip over.
//
// Storage: the shared Redis connection (queues/connection.js) when it is configured —
// required lazily, since that module throws at require-time without Redis — else an
// in-process Map, which still protects a single API instance.

const TTL_SECONDS = Number(process.env.IDEMPOTENCY_TTL_SECONDS) || 30;
const KEY_PATTERN = /^[A-Za-z0-9-]{8,100}$/;

let redis;
const getRedis = () => {
    if (redis !== undefined) return redis;
    try {
        redis = require('../queues/connection').connection;
    } catch (error) {
        logger.warn('idempotency.redisUnavailable', { reason: error.message });
        redis = null;
    }
    return redis;
};

// In-process fallback: key -> { value, expiresAt }.
const memory = new Map();
const memoryStore = {
    async setIfAbsent(key, value) {
        const now = Date.now();
        const hit = memory.get(key);
        if (hit && hit.expiresAt > now) return false;
        memory.set(key, { value, expiresAt: now + TTL_SECONDS * 1000 });
        return true;
    },
    async get(key) {
        const hit = memory.get(key);
        return hit && hit.expiresAt > Date.now() ? hit.value : null;
    },
    async set(key, value) {
        memory.set(key, { value, expiresAt: Date.now() + TTL_SECONDS * 1000 });
    },
    async del(key) {
        memory.delete(key);
    },
};
const redisStore = (client) => ({
    async setIfAbsent(key, value) {
        return (await client.set(key, value, 'EX', TTL_SECONDS, 'NX')) === 'OK';
    },
    get: (key) => client.get(key),
    set: (key, value) => client.set(key, value, 'EX', TTL_SECONDS),
    del: (key) => client.del(key),
});
const getStore = () => {
    const client = getRedis();
    return client ? redisStore(client) : memoryStore;
};

/**
 * Must run AFTER assertAdminScope (the key is scoped per school via req.adminId) and, on
 * multipart routes, after the upload middleware.
 */
const idempotency = (module) => {
    return async (req, res, next) => {
        const header = req.get('Idempotency-Key');
        if (!header) return next();
        if (!KEY_PATTERN.test(header)) {
            return next(new ValidationError('Invalid Idempotency-Key header.', {
                module,
                fields: [{ field: 'Idempotency-Key', message: 'Must be 8-100 letters, digits or dashes.' }],
            }));
        }

        const key = `idem:${req.adminId || 'anon'}:${req.method}:${req.baseUrl}${req.path}:${header}`;
        const store = getStore();

        try {
            const claimed = await store.setIfAbsent(key, JSON.stringify({ state: 'pending' }));
            if (!claimed) {
                const stored = JSON.parse((await store.get(key)) || '{"state":"pending"}');
                if (stored.state === 'done') {
                    res.set('Idempotent-Replayed', 'true');
                    return res.status(stored.status).json(stored.body);
                }
                return next(new ConflictError('This request is already being processed.', {
                    module,
                    code: 'DUPLICATE_SUBMIT',
                }));
            }
        } catch (error) {
            // The guard is a safety net: a store failure must never block a real submit.
            logger.warn('idempotency.storeFailed', { reason: error.message });
            return next();
        }

        // Remember the response body once it is sent; settle the key when the response ends.
        let responseBody;
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            responseBody = body;
            return originalJson(body);
        };
        let settled = false;
        const settle = (succeeded) => {
            if (settled) return;
            settled = true;
            const write = succeeded
                ? store.set(key, JSON.stringify({ state: 'done', status: res.statusCode, body: responseBody }))
                : store.del(key);
            Promise.resolve(write).catch((error) => logger.warn('idempotency.settleFailed', { reason: error.message }));
        };
        res.on('finish', () => settle(res.statusCode >= 200 && res.statusCode < 300));
        // A client that disconnects before the response releases the key, rather than
        // leaving it "pending" and blocking the retry for the rest of the TTL.
        res.on('close', () => { if (!res.writableFinished) settle(false); });
        return next();
    };
};

module.exports = idempotency;
