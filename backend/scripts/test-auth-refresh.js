'use strict';
// shared-fix1.md S1: only a 401 means "log in again / refresh". Checks, with no DB:
//  1. every frontend interceptor's refreshUrl is a POST route backend/routes.js really mounts;
//  2. the auth middlewares answer 401 (not 403) for a missing, expired or forged access token;
//  3. the refresh endpoints answer 401 for a missing or expired refresh token.
//
// Run: node scripts/test-auth-refresh.js
require('dotenv').config();
global.global_config = require('../config/config.js');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
const check = async (name, fn) => {
    try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed += 1; console.log(`FAIL  ${name}: ${e.message}`); }
};
const fakeRes = () => {
    const res = { statusCode: 200 };
    res.status = (c) => { res.statusCode = c; return res; };
    res.send = res.json = (b) => { res.body = b; return res; };
    return res;
};

const routes = [];
require('../routes')({ use: (prefix, router) => {
    if (typeof prefix !== 'string' || !router || !router.stack) return;
    router.stack.filter((l) => l.route).forEach((l) => Object.keys(l.route.methods)
        .forEach((m) => routes.push(`${m.toUpperCase()} ${prefix}${l.route.path}`)));
} });

const LOGINS = [
    { name: 'admin', file: 'admin-auth.interceptor.ts', mw: 'admin-auth', fn: 'isAdminAuth', secret: 'ADMIN_ACCESS_SECRET', refreshSecret: 'ADMIN_REFRESH_SECRET', ctrl: 'admin-user' },
    { name: 'teacher', file: 'teacher-auth.interceptor.ts', mw: 'teacher-auth', fn: 'isTeacherAuth', secret: 'TEACHER_ACCESS_SECRET', refreshSecret: 'TEACHER_REFRESH_SECRET', ctrl: 'teacher-user' },
    { name: 'sales', file: 'sales-auth.interceptor.ts', mw: 'sales-auth', fn: 'isSalesAuth', secret: 'SALES_ACCESS_SECRET', refreshSecret: 'SALES_REFRESH_SECRET', ctrl: 'sales-user' },
];

(async () => {
    for (const login of LOGINS) {
        const source = fs.readFileSync(path.join(ROOT, 'src/app/interceptors', login.file), 'utf8');
        const url = (source.match(/refreshUrl\s*=\s*`\$\{environment\.API_URL\}([^`]*)`/) || [])[1];
        await check(`${login.name}: refresh URL ${url} is a mounted POST route`, () => assert.ok(routes.includes(`POST ${url}`)));

        const mw = require(`../modules/middleware/${login.mw}`)[login.fn];
        const run = async (authorization) => { const res = fakeRes(); let nexted = false; await mw({ headers: authorization ? { authorization } : {} }, res, () => (nexted = true)); return { res, nexted }; };
        await check(`${login.name}: no token -> 401`, async () => assert.strictEqual((await run()).res.statusCode, 401));
        await check(`${login.name}: forged token -> 401`, async () => assert.strictEqual((await run('Bearer abc.def.ghi')).res.statusCode, 401));
        const secret = process.env[login.secret];
        if (secret) {
            const expired = jwt.sign({ payload: { id: 'x' }, exp: Math.floor(Date.now() / 1000) - 60 }, secret);
            await check(`${login.name}: expired token -> 401`, async () => assert.strictEqual((await run(`Bearer ${expired}`)).res.statusCode, 401));
            const valid = jwt.sign({ payload: { id: 'x' } }, secret, { expiresIn: 60 });
            await check(`${login.name}: valid token -> next()`, async () => assert.ok((await run(`Bearer ${valid}`)).nexted));
        } else console.log(`SKIP  ${login.name}: ${login.secret} not set, expired/valid token checks not run`);

        const { RefreshToken, RefreshSalesToken } = require(`../modules/controllers/users/${login.ctrl}`);
        const refresh = RefreshToken || RefreshSalesToken;
        await check(`${login.name}: refresh without token -> 401`, async () => { const res = fakeRes(); await refresh({ body: {} }, res); assert.strictEqual(res.statusCode, 401); });
        const rSecret = process.env[login.refreshSecret];
        if (rSecret) {
            const expiredR = jwt.sign({ payload: { id: 'x' }, exp: Math.floor(Date.now() / 1000) - 60 }, rSecret);
            await check(`${login.name}: expired refresh token -> 401`, async () => { const res = fakeRes(); await refresh({ body: { token: expiredR } }, res); assert.strictEqual(res.statusCode, 401); });
        }
    }
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
