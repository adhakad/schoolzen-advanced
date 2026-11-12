'use strict';
// shared-fix6 — Settings → School Profile + public-holidays seed, over HTTP through the REAL
// /api/v2/settings and /api/v2/holiday routers (isAdminAuth, assertAdminScope, requirePermission,
// Multer, Joi, error handler). Isolated throwaway database on the configured cluster, dropped
// at the end (never the app's own data).
//   A  save, update, one doc per adminId, every validation rule, logo size/type, 403 without
//      'settings-school-profile', activity log row with field names + actor name, other tenant
//   D  letterhead before/after save; fee-reminder sender name (default + fallback)
//   E  seed dry-run → apply → re-run (0 added), owner --file rows, reader returns seeded rows
//
// Run: node scripts/v2-test-school-profile.js     (needs backend/.env: DB_URL, ADMIN_ACCESS_SECRET)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
global.global_config = require('../config/config.js');
require('express-async-errors');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_DB = process.env.TEST_DB_NAME || 'schoolzen_school_profile_test';
if (!/test/i.test(TEST_DB)) throw new Error('TEST_DB_NAME must contain "test" — this script drops it.');

const SchoolProfileV2Model = require('../modules/models/settings/school-profile');
const StaffV2Model = require('../modules/models/staff/staff');
const RoleModel = require('../modules/models/settings/role');
const RoleAssignmentModel = require('../modules/models/settings/role-assignment');
const ActivityLogModel = require('../modules/models/audit/activity-log');
const SystemHolidayV2Model = require('../modules/models/holiday/system-holiday');
const errorHandler = require('../modules/middleware/errorHandler');
const { buildLetterheadDocument } = require('../modules/services/pdf/v2-letterhead.service');
const { BOARDS, STATES, BOARD_GROUPS } = require('../modules/helpers/settings/v2-school-profile-lists');
const { seedSystemHolidays, loadRows, expandRows } = require('./v2-seed-system-holidays');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const { destroyImages } = require('../modules/services/media/cloudinary.service');

const OID = () => new mongoose.Types.ObjectId();
const ADMIN = OID().toHexString();
const OTHER = OID().toHexString();
const tokenFor = (payload) => jwt.sign({ payload }, process.env.ADMIN_ACCESS_SECRET, { expiresIn: '1h' });
const OWNER = tokenFor({ id: ADMIN });

let base;
let server;
const f = {};

const api = async (method, urlPath, { body, query = { adminId: ADMIN }, token = OWNER, form } = {}) => {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const headers = { authorization: `Bearer ${token}` };
    if (!form) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${urlPath}${qs}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { json = text; }
    return { status: res.status, body: json };
};

