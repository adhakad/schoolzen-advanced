'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');

// Why this file exists:
//
// Mongoose's autoIndex builds indexes in the BACKGROUND and swallows the failure — it emits
// it on the model rather than throwing. So a unique index that cannot be built (because the
// collection already holds rows violating it) leaves the app running with NO index at all,
// and every write the index was supposed to reject goes straight through. That is exactly
// what happened to punch-logs: duplicate punchHash rows accumulated even though
// models/punch-log.js declares `{ punchHash: 1 }, { unique: true }`.
//
// syncIndexes() is the fix: it reconciles each collection's actual indexes against the
// schema on every startup — creating what is missing, dropping what the schema no longer
// declares — and it reports what it did instead of hiding it.

const MODELS_DIR = path.join(__dirname, '..', 'models');
const DELETE_BATCH_SIZE = 1000;

/**
 * syncIndexes() only covers models already registered on the connection. app.js registers
 * models as a side effect of require('./routes'), which pulls in most but not provably all
 * of them — a model whose only consumer is a worker or a cron job would silently never get
 * its indexes synced. Requiring every file under models/ makes "all model indexes" true by
 * construction rather than by accident of the require graph.
 */
const loadAllModels = () => {
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                try {
                    // Idempotent to require (Node caches them) — this only ever compiles
                    // models the running app had not already pulled in.
                    require(full);
                } catch (error) {
                    // Two model files can claim the same mongoose model name, and the
                    // second one to load throws OverwriteModelError. models/payment.js and
                    // models/customer-payment.js both register 'Payment'; routes.js mounts
                    // only the former, so it wins and this skips the dead one. Skipping is
                    // right either way — a file that cannot load has no indexes to sync,
                    // and one bad file must not cost every other model its sync.
                    logger.warn('indexes.modelLoadSkipped', {
                        file: path.relative(MODELS_DIR, full),
                        reason: error.message,
                    });
                }
            }
        }
    };

    walk(MODELS_DIR);
    return Object.keys(mongoose.connection.models).length;
};

/**
 * true  — the collection already carries a unique index on punchHash.
 * false — it has data but no such index (the state that let duplicates in).
 * null  — the collection does not exist yet; nothing to repair.
 */
const hasUniquePunchHashIndex = async (model) => {
    try {
        const indexes = await model.collection.indexes();
        return indexes.some((index) => index.unique === true
            && index.key
            && index.key.punchHash === 1
            && Object.keys(index.key).length === 1);
    } catch (error) {
        // 26 = NamespaceNotFound: the collection has never been written to.
        if (error.code === 26 || /ns does not exist/i.test(error.message || '')) return null;
        throw error;
    }
};

/**
 * The one-time migration, and the reason the unique index could not be built before.
 *
 * Deletes rows sharing a punchHash with an older row, keeping the earliest _id of each
 * group. These are duplicates BY DEFINITION — punchHash is sha1(adminId|personId|punchTime),
 * so an identical hash means the same person's same punch at the same instant, re-ingested.
 * Nothing distinguishable is lost.
 *
 * Guarded so it is genuinely one-time: it runs ONLY when the unique index is absent. Once
 * the index exists the database itself prevents duplicates, so this scan never runs again.
 */
const dropDuplicatePunchLogs = async (model) => {
    const cursor = model.collection.aggregate([
        { $group: { _id: '$punchHash', keep: { $min: '$_id' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ], { allowDiskUse: true });

    let pending = [];
    let deletedCount = 0;
    let groupCount = 0;

    const flush = async () => {
        if (pending.length === 0) return;
        const { deletedCount: removed } = await model.collection.deleteMany({ _id: { $in: pending } });
        deletedCount += removed;
        pending = [];
    };

    for await (const group of cursor) {
        groupCount += 1;
        for (const id of group.ids) {
            if (!id.equals(group.keep)) pending.push(id);
        }
        if (pending.length >= DELETE_BATCH_SIZE) await flush();
    }
    await flush();

    return { groupCount, deletedCount };
};

/**
 * The explicit punch-logs migration: purge the duplicates blocking the unique index, then
 * rebuild that collection's indexes from the schema. Runs BEFORE the global sync so the
 * global pass finds punch-logs already clean instead of reporting it as the one failure.
 */
const repairPunchLogIndexes = async () => {
    const PunchLogModel = require('../models/punch-log');
    const collectionName = PunchLogModel.collection.collectionName;

    const hasIndex = await hasUniquePunchHashIndex(PunchLogModel);
    if (hasIndex === true) {
        logger.info('indexes.punchLog.alreadyUnique', { collectionName });
        return;
    }

    if (hasIndex === false) {
        // The index is missing on a collection that already has data. Clear the violating
        // rows before asking Mongo to build it, or the build fails with E11000 and we are
        // right back where we started.
        logger.warn('indexes.punchLog.uniqueIndexMissing', { collectionName });
        const { groupCount, deletedCount } = await dropDuplicatePunchLogs(PunchLogModel);
        logger.warn('indexes.punchLog.duplicatesRemoved', { collectionName, groupCount, deletedCount });
    }

    const droppedIndexes = await PunchLogModel.syncIndexes();
    logger.info('indexes.punchLog.synced', { collectionName, droppedIndexes });
};

/**
 * Called once from app.js after the connection opens. Never throws: a failed index sync
 * must not stop the API from serving, and the log is the record.
 */
const ensureIndexes = async () => {
    if (global.global_config.indexes && global.global_config.indexes.skipSync) {
        logger.warn('indexes.sync.skipped', { reason: 'SKIP_INDEX_SYNC=true' });
        return;
    }

    try {
        const modelCount = loadAllModels();

        await repairPunchLogIndexes();

        // continueOnError so one model's unbuildable index (another collection with rows
        // violating a unique constraint) does not abort the sync for every model registered
        // after it — each failure is reported per-model below instead.
        const results = await mongoose.connection.syncIndexes({ continueOnError: true });

        const failed = {};
        const dropped = {};
        for (const [modelName, result] of Object.entries(results)) {
            if (result instanceof Error) {
                failed[modelName] = result.message;
            } else if (Array.isArray(result) && result.length > 0) {
                // Indexes syncIndexes DROPPED because the schema no longer declares them.
                // Logged loudly: an index created by hand in Compass and never added to a
                // schema will disappear here, and this line is the only warning of that.
                dropped[modelName] = result;
            }
        }

        logger.info('indexes.sync.done', { modelCount, syncedModels: Object.keys(results).length });
        if (Object.keys(dropped).length > 0) logger.warn('indexes.sync.droppedIndexes', dropped);
        if (Object.keys(failed).length > 0) logger.error('indexes.sync.modelFailures', failed);
    } catch (error) {
        logger.error('indexes.sync.failed', error);
    }
};

module.exports = { ensureIndexes, loadAllModels, repairPunchLogIndexes };
