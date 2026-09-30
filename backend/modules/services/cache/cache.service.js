'use strict';
const logger = require('../../helpers/logger');

// THE cache service for every v2 module (additional-technical-considerations.md, "Caching
// layer"; module-optimization-guide.md §2). No module writes Redis get/set itself — it wraps
// its read in `cacheService.wrap(key, ttl, fetchFn)` and invalidates with `del`/`delPattern`
// in the same request as its DB write.
//
// Key convention: `{adminId}:{module}:{resource}[:{qualifier}]`.
//
// Values are JSON: an ObjectId comes back as its hex string and a Date as an ISO string, so a
// cached reader compares ids with String(...) — never `===` against an ObjectId.
//
// Storage: the shared Redis connection (queues/connection.js — required lazily, since that
// module throws at require-time without Redis), else an in-process Map. The fallback keeps a
// single-instance deployment correct; with several API instances, Redis is what keeps their
// invalidations consistent.

const LOCK_MS = 3000;
const LOCK_WAIT_STEP_MS = 100;

let redis;
const getClient = () => {
    if (redis !== undefined) return redis;
    try {
        redis = require('../../queues/connection').connection || null;
    } catch (error) {
        logger.warn('cache.redisUnavailable', { reason: error.message });
        redis = null;
    }
    return redis;
};

// --- in-process fallback --------------------------------------------------------------
const memory = new Map(); // key -> { value, expiresAt }
const memoryGet = (key) => {
    const hit = memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
        memory.delete(key);
        return null;
    }
    return hit.value;
};
const patternToRegExp = (pattern) =>
    new RegExp('^' + pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const get = async (key) => {
    const client = getClient();
    try {
        const raw = client ? await client.get(key) : memoryGet(key);
        return raw == null ? null : JSON.parse(raw);
    } catch (error) {
        // A cache failure is a miss, never an error the caller has to handle.
        logger.warn('cache.getFailed', { key, reason: error.message });
        return null;
    }
};

const set = async (key, value, ttlSeconds) => {
    const raw = JSON.stringify(value);
    const client = getClient();
    try {
        if (client) await client.set(key, raw, 'EX', ttlSeconds);
        else memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
    } catch (error) {
        logger.warn('cache.setFailed', { key, reason: error.message });
    }
};

const del = async (...keys) => {
    const client = getClient();
    try {
        if (client) { if (keys.length) await client.del(...keys); }
        else keys.forEach((key) => memory.delete(key));
    } catch (error) {
        logger.warn('cache.delFailed', { keys, reason: error.message });
    }
};

/** Bulk invalidate, e.g. `{adminId}:academic-setup:classes*`. SCAN, never KEYS. */
const delPattern = async (pattern) => {
    const client = getClient();
    try {
        if (!client) {
            const matcher = patternToRegExp(pattern);
            [...memory.keys()].forEach((key) => { if (matcher.test(key)) memory.delete(key); });
            return;
        }
        let cursor = '0';
        do {
            const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
            cursor = next;
            if (keys.length) await client.del(...keys);
        } while (cursor !== '0');
    } catch (error) {
        logger.warn('cache.delPatternFailed', { pattern, reason: error.message });
    }
};

/**
 * Cache-aside read with stampede protection (module-optimization-guide.md §2): on a miss,
 * only the caller that takes the short lock recomputes; the rest wait briefly and re-read
 * the now-warm key instead of all hitting Mongo at once. If the lock holder is slow, a
 * waiter computes it itself rather than waiting forever — correctness over efficiency.
 */
const wrap = async (key, ttlSeconds, fetchFn) => {
    const cached = await get(key);
    if (cached !== null) return cached;

    const client = getClient();
    let haveLock = true;
    if (client) {
        try {
            haveLock = (await client.set(`${key}:lock`, '1', 'PX', LOCK_MS, 'NX')) === 'OK';
        } catch (error) {
            haveLock = true;
        }
    }

    if (!haveLock) {
        for (let waited = 0; waited < LOCK_MS; waited += LOCK_WAIT_STEP_MS) {
            await sleep(LOCK_WAIT_STEP_MS);
            const warm = await get(key);
            if (warm !== null) return warm;
        }
    }

    try {
        const value = await fetchFn();
        if (value !== undefined) await set(key, value, ttlSeconds);
        return value;
    } finally {
        if (client && haveLock) client.del(`${key}:lock`).catch(() => {});
    }
};

// Tier TTLs (module-optimization-guide.md §2), in seconds.
const TTL = {
    NEAR_STATIC_30: 30 * 60,
    NEAR_STATIC_45: 45 * 60,
};

module.exports = { getClient, get, set, del, delPattern, wrap, TTL };
