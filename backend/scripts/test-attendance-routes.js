'use strict';
// Route-table cross-check (attendance-fix2.md Part D): every HTTP call the Attendance pages
// make must hit a route the
// backend really registers. Walks backend/routes.js's real mounts and the routers' stacks,
// then reads the frontend services' URL + verb pairs from source. No DB needed.
//
// Run: node scripts/test-attendance-routes.js
require('dotenv').config();
global.global_config = require('../config/config.js');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const FRONTEND_FILES = [
    'src/app/shared/services/attendance/attendance-overview.service.ts',
    'src/app/shared/services/attendance/roster.service.ts',
    'src/app/shared/services/attendance/shifts.service.ts',
];

/** [{ method, path }] for every route mounted by backend/routes.js. */
const backendRoutes = () => {
    const mounts = [];
    const fakeApp = { use: (prefix, router) => { if (typeof prefix === 'string' && router && router.stack) mounts.push({ prefix, router }); } };
    require('../routes')(fakeApp);
    const out = [];
    mounts.forEach(({ prefix, router }) => {
        router.stack.filter((layer) => layer.route).forEach((layer) => {
            Object.keys(layer.route.methods).forEach((method) => {
                out.push({ method: method.toUpperCase(), path: (prefix + (layer.route.path === '/' ? '' : layer.route.path)).replace(/\/$/, '') });
            });
        });
    });
    return out;
};

/** [{ file, method, path }] from `url = `${environment.API_URL}/…`` + `this.http.<verb>(…)`. */
const frontendCalls = () => {
    const calls = [];
    FRONTEND_FILES.forEach((file) => {
        const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const base = (source.match(/url\s*=\s*`\$\{environment\.API_URL\}([^`]*)`/) || [])[1];
        assert.ok(base, `${file}: no url base found`);
        const re = /this\.http\.(get|post|put|delete|patch)\s*(?:<[^(]*>)?\(\s*(?:`\$\{this\.url\}([^`]*)`|this\.url\b)/g;
        let match;
        while ((match = re.exec(source))) {
            const suffix = (match[2] || '').replace(/\$\{[^}]+\}/g, ':param');
            calls.push({ file, method: match[1].toUpperCase(), path: base + suffix });
        }
    });
    return calls;
};

const matches = (route, call) => {
    if (route.method !== call.method) return false;
    const pattern = new RegExp('^' + route.path.replace(/:[^/]+/g, '[^/]+') + '$');
    return pattern.test(call.path);
};

const routes = backendRoutes();
const calls = frontendCalls();
let failed = 0;
assert.ok(calls.length >= 18, `expected the full Attendance call list, found ${calls.length}`);
calls.forEach((call) => {
    const ok = routes.some((route) => matches(route, call));
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${call.method.padEnd(6)} ${call.path}   (${path.basename(call.file)})`);
});
console.log(`\n${calls.length - failed}/${calls.length} frontend calls match a registered route.`);
process.exit(failed ? 1 : 0);
