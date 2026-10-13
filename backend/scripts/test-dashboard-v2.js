'use strict';
// Essential checks for the v2 Dashboard — pure functions and wiring only, no DB or Redis.
// The aggregation pipelines themselves are NOT executed here (no database in this script).
// Run: node scripts/test-dashboard-v2.js
const assert = require('assert');
const {
    attendanceDayPct, buildWeekBars, weekStartKey, feeDonut, monthBounds, monthOf, holidayDaysInMonth,
    QUICK_ACTIONS, canActOn, addDays,
} = require('../modules/helpers/dashboard/dashboard-rules');
const { WIDGETS, WIDGET_KEYS, HINT_WIDGETS, widgetFor, canSee, feePipeline, TTL } = require('../modules/helpers/dashboard/widgets');
const { buildSlice, buildSlices, keyFor, LOAD_FAILED } = require('../modules/helpers/dashboard/build-slices');
const cacheKeys = require('../modules/services/cache/cache-keys');
const { CHANNEL, HINT_GATE_MS } = require('../modules/services/dashboard/hint-publisher');
const { allows } = require('../modules/middleware/require-permission');
const { PERMISSION_MODULES } = require('../modules/models/settings/role');
const { dashboardSchema, widgetSchema } = require('../modules/validators/dashboard/dashboard.validator');
const dashboard = require('../modules/controllers/dashboard/dashboard.controller');

const perms = (modules, isSuperAdmin = false) => ({ isSuperAdmin, modules, scopes: [] });
const view = { canView: true, canEdit: false };
const edit = { canView: true, canEdit: true };
// A cache stub: always a miss, records the keys asked for.
const missCache = () => {
    const asked = [];
    return { asked, wrap: async (key, ttl, fn) => { asked.push({ key, ttl }); return fn(); } };
};
const ctxBase = { adminId: 'a1', sessionId: 's1', todayKey: '2026-09-06', month: '2026-09', allows };