const VALID = Object.freeze({
    schoolName: 'Green Valley Public School',
    board: 'Central Board of Secondary Education (CBSE)',
    medium: 'English',
    affiliationNumber: '1030123',
    schoolCode: 'GV-0142',
    foundedYear: '1998',
    udiseNumber: '23090100101',
    principalName: 'Dr. R. K. Sharma',
    street: '12, Vijay Nagar Main Road',
    city: 'Indore',
    district: 'Indore',
    state: 'Madhya Pradesh',
    pinCode: '452010',
    phoneOne: '9876543210',
    phoneSecond: '',
    email: 'office@greenvalley.in',
    website: 'www.greenvalley.in',
    senderName: '',
});
const put = (body, opts = {}) => api('PUT', '/settings/school-profile', { body, ...opts });
const fieldsOf = (res) => ((res.body && res.body.error && res.body.error.fields) || []).map((x) => x.field);
const refused = async (patch, field) => {
    const res = await put({ ...VALID, ...patch });
    assert.strictEqual(res.status, 400, `${field}: ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    assert.ok(fieldsOf(res).includes(field), `${field} not in ${JSON.stringify(fieldsOf(res))}`);
};
const png = (bytes) => { const b = Buffer.alloc(bytes, 0); Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(b); return b; };
const formWith = (file, name, type) => {
    const form = new FormData();
    Object.entries(VALID).forEach(([k, v]) => form.append(k, v));
    form.append('logo', new Blob([file], { type }), name);
    return form;
};
// A real, decodable PNG (sharp), well under 100 KB.
const realPng = (r, g, b) => sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } }).png().toBuffer();
const stored = () => SchoolProfileV2Model.findOne({ adminId: ADMIN }, 'schoolLogo schoolLogoPublicId city').lean();
const uploaded = new Set();
const fetchStatus = async (url) => (await fetch(url)).status;
const cloudStatus = (publicId) => cloudinary.api.resource(publicId).then(() => 200, (e) => (e.error && e.error.http_code) || 'error');

const tests = {
    // ---- A. backend ------------------------------------------------------------------------
    'A. lists: 4 national + DEO + 35 state boards; 36 states/UTs': async () => {
        assert.deepStrictEqual(BOARD_GROUPS.map((g) => g.boards.length), [4, 1, 35]);
        assert.strictEqual(BOARDS.length, 40);
        assert.strictEqual(STATES.length, 36);
        assert.strictEqual(new Set(BOARDS).size, 40, 'no duplicate boards');
    },
    'A. GET before any save → profile null + lists': async () => {
        const res = await api('GET', '/settings/school-profile');
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        assert.strictEqual(res.body.profile, null);
        assert.strictEqual(res.body.states.length, 36);
        assert.strictEqual(res.body.boards.length, 3);
    },
    'D. letterhead BEFORE a profile: "SCHOOL", no lines, no crash': async () => {
        f.before = await buildLetterheadDocument({ adminId: ADMIN, title: 'TRANSFER CERTIFICATE', fields: [] });
        assert.strictEqual(f.before.header.schoolName, 'SCHOOL');
        assert.deepStrictEqual(f.before.header.metaLines, []);
    },
    'A. save (create) → 200, sender defaults to School Name, "Last saved by" name': async () => {
        const res = await put(VALID);
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        assert.strictEqual(res.body.profile.senderName, VALID.schoolName);
        assert.strictEqual(res.body.profile.foundedYear, 1998);
        assert.ok(res.body.profile.updatedByName, 'updatedByName set');
        assert.strictEqual(res.body.profile.phoneSecond, null, "'' stored as null");
    },
    'A. update → same document, changed value saved, sender kept': async () => {
        const res = await put({ ...VALID, city: 'Mhow', senderName: '' });
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        assert.strictEqual(res.body.profile.city, 'Mhow');
        assert.strictEqual(res.body.profile.senderName, VALID.schoolName);
        const custom = await put({ ...VALID, city: 'Mhow', senderName: 'Green Valley' });
        assert.strictEqual(custom.body.profile.senderName, 'Green Valley');
    },
    'A. one document per adminId (unique index, collection v2-school-profiles)': async () => {
        assert.strictEqual(SchoolProfileV2Model.collection.collectionName, 'v2-school-profiles');
        assert.strictEqual(await mongoose.connection.db.collection('v2-school-profiles').countDocuments({ adminId: ADMIN }), 1);
        await assert.rejects(SchoolProfileV2Model.create({ adminId: ADMIN, schoolName: 'dup' }), /E11000/);
    },
    'A. activity log: settings.school-profile.save, changed field names only, actor name': async () => {
        const rows = await ActivityLogModel.find({ adminId: ADMIN, action: 'settings.school-profile.save' }).sort({ _id: 1 }).lean();
        assert.strictEqual(rows.length, 3, `3 saves → 3 rows, got ${rows.length}`);
        assert.strictEqual(rows[0].meta.created, true);
        assert.deepStrictEqual(rows[1].meta.fields, ['city']);
        assert.deepStrictEqual(rows[2].meta.fields, ['senderName']);
        assert.ok(rows.every((r) => typeof r.actorName === 'string' && r.actorName.trim()), 'actorName on every row');
        assert.ok(!JSON.stringify(rows[1]).includes('Mhow'), 'no values in the log');
    },
    'A. validation: every rule refused (400 + field)': async () => {
        await refused({ schoolName: '' }, 'schoolName');
        await refused({ schoolName: 'x'.repeat(51) }, 'schoolName');
        await refused({ board: 'Some Typed Board' }, 'board');
        await refused({ medium: 'French' }, 'medium');
        await refused({ affiliationNumber: '' }, 'affiliationNumber');
        await refused({ affiliationNumber: 'x'.repeat(16) }, 'affiliationNumber');
        await refused({ schoolCode: 'x'.repeat(16) }, 'schoolCode');
        await refused({ foundedYear: '1899' }, 'foundedYear');
        await refused({ foundedYear: '98' }, 'foundedYear');
        await refused({ foundedYear: '2a10' }, 'foundedYear');
        await refused({ udiseNumber: '1234' }, 'udiseNumber');
        await refused({ principalName: 'x'.repeat(51) }, 'principalName');
        await refused({ street: 'x'.repeat(101) }, 'street');
        await refused({ city: '' }, 'city');
        await refused({ district: 'x'.repeat(51) }, 'district');
        await refused({ state: 'Atlantis' }, 'state');
        await refused({ pinCode: '45201' }, 'pinCode');
        await refused({ pinCode: '45201a' }, 'pinCode');
        await refused({ phoneOne: '98765' }, 'phoneOne');
        await refused({ phoneOne: '98765abcde' }, 'phoneOne');
        await refused({ phoneSecond: '123' }, 'phoneSecond');
        await refused({ email: 'not-an-email' }, 'email');
        await refused({ senderName: 'x'.repeat(51) }, 'senderName');
        const stored = await SchoolProfileV2Model.findOne({ adminId: ADMIN }).lean();
        assert.strictEqual(stored.city, 'Mhow', 'refused saves changed nothing');
    },
    'A. logo: over 100 KB refused; non-image bytes refused (before any upload)': async () => {
        const big = await api('PUT', '/settings/school-profile', { form: formWith(png(101 * 1024), 'logo.png', 'image/png') });
        assert.strictEqual(big.status, 400, JSON.stringify(big.body));
        assert.ok(fieldsOf(big).includes('logo'));
        assert.match(JSON.stringify(big.body), /100 KB/);
        const gif = await api('PUT', '/settings/school-profile', { form: formWith(Buffer.from('GIF89a....'), 'logo.gif', 'image/gif') });
        assert.strictEqual(gif.status, 400, JSON.stringify(gif.body));
        const fake = await api('PUT', '/settings/school-profile', { form: formWith(Buffer.from('not really a png'), 'logo.png', 'image/png') });
        assert.strictEqual(fake.status, 400, JSON.stringify(fake.body));
        assert.ok(fieldsOf(fake).includes('logo'));
    },
    'A. permission: staff without settings-school-profile → 403 on GET and PUT': async () => {
        const staff = await StaffV2Model.create({ adminId: ADMIN, name: 'Plain Settings', empCode: 'SP-1', status: 'active' });
        const role = await RoleModel.create({ adminId: ADMIN, name: 'Settings Only', permissions: [{ module: 'settings', canView: true, canEdit: true }] });
        await RoleAssignmentModel.create({ adminId: ADMIN, staffId: staff._id, roleId: role._id, scope: 'school' });
        const token = tokenFor({ id: ADMIN, staffId: String(staff._id) });
        assert.strictEqual((await api('GET', '/settings/school-profile', { token })).status, 403);
        assert.strictEqual((await put(VALID, { token })).status, 403);
        // view-only grant: can read, cannot save
        await RoleModel.updateOne({ _id: role._id }, { $push: { permissions: { module: 'settings-school-profile', canView: true, canEdit: false } } });
        await require('../modules/services/cache/cache.service').delPattern(`${ADMIN}:*`).catch(() => undefined);
        assert.strictEqual((await api('GET', '/settings/school-profile', { token })).status, 200);
        assert.strictEqual((await put(VALID, { token })).status, 403);
    },
    'A. key seeded: in PERMISSION_MODULES (Roles & Permissions list) + UI label': async () => {
        assert.ok(RoleModel.PERMISSION_MODULES.includes('settings-school-profile'));
        const ui = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'app', 'settings', 'roles-permissions', 'roles-permissions.component.ts'), 'utf8');
        assert.match(ui, /'settings-school-profile': 'School Profile'/);
    },
    'A. other tenant: cannot read or write this school (403), its own GET is null': async () => {
        const other = tokenFor({ id: OTHER });
        assert.strictEqual((await api('GET', '/settings/school-profile', { token: other })).status, 403);
        assert.strictEqual((await put(VALID, { token: other })).status, 403);
        const own = await api('GET', '/settings/school-profile', { token: other, query: { adminId: OTHER } });
        assert.strictEqual(own.status, 200);
        assert.strictEqual(own.body.profile, null);
    },
    // ---- D. readers ------------------------------------------------------------------------
    'D. letterhead AFTER save: name, board · affil · code, address, phone · email': async () => {
        f.after = await buildLetterheadDocument({ adminId: ADMIN, title: 'TRANSFER CERTIFICATE', fields: [] });
        assert.strictEqual(f.after.header.schoolName, 'GREEN VALLEY PUBLIC SCHOOL');
        assert.deepStrictEqual(f.after.header.metaLines, [
            'CBSE · Affil./Recog. No. 1030123 · School Code GV-0142',
            '12, Vijay Nagar Main Road, Mhow, Indore, Madhya Pradesh - 452010',
            '9876543210 · office@greenvalley.in',
        ]);
        console.log(`       before: ${JSON.stringify(f.before.header)}`);
        console.log(`       after:  ${JSON.stringify(f.after.header)}`);
    },
    'D. fee-reminder sender: senderName, else schoolName, else "" (no profile)': async () => {
        const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'modules', 'workers', 'fees-worker.js'), 'utf8');
        assert.match(src, /'schoolName senderName'/);
        assert.match(src, /\(school && \(school\.senderName \|\| school\.schoolName\)\) \|\| ''/);
        const doc = await SchoolProfileV2Model.findOne({ adminId: ADMIN }, 'schoolName senderName').lean();
        assert.strictEqual(doc.senderName, 'Green Valley');
        assert.strictEqual(await SchoolProfileV2Model.findOne({ adminId: OTHER }).lean(), null);
    },
    // ---- H.1 logo through the REAL multipart route (Cloudinary, as every v2 upload) ------
    'H.1a first save with a PNG ≤100 KB → stored on Cloudinary, URL + public id saved': async () => {
        await SchoolProfileV2Model.deleteOne({ adminId: ADMIN });
        const file = await realPng(140, 82, 255);
        assert.ok(file.length < 100 * 1024, `${file.length} bytes`);
        const res = await api('PUT', '/settings/school-profile', { form: formWith(file, 'logo.png', 'image/png') });
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        const doc = await stored();
        assert.ok(doc.schoolLogo && doc.schoolLogoPublicId, 'logo saved');
        uploaded.add(doc.schoolLogoPublicId);
        assert.ok(doc.schoolLogoPublicId.startsWith(`schoolzen/${ADMIN}/school-logo/`), doc.schoolLogoPublicId);
        assert.strictEqual(res.body.profile.schoolLogo, doc.schoolLogo);
        assert.strictEqual(await fetchStatus(doc.schoolLogo), 200, 'Cloudinary serves the logo');
        f.logoA = doc;
        console.log(`       logo a: ${file.length} bytes -> ${doc.schoolLogo}`);
    },
    'H.1b update with a new PNG replaces the logo (old one destroyed)': async () => {
        const res = await api('PUT', '/settings/school-profile', { form: formWith(await realPng(30, 160, 90), 'logo2.png', 'image/png') });
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        const doc = await stored();
        uploaded.add(doc.schoolLogoPublicId);
        assert.notStrictEqual(doc.schoolLogoPublicId, f.logoA.schoolLogoPublicId, 'new public id');
        assert.strictEqual(await fetchStatus(doc.schoolLogo), 200);
        assert.strictEqual(await cloudStatus(f.logoA.schoolLogoPublicId), 404, 'old logo destroyed on Cloudinary');
        f.logoB = doc;
    },
    'H.1c update without a file keeps the logo': async () => {
        const res = await put({ ...VALID, city: 'Ujjain' });
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        const doc = await stored();
        assert.strictEqual(doc.city, 'Ujjain');
        assert.strictEqual(doc.schoolLogo, f.logoB.schoolLogo);
        assert.strictEqual(doc.schoolLogoPublicId, f.logoB.schoolLogoPublicId);
        assert.strictEqual(await cloudStatus(f.logoB.schoolLogoPublicId), 200, 'still on Cloudinary');
    },
    'H.1e reload: GET and the letterhead return the saved logo': async () => {
        const res = await api('GET', '/settings/school-profile');
        assert.strictEqual(res.body.profile.schoolLogo, f.logoB.schoolLogo);
        const doc = await buildLetterheadDocument({ adminId: ADMIN, title: 'T', fields: [] });
        assert.strictEqual(doc.header.logoUrl, f.logoB.schoolLogo);
    },
    'H.1d remove logo → null in the profile and the letterhead, file destroyed': async () => {
        const res = await put({ ...VALID, city: 'Ujjain', removeLogo: true });
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        assert.strictEqual(res.body.profile.schoolLogo, null);
        const doc = await stored();
        assert.strictEqual(doc.schoolLogo, null);
        assert.strictEqual(doc.schoolLogoPublicId, null);
        assert.strictEqual((await buildLetterheadDocument({ adminId: ADMIN, title: 'T', fields: [] })).header.logoUrl, null);
        assert.strictEqual(await cloudStatus(f.logoB.schoolLogoPublicId), 404, 'removed logo destroyed on Cloudinary');
        const log = await ActivityLogModel.findOne({ adminId: ADMIN, action: 'settings.school-profile.save' }).sort({ _id: -1 }).lean();
        assert.deepStrictEqual(log.meta.fields, ['schoolLogo']);
    },
    'H.1f too big and wrong type refused with a clear message, nothing saved': async () => {
        const msg = (res) => (res.body.error.fields.find((x) => x.field === 'logo') || {}).message;
        const big = await api('PUT', '/settings/school-profile', { form: formWith(png(101 * 1024), 'big.png', 'image/png') });
        assert.strictEqual(big.status, 400);
        assert.strictEqual(msg(big), 'Logo must be 100 KB or smaller.');
        const gif = await api('PUT', '/settings/school-profile', { form: formWith(Buffer.from('GIF89a....'), 'x.gif', 'image/gif') });
        assert.strictEqual(gif.status, 400);
        assert.strictEqual(msg(gif), 'Only JPG/PNG images are allowed.');
        const renamed = await api('PUT', '/settings/school-profile', { form: formWith(Buffer.from('%PDF-1.4 not an image'), 'x.png', 'image/png') });
        assert.strictEqual(renamed.status, 400);
        assert.strictEqual(msg(renamed), 'Only JPG/PNG images are allowed.');
        assert.strictEqual((await stored()).schoolLogo, null, 'nothing saved');
    },
    // ---- H.2 holidays seed from the data file ----------------------------------------------
    'H.2 data file: 34 rows; default = national + hindu (16), --include-other = all': async () => {
        const rows = loadRows();
        assert.strictEqual(rows.length, 34);
        const def = rows.filter((r) => r.category !== 'other');
        assert.strictEqual(def.length, 16);
        assert.deepStrictEqual([...new Set(def.map((r) => r.name))].sort(), ['Diwali (Deepavali)', 'Dussehra (Vijaya Dashami)', 'Holi', 'Independence Day', 'Janmashtami', 'Mahatma Gandhi\'s Birthday', 'Ram Navami', 'Republic Day'].sort());
        assert.strictEqual(expandRows(rows).length, 16 * 36);
        assert.strictEqual(expandRows(rows, ['national', 'hindu', 'other']).length, 34 * 36);
    },
    'H.2 seed: dry run writes nothing; apply inserts; re-run adds 0; --include-other adds the rest once; owner rows kept': async () => {
        const dry = await seedSystemHolidays({ apply: false });
        assert.strictEqual(dry.rowsToAdd, 16 * 36);
        assert.strictEqual(await SystemHolidayV2Model.countDocuments(), 0, 'dry run wrote');
        const first = await seedSystemHolidays({ apply: true });
        assert.strictEqual(first.rowsToAdd, 576);
        assert.strictEqual(await SystemHolidayV2Model.countDocuments(), 36 * 2);
        const again = await seedSystemHolidays({ apply: true });
        assert.strictEqual(again.rowsToAdd, 0);
        assert.strictEqual(again.alreadyPresent, 576);
        const mp = await SystemHolidayV2Model.findOne({ state: 'Madhya Pradesh', year: 2027 }).lean();
        assert.strictEqual(mp.holidays.length, 8);
        assert.ok(!mp.holidays.some((h) => /Id-ul|Good Friday|Christmas/.test(h.name)), 'no other rows by default');
        await SystemHolidayV2Model.updateOne({ state: 'Delhi', year: 2027 }, { $push: { holidays: { name: 'Owner Day', date: '2027-05-05' } } });
        const withOther = await seedSystemHolidays({ apply: true, includeOther: true });
        assert.strictEqual(withOther.rowsToAdd, 18 * 36);
        assert.strictEqual((await seedSystemHolidays({ apply: true, includeOther: true })).rowsToAdd, 0);
        const delhi = await SystemHolidayV2Model.findOne({ state: 'Delhi', year: 2027 }).lean();
        assert.ok(delhi.holidays.some((h) => h.name === 'Owner Day'), 'owner row kept');
        assert.strictEqual(delhi.holidays.length, 17 + 1);
        // back to the default seed for the reader test
        await SystemHolidayV2Model.deleteMany({});
        await seedSystemHolidays({ apply: true });
    },
    'H.2 bad data rows refused': async () => {
        const fsx = require('fs');
        const tmp = require('path').join(require('os').tmpdir(), `v2-holidays-bad-${Date.now()}.json`);
        const bad = (rows, re) => { fsx.writeFileSync(tmp, JSON.stringify({ holidays: rows })); assert.throws(() => loadRows(tmp), re); };
        bad([{ date: '2027-13-40', name: 'X', category: 'hindu' }], /YYYY-MM-DD/);
        bad([{ date: '2027-01-01', name: '', category: 'hindu' }], /name/);
        bad([{ date: '2027-01-01', name: 'X', category: 'jain' }], /category/);
        bad([{ date: '2027-01-01', name: 'X', category: 'hindu', state: 'Atlantis' }], /unknown state/);
        fsx.unlinkSync(tmp);
    },
    'H.2 "public holidays" reader returns the seeded rows': async () => {
        await require('../modules/services/cache/cache.service').delPattern('system:holiday:*').catch(() => undefined);
        const states = await api('GET', '/holiday/system-holidays/states');
        assert.strictEqual(states.status, 200, JSON.stringify(states.body));
        assert.strictEqual(states.body.rows.length, 36);
        assert.deepStrictEqual(states.body.rows.find((r) => r.state === 'Madhya Pradesh').years, [2027, 2026]);
        for (const year of ['2026', '2027']) {
            const list = await api('GET', '/holiday/system-holidays', { query: { adminId: ADMIN, state: 'Madhya Pradesh', year } });
            assert.strictEqual(list.status, 200, JSON.stringify(list.body));
            assert.strictEqual(list.body.rows.length, 8);
            console.log(`       reader ${year}: ${list.body.rows.map((r) => `${r.date} ${r.name}`).join(' | ')}`);
        }
    },
};

(async () => {
    await mongoose.connect(process.env.DB_URL, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
    await Promise.all([SchoolProfileV2Model.syncIndexes(), SystemHolidayV2Model.syncIndexes(), RoleModel.syncIndexes()]);
    const cache = require('../modules/services/cache/cache.service');
    await cache.delPattern('system:holiday:*').catch(() => undefined);
    const app = express();
    app.use(express.json());
    app.use('/api/v2/settings', require('../modules/routes/settings/school-profile.routes'));
    app.use('/api/v2/holiday', require('../modules/routes/holiday/holiday.routes'));
    app.use(errorHandler);
    server = http.createServer(app).listen(0);
    base = `http://127.0.0.1:${server.address().port}/api/v2`;
    let failed = 0;
    try {
        for (const [name, fn] of Object.entries(tests)) {
            const started = Date.now();
            try { await fn(); console.log(`  ok   ${name} (${Date.now() - started} ms)`); } catch (error) { failed += 1; console.log(`  FAIL ${name}\n       ${error.message}`); }
        }
    } finally {
        server.close();
        // Cloudinary cleanup: every logo this run uploaded (destroy is a no-op if already gone).
        const left = await SchoolProfileV2Model.findOne({ adminId: ADMIN }, 'schoolLogoPublicId').lean().catch(() => null);
        if (left && left.schoolLogoPublicId) uploaded.add(left.schoolLogoPublicId);
        await destroyImages([...uploaded]).catch(() => undefined);
        console.log(`  cloudinary cleanup: ${uploaded.size} test logo(s) destroyed`);
        await cache.delPattern(`${ADMIN}:*`).catch(() => undefined);
        await cache.delPattern(`${OTHER}:*`).catch(() => undefined);
        await cache.delPattern('system:holiday:*').catch(() => undefined);
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${Object.keys(tests).length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('setup failed:', error.message);
    if (server) server.close();
    (mongoose.connection.db ? mongoose.connection.db.dropDatabase() : Promise.resolve()).finally(() => process.exit(1));
});
