'use strict';
// Seeds the Central Government gazetted holidays into `v2-system-holidays` (the data behind
// Holiday → "Generate from Public Holidays") — shared-fix6 E + H.2. Idempotent and re-run safe:
//   - one document per (state, year), upserted on the existing unique index;
//   - a holiday is ADDED only when that (date, name) is missing — nothing is ever removed or
//     changed, so rows the owner entered by hand are kept as they are;
//   - no legacy read, no copy from the legacy 'system-holiday' collection.
//
// Data: v2-system-holidays-2026-2027.json (next to this script). Each row is
// { date: "YYYY-MM-DD", name, category: national | hindu | other }; edit a date there and
// re-run to add it. Gazetted holidays are central, so every row goes to every state/UT in
// helpers/settings/v2-school-profile-lists.js STATES.
// Default = `national` + `hindu` rows; --include-other adds the rest (Eid, Good Friday, ...).
// Other festivals not in the gazetted list (Maha Shivratri, Raksha Bandhan, ...) are NOT added:
// the owner sends dates and they go in the data file (or a --file in the same shape).
//
//   node scripts/v2-seed-system-holidays.js --dry-run                 prints what would change
//   node scripts/v2-seed-system-holidays.js --apply                   writes national + hindu
//   node scripts/v2-seed-system-holidays.js --apply --include-other   writes every row
//   node scripts/v2-seed-system-holidays.js --apply --file=extra.json same shape, owner rows
// With neither --dry-run nor --apply it is a dry run.
const fs = require('fs');
const path = require('path');
const SystemHolidayV2Model = require('../modules/models/holiday/system-holiday');
const { STATES } = require('../modules/helpers/settings/v2-school-profile-lists');

const DATA_FILE = path.join(__dirname, 'v2-system-holidays-2026-2027.json');
const CATEGORIES = Object.freeze(['national', 'hindu', 'other']);
const DEFAULT_CATEGORIES = Object.freeze(['national', 'hindu']);

/** Read + validate a data file ({ holidays: [...] } or [...]). Throws on the first bad row. */
const loadRows = (file = DATA_FILE) => {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rows = Array.isArray(json) ? json : json.holidays;
    if (!Array.isArray(rows)) throw new Error(`${path.basename(file)}: expected a "holidays" array`);
    return rows.map((row, i) => {
        const where = `${path.basename(file)} row ${i + 1}`;
        if (!row || typeof row.name !== 'string' || !row.name.trim()) throw new Error(`${where}: name is required`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) || Number.isNaN(Date.parse(`${row.date}T00:00:00Z`))) throw new Error(`${where}: date must be YYYY-MM-DD`);
        const category = row.category || 'other';
        if (!CATEGORIES.includes(category)) throw new Error(`${where}: category must be ${CATEGORIES.join(' | ')}`);
        const state = row.state || 'ALL';
        if (state !== 'ALL' && !STATES.includes(state)) throw new Error(`${where}: unknown state "${state}"`);
        return { date: row.date, name: row.name.trim(), category, state };
    });
};

/** Data rows → one (state, year, name, date) per state the row applies to. */
const expandRows = (rows, categories = DEFAULT_CATEGORIES) => rows
    .filter((row) => categories.includes(row.category))
    .flatMap((row) => (row.state === 'ALL' ? STATES : [row.state])
        .map((state) => ({ state, year: Number(row.date.slice(0, 4)), name: row.name, date: row.date })));

/**
 * @param {Object} opts
 * @param {Boolean} [opts.apply]          write (else dry run)
 * @param {Array}   [opts.rows]           already-validated data rows (default: the data file)
 * @param {Boolean} [opts.includeOther]   add `other` rows too
 */
const seedSystemHolidays = async ({ apply = false, rows = loadRows(), includeOther = false } = {}) => {
    const wanted = expandRows(rows, includeOther ? CATEGORIES : DEFAULT_CATEGORIES);
    const groups = new Map();
    wanted.forEach((r) => {
        const key = `${r.state}|${r.year}`;
        if (!groups.has(key)) groups.set(key, { state: r.state, year: r.year, rows: [] });
        groups.get(key).rows.push({ name: r.name, date: r.date });
    });
    if (!groups.size) return { apply, groups: 0, documentsToCreate: 0, rowsToAdd: 0, alreadyPresent: 0, writes: 0 };

    const existing = await SystemHolidayV2Model.find(
        { $or: [...groups.values()].map((g) => ({ state: g.state, year: g.year })) },
        'state year holidays'
    ).lean();
    const byKey = new Map(existing.map((d) => [`${d.state}|${d.year}`, d]));

    let documentsToCreate = 0;
    let rowsToAdd = 0;
    let alreadyPresent = 0;
    const ops = [];
    for (const [key, g] of groups) {
        const doc = byKey.get(key);
        const have = new Set((doc ? doc.holidays : []).map((h) => `${h.date}|${h.name.toLowerCase()}`));
        const missing = [];
        g.rows.forEach((row) => {
            const id = `${row.date}|${row.name.toLowerCase()}`;
            if (have.has(id)) { alreadyPresent += 1; return; }
            have.add(id);
            missing.push(row);
        });
        if (!doc) documentsToCreate += 1;
        if (!missing.length) continue;
        rowsToAdd += missing.length;
        ops.push({
            updateOne: {
                filter: { state: g.state, year: g.year },
                // $addToSet: two concurrent runs still end with one copy of each row.
                update: { $addToSet: { holidays: { $each: missing } }, $set: { updatedAt: new Date() } },
                upsert: true,
            },
        });
    }

    if (apply && ops.length) {
        await SystemHolidayV2Model.bulkWrite(ops, { ordered: false });
        // The Holiday page caches these reads; drop them so the seeded rows show at once.
        try {
            const cacheService = require('../modules/services/cache/cache.service');
            const cacheKeys = require('../modules/services/cache/cache-keys');
            await cacheService.del(cacheKeys.holiday.systemStates(), ...[...groups.values()].map((g) => cacheKeys.holiday.system(g.state, g.year)));
        } catch (error) { /* no Redis: entries expire on their own TTL */ }
    }
    return { apply, groups: groups.size, documentsToCreate, rowsToAdd, alreadyPresent, writes: apply ? ops.length : 0 };
};

module.exports = { seedSystemHolidays, loadRows, expandRows, DATA_FILE, CATEGORIES, DEFAULT_CATEGORIES };

if (require.main === module) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    global.global_config = require('../config/config.js');
    const mongoose = require('mongoose');
    const { DbConnect } = require('../modules/helpers/database');
    const args = process.argv.slice(2);
    const apply = args.includes('--apply') && !args.includes('--dry-run');
    const includeOther = args.includes('--include-other');
    const fileArg = args.find((a) => a.startsWith('--file='));
    let rows;
    try {
        rows = loadRows(fileArg ? path.resolve(fileArg.slice('--file='.length)) : DATA_FILE);
    } catch (error) {
        console.error('bad data file:', error.message);
        process.exit(1);
    }
    DbConnect()
        .then(() => seedSystemHolidays({ apply, rows, includeOther }))
        .then((result) => {
            console.log(apply ? 'v2-system-holidays seeded' : 'DRY RUN (no writes) — add --apply to write', { includeOther, ...result });
        })
        .catch((error) => { console.error('seed failed:', error.message); process.exitCode = 1; })
        .finally(() => mongoose.disconnect().then(() => process.exit()));
}