const tests = {
    'attendance %: present/late/half-day over working records': () => {
        assert.deepStrictEqual(attendanceDayPct({ Present: 90, Late: 4, HalfDay: 2, Absent: 4 }), { pct: 96, reason: null });
        // Leave is outside the denominator.
        assert.deepStrictEqual(attendanceDayPct({ Present: 50, Absent: 50, Leave: 20 }), { pct: 50, reason: null });
    },
    'attendance %: zero denominator is null with a reason, never NaN': () => {
        assert.deepStrictEqual(attendanceDayPct({}), { pct: null, reason: 'not-marked' });
        assert.deepStrictEqual(attendanceDayPct(undefined), { pct: null, reason: 'not-marked' });
        assert.deepStrictEqual(attendanceDayPct({ Holiday: 40 }), { pct: null, reason: 'holiday' });
        assert.deepStrictEqual(attendanceDayPct({ WeeklyOff: 40, Leave: 2 }), { pct: null, reason: 'weekly-off' });
        assert.deepStrictEqual(attendanceDayPct({ Leave: 3 }), { pct: null, reason: 'not-marked' });
    },
    'week bars: 7 days ending today, weekday labels, last one "Today"': () => {
        const rows = [
            { _id: { dateKey: '2026-09-06', status: 'Present' }, count: 96 },
            { _id: { dateKey: '2026-09-06', status: 'Absent' }, count: 4 },
            { _id: { dateKey: '2026-08-31', status: 'Present' }, count: 88 },
            { _id: { dateKey: '2026-08-31', status: 'Absent' }, count: 12 },
            { _id: { dateKey: '2026-09-05', status: 'WeeklyOff' }, count: 30 },
        ];
        const bars = buildWeekBars('2026-09-06', rows);
        assert.strictEqual(bars.length, 7);
        assert.deepStrictEqual(bars.map((b) => b.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today']);
        assert.strictEqual(bars[0].dateKey, '2026-08-31');
        assert.strictEqual(bars[0].pct, 88);
        assert.strictEqual(bars[5].pct, null);
        assert.strictEqual(bars[5].reason, 'weekly-off');
        assert.strictEqual(bars[6].pct, 96);
        assert.ok(bars[6].isToday && !bars[5].isToday);
        assert.strictEqual(weekStartKey('2026-09-06'), '2026-08-31');
        assert.strictEqual(addDays('2026-03-01', -1), '2026-02-28');
    },
    'fee donut: collected % of collected + due; nothing billed → null': () => {
        assert.deepStrictEqual(feeDonut({ collected: 1840000, due: 620000 }), { collected: 1840000, due: 620000, collectedPct: 75 });
        assert.deepStrictEqual(feeDonut(undefined), { collected: 0, due: 0, collectedPct: null });
        assert.deepStrictEqual(feeDonut({ collected: 0, due: 0 }), { collected: 0, due: 0, collectedPct: null });
        assert.strictEqual(feeDonut({ collected: 500, due: 0 }).collectedPct, 100);
    },
    'fee pipeline: tenant first, session-scoped, live records only, sums in Mongo': () => {
        const pipeline = feePipeline('a1', 'SESSION');
        assert.deepStrictEqual(pipeline[0], { $match: { adminId: 'a1', sessionId: 'SESSION', deletedAt: null } });
        const paymentsLookup = pipeline.find((stage) => stage.$lookup && stage.$lookup.as === 'pays');
        assert.deepStrictEqual(paymentsLookup.$lookup.pipeline[0], { $match: { adminId: 'a1', deletedAt: null } });
        assert.ok(pipeline[pipeline.length - 1].$group, 'ends in a single $group');
    },
    'calendar: month bounds and holiday days across a month boundary': () => {
        assert.deepStrictEqual(monthBounds('2026-02'), { monthKey: '2026-02', startKey: '2026-02-01', endKey: '2026-02-28' });
        assert.strictEqual(monthBounds('2026-13'), null);
        assert.strictEqual(monthBounds('nope'), null);
        assert.strictEqual(monthOf('2026-09-06'), '2026-09');
        const days = holidayDaysInMonth('2026-09', [
            { startDateKey: '2026-08-30', endDateKey: '2026-09-02' },
            { startDateKey: '2026-09-15', endDateKey: '2026-09-15' },
            { startDateKey: '2026-09-29', endDateKey: '2026-10-03' },
        ]);
        assert.deepStrictEqual(days, [1, 2, 15, 29, 30]);
    },
    'registry contract: key, tier, loader; hints only on attendance + approvals': () => {
        WIDGETS.forEach((widget) => {
            assert.ok(widget.key && typeof widget.load === 'function', widget.key);
            assert.ok(['long', 'short', 'none'].includes(widget.tier), `${widget.key} tier`);
            if (widget.permission) assert.ok(PERMISSION_MODULES.includes(widget.permission), `${widget.key} names a real grant`);
            if (widget.tier !== 'none') assert.ok(TTL[widget.tier] > 0);
        });
        assert.deepStrictEqual([...HINT_WIDGETS].sort(), ['approvals', 'attendance']);
        WIDGETS.filter((w) => w.hint).forEach((w) => assert.strictEqual(w.tier, 'short', `${w.key} hint ⇒ short tier`));
        assert.strictEqual(new Set(WIDGET_KEYS).size, WIDGET_KEYS.length);
        assert.strictEqual(widgetFor('payroll'), null);
    },
    'permissions: each widget needs its own module View; quick actions need none': () => {
        const viewer = perms({ fees: view, holiday: view });
        const visible = WIDGETS.filter((w) => canSee(w, viewer, allows)).map((w) => w.key);
        assert.deepStrictEqual(visible, ['fees', 'calendar', 'holidays', 'quickActions']);
        const superAdmin = perms({}, true);
        assert.strictEqual(WIDGETS.filter((w) => canSee(w, superAdmin, allows)).length, WIDGETS.length);
        assert.ok(PERMISSION_MODULES.includes('staff'));
        assert.strictEqual(widgetFor('staff').permission, 'staff');
    },
    'quick actions: allowed from the same grants the target pages enforce': async () => {
        const viewer = perms({ student: edit, 'fees-collect': view, marksheet: view });
        const slice = await buildSlice(widgetFor('quickActions'), { ...ctxBase, permissions: viewer }, missCache());
        const allowed = Object.fromEntries(slice.tiles.map((t) => [t.key, t.allowed]));
        assert.deepStrictEqual(allowed, {
            'new-admission': true, 'collect-fee': false, 'apply-leave': false, 'issue-tc': false, 'generate-marksheet': true,
        });
        assert.deepStrictEqual(slice.tiles.map((t) => t.key), QUICK_ACTIONS.map((t) => t.key));
    },
    'approve/reject from the dashboard needs approvals-action AND the source grant': () => {
        assert.strictEqual(canActOn(allows, perms({ 'approvals-action': edit }), 'leave'), false);
        assert.strictEqual(canActOn(allows, perms({ leave: edit }), 'leave'), false);
        assert.strictEqual(canActOn(allows, perms({ 'approvals-action': edit, leave: view }), 'leave'), false);
        assert.strictEqual(canActOn(allows, perms({ 'approvals-action': edit, leave: edit }), 'leave'), true);
        assert.strictEqual(canActOn(allows, perms({}, true), null), false);
        // Per viewer, after the cache: one cached slice, two different viewers.
        const widget = widgetFor('approvals');
        const cached = { total: 1, rows: [{ _id: 'r1', type: 'leave', name: 'Priya Sharma', days: 2 }], generatedAt: 'x' };
        const forAdmin = widget.personalize(cached, { permissions: perms({}, true), allows });
        const forViewer = widget.personalize(cached, { permissions: perms({ approvals: view }), allows });
        assert.strictEqual(forAdmin.rows[0].canAct, true);
        assert.strictEqual(forViewer.rows[0].canAct, false);
        assert.strictEqual(cached.rows[0].canAct, undefined, 'the cached slice is never mutated');
    },
    'isolation: one failing widget is its own error slice; the rest still ship': async () => {
        const ok = { key: 'ok', permission: null, tier: 'long', load: async () => ({ total: 3 }) };
        const bad = { key: 'bad', permission: null, tier: 'short', load: async () => { throw new Error('boom'); } };
        const slices = await buildSlices([ok, bad], { ...ctxBase, permissions: perms({}) }, missCache());
        assert.strictEqual(slices.ok.total, 3);
        assert.ok(slices.ok.generatedAt);
        assert.deepStrictEqual(slices.bad, { error: { ...LOAD_FAILED } });
        assert.strictEqual(LOAD_FAILED.code, 'DASHBOARD_LOAD_FAILED');
    },
    'caching: tier TTLs, none-tier never cached, day/month in the key': async () => {
        const cache = missCache();
        const ctx = { ...ctxBase, permissions: perms({}, true) };
        const stub = (widget) => ({ ...widget, load: async () => ({}) });
        await buildSlices([stub(widgetFor('attendance')), stub(widgetFor('students')), stub(widgetFor('calendar')), stub(widgetFor('quickActions'))], ctx, cache);
        assert.deepStrictEqual(cache.asked, [
            { key: 'a1:dashboard:attendance:s1:2026-09-06', ttl: TTL.short },
            { key: 'a1:dashboard:students:s1', ttl: TTL.long },
            { key: 'a1:dashboard:calendar:s1:2026-09', ttl: TTL.long },
        ]);
        assert.strictEqual(keyFor(widgetFor('holidays'), ctx), 'a1:dashboard:holidays:s1:2026-09-06');
        // Invalidation patterns cover exactly one widget, and every widget key matches its pattern.
        assert.strictEqual(cacheKeys.dashboard.widgetPattern('a1', 'fees'), 'a1:dashboard:fees:*');
        assert.ok(!cacheKeys.dashboard.hintGate('a1', 'attendance').startsWith('a1:dashboard:'), 'throttle gate survives a dashboard delPattern');
    },
    'live hints: data-free channel, throttled': () => {
        assert.strictEqual(CHANNEL, 'dashboard:widget-changed');
        assert.ok(HINT_GATE_MS >= 5000 && HINT_GATE_MS <= 10000);
    },
    'query validation: month format, no unknown fields': () => {
        assert.ok(!widgetSchema.validate({ adminId: 'a', month: '2026-09' }).error);
        assert.ok(widgetSchema.validate({ adminId: 'a', month: '2026-9' }).error);
        assert.ok(widgetSchema.validate({ adminId: 'a', month: '2026-13' }).error);
        assert.ok(dashboardSchema.validate({}).error, 'adminId required');
        assert.strictEqual(typeof dashboard.GetDashboard, 'function');
        assert.strictEqual(typeof dashboard.GetWidget, 'function');
    },
    'GetWidget refuses an unknown or forbidden widget before any query': async () => {
        const call = (key, permissions) => dashboard.GetWidget({ params: { key }, query: {}, adminId: 'a1', permissions }, {});
        await assert.rejects(call('payroll', perms({}, true)), (e) => e.code === 'DASHBOARD_WIDGET_NOT_FOUND' && e.statusCode === 404);
        await assert.rejects(call('fees', perms({ student: view })), (e) => e.category === 'PermissionError' && e.statusCode === 403);
    },
};

(async () => {
    let failed = 0;
    for (const [name, fn] of Object.entries(tests)) {
        try {
            await fn();
            console.log(`PASS  ${name}`);
        } catch (error) {
            failed += 1;
            console.log(`FAIL  ${name}\n      ${error.message}`);
        }
    }
    console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
    process.exit(failed ? 1 : 0);
})();
