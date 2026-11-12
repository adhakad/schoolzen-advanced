'use strict';
// Seeds the fixed-date NATIONAL holidays into `v2-system-holidays` (the data behind Holiday →
// "Generate from Public Holidays") — shared-fix6 E. Idempotent and re-run safe:
//   - one document per (state, year), upserted on the existing unique index;
//   - a holiday is ADDED only when that (name, date) is missing — nothing is ever removed or
//     changed, so rows the owner entered by hand (Compass or --file) are kept as they are;
//   - no legacy read, no copy from the legacy 'system-holiday' collection.
//
// Built in: Republic Day (26 Jan), Independence Day (15 Aug), Gandhi Jayanti (2 Oct), for every
// state/UT in helpers/settings/v2-school-profile-lists.js STATES, current year and the next two.
// Festivals whose date changes every year (Holi, Diwali, Eid, Good Friday, ...) are NOT guessed:
// the owner supplies them with --file, a JSON array of
//   [{ "state": "Madhya Pradesh" | "ALL", "year": 2027, "name": "Holi", "date": "2027-03-22" }]
//
//   node scripts/v2-seed-system-holidays.js                    dry run: prints what would change
//   node scripts/v2-seed-system-holidays.js --apply            writes
//   node scripts/v2-seed-system-holidays.js --apply --file=dates.json
const fs = require('fs');
const SystemHolidayV2Model = require('../modules/models/holiday/system-holiday');
const { STATES } = require('../modules/helpers/settings/v2-school-profile-lists');

const NATIONAL = Object.freeze([
    { name: 'Republic Day', monthDay: '01-26' },
    { name: 'Independence Day', monthDay: '08-15' },
    { name: 'Gandhi Jayanti', monthDay: '10-02' },
]);

const defaultYears = (from = new Date().getFullYear()) => [from, from + 1, from + 2];

/** Validate and expand a --file list ("ALL" → every state). Throws on the first bad row. */
const expandOwnerRows = (rows) => {
    if (!Array.isArray(rows)) throw new Error('--file must hold a JSON array');
    const out = [];
    rows.forEach((row, i) => {
        const where = `row ${i + 1}`;
        if (!row || typeof row.name !== 'string' || !row.name.trim()) throw new Error(`${where}: name is required`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) || Number.isNaN(Date.parse(`${row.date}T00:00:00Z`))) throw new Error(`${where}: date must be YYYY-MM-DD`);
        const year = Number(row.year || String(row.date).slice(0, 4));
        if (String(row.date).slice(0, 4) !== String(year)) throw new Error(`${where}: date is not in year ${year}`);
        const states = row.state === 'ALL' ? STATES : [row.state];
        if (!states.every((s) => STATES.includes(s))) throw new Error(`${where}: unknown state "${row.state}"`);
        states.forEach((state) => out.push({ state, year, name: row.name.trim(), date: row.date }));
    });
    return out;
};

/** Every (state, year, name, date) the seed wants present. */
const desiredRows = ({ years = defaultYears(), ownerRows = [] } = {}) => {
    const rows = [];
    STATES.forEach((state) => years.forEach((year) => NATIONAL.forEach((h) => {
        rows.push({ state, year, name: h.name, date: `${year}-${h.monthDay}` });
    })));
    return rows.concat(ownerRows);
};

/**
 * @returns {{ documentsToCreate, rowsToAdd, alreadyPresent, plan: Map }} — and writes when apply.
 */
const seedSystemHolidays = async ({ apply = false, years, ownerRows = [] } = {}) => {
    const wanted = desiredRows({ years, ownerRows });
    const groups = new Map();
    wanted.forEach((r) => {
        const key = `${r.state}|${r.year}`;
        if (!groups.has(key)) groups.set(key, { state: r.state, year: r.year, rows: [] });
        groups.get(key).rows.push({ name: r.name, date: r.date });
    });

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
        const have = new Set((doc ? doc.holidays : []).map((h) => `${h.name.toLowerCase()}|${h.date}`));
        const missing = [];
        g.rows.forEach((row) => {
            const id = `${row.name.toLowerCase()}|${row.date}`;
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

module.exports = { seedSystemHolidays, desiredRows, expandOwnerRows, NATIONAL, defaultYears };

if (require.main === module) {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
    global.global_config = require('../config/config.js');
    const mongoose = require('mongoose');
    const { DbConnect } = require('../modules/helpers/database');
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const fileArg = args.find((a) => a.startsWith('--file='));
    let ownerRows = [];
    try {
        if (fileArg) ownerRows = expandOwnerRows(JSON.parse(fs.readFileSync(fileArg.slice('--file='.length), 'utf8')));
    } catch (error) {
        console.error('bad --file:', error.message);
        process.exit(1);
    }
    DbConnect()
        .then(() => seedSystemHolidays({ apply, ownerRows }))
        .then((result) => {
            console.log(apply ? 'v2-system-holidays seeded' : 'DRY RUN (no writes) — add --apply to write', result);
        })
        .catch((error) => { console.error('seed failed:', error.message); process.exitCode = 1; })
        .finally(() => mongoose.disconnect().then(() => process.exit()));
}
