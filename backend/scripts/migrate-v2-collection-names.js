'use strict';
// shared-fix5 Rule 23.8 — one-time rename of the v2 collections created before Rule 23 to
// their "v2-" names. Uses MongoDB renameCollection: the data moves inside the same database,
// nothing is copied and nothing is dropped.
//
//   node scripts/migrate-v2-collection-names.js --dry-run   (prints old -> new + counts, no writes)
//   node scripts/migrate-v2-collection-names.js             (renames; run once per database,
//                                                            after a backup, together with the
//                                                            deploy that ships the new model names)
//
// Safety: a pair whose old collection is gone and new one exists counts as already renamed and
// is skipped; if BOTH exist it refuses (never overwrites, never merges); counts are read
// before and after and the script fails if any differ.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const RENAMES = [
    ['academic-classes', 'v2-academic-classes'],
    ['academic-subjects', 'v2-academic-subjects'],
    ['academic-subject-groups', 'v2-academic-subject-groups'],
    ['activity-logs', 'v2-activity-logs'],
    ['student-enrollments', 'v2-student-enrollments'],
];

const DRY_RUN = process.argv.includes('--dry-run');

const run = async () => {
    await mongoose.connect(process.env.DB_URL);
    const db = mongoose.connection.db;
    console.log(`database: ${db.databaseName}${DRY_RUN ? '  (dry run — no writes)' : ''}`);
    const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    const count = (name) => db.collection(name).countDocuments();

    const plan = [];
    for (const [from, to] of RENAMES) {
        const hasFrom = names.has(from);
        const hasTo = names.has(to);
        if (hasFrom && hasTo) throw new Error(`refusing: both '${from}' and '${to}' exist — resolve by hand, nothing was renamed`);
        if (!hasFrom && hasTo) { console.log(`skip  ${from} -> ${to}  (already renamed, ${await count(to)} docs)`); continue; }
        if (!hasFrom) { console.log(`skip  ${from} -> ${to}  (no such collection yet; the model creates '${to}' on first write)`); continue; }
        const before = await count(from);
        plan.push({ from, to, before });
        console.log(`${DRY_RUN ? 'plan' : 'move'}  ${from} -> ${to}  (${before} docs)`);
    }
    if (DRY_RUN || !plan.length) return plan;

    for (const step of plan) {
        await db.renameCollection(step.from, step.to, { dropTarget: false });
        step.after = await count(step.to);
        if (step.after !== step.before) throw new Error(`count mismatch on ${step.to}: before ${step.before}, after ${step.after}`);
        console.log(`done  ${step.from} -> ${step.to}  before ${step.before}  after ${step.after}`);
    }
    return plan;
};

run()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
        console.error(`FAILED: ${error.message}`);
        await mongoose.disconnect();
        process.exit(1);
    });
