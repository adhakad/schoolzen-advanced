import { test, expect, Page, Locator } from '@playwright/test';
import { hermetic } from './hermetic';

// attendance-fix2.md — browser checks for Part A (every dropdown / picker on Overview, Roster
// and Manage Shifts is the shared overlay, opening directly below its trigger; one month-filter
// width) and Part D (class-first student marking; a refused mark keeps the cell and offers
// Retry, never "Route not found"). Same hermetic setup as the other attendance specs: the built
// app, with every API call answered by fixtures.

const TODAY = '2026-10-16';
const MONTH = '2026-10';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fakeJwt = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ payload: { id: 'a1', name: 'Admin' }, exp: 4102444800 }) + '.sig';

const days = Array.from({ length: 31 }, (_, i) => {
  const dateKey = `${MONTH}-${String(i + 1).padStart(2, '0')}`;
  return { dateKey, day: i + 1, dow: DOW[new Date(`${dateKey}T00:00:00Z`).getUTCDay()], isToday: dateKey === TODAY, isFuture: dateKey > TODAY };
});
const cells = (today: object) => Object.fromEntries(days.map((col) => [col.dateKey, col.dateKey < TODAY ? { s: 'P', t: '8:10 AM' } : col.dateKey === TODAY ? today : { s: 'M', f: 1 }]));
const staffRow = { _id: 'p1', name: 'Priya Sharma', idLine: 'EMP ID STF-0142', sub: 'Morning', code: 'STF-0142', shift: 'Morning', type: 'staff', live: false, presentCount: 9,
  mark: { from: '7:45 AM', to: '2:00 PM', open: true }, cells: cells({ s: 'A', t: null }) };
const studentRow = { _id: 'st1', name: 'Sita Verma', idLine: 'Roll 3', sub: '6th-A', code: '3', shift: 'Morning', type: 'student', live: false, presentCount: 9,
  mark: { from: '7:45 AM', to: '2:00 PM', open: true }, cells: cells({ s: 'A', t: null }) };
const gridOf = (personType: string, rows: object[]) => ({ month: MONTH, personType, today: TODAY, truncated: false, canMark: true, days, rows });
const morning = { _id: 's1', name: 'Morning Shift', code: 'M', startTime: '08:00', endTime: '14:00', earlyInMinutes: 15, graceMinutes: 10,
  halfDayAfterMinutes: 120, earlyOutMinutes: 30, lateOutMinutes: 60, status: 'active', people: 1, classes: 0 };
const classes = [
  { _id: 'c6', class: 6, label: '6th', hasStreams: false, sections: [{ _id: 's6a', name: 'A' }, { _id: 's6b', name: 'B' }], streams: [] },
  { _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [], streams: [{ _id: 'sci', name: 'science', sections: [{ _id: 'sciA', name: 'A' }] }] }
];

interface Seen { method: string; path: string; query: URLSearchParams; body: any }

/** Opens a page with fixtures; `override(path, method)` may answer a call first. */
const openApp = async (page: Page, route: string, override?: (path: string, method: string, url: URL) => { status: number; body: object } | null): Promise<Seen[]> => {
  const seen: Seen[] = [];
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', (r) => {
    const url = new URL(r.request().url());
    const method = r.request().method();
    let body: any = null;
    try { body = r.request().postDataJSON(); } catch { body = null; }
    seen.push({ method, path: url.pathname, query: url.searchParams, body });
    const custom = override ? override(url.pathname, method, url) : null;
    if (custom) return r.fulfill({ status: custom.status, contentType: 'application/json', body: JSON.stringify(custom.body) });
    const fixtures: Record<string, object> = {
      '/api/v2/attendance/grid': url.searchParams.get('personType') === 'student' ? gridOf('student', [studentRow]) : gridOf('staff', [staffRow]),
      '/api/v2/attendance/sync-status': { dateKey: TODAY, lastSyncAt: '9:05 AM', lastSyncDate: TODAY, lastFetched: 0, lastInserted: 0, lastUnmatched: 0, punchesToday: 0 },
      '/api/v2/attendance/live-status': { dateKey: TODAY, staff: {}, student: {} },
      '/api/v2/attendance/recent-arrivals': { dateKey: TODAY, staff: [], student: [] },
      '/api/v2/attendance/mark': { message: 'Marked Present.', cell: { s: 'P', t: '9:20 AM', src: 'manual' }, markedAt: '9:20 AM' },
      '/api/v2/student/filter-options': { classes, groups: [] },
      '/api/v2/staff/departments/options': { rows: [{ _id: 'd1', name: 'Teaching' }] },
      '/api/v2/attendance/roster/staff': {
        month: MONTH, days, truncated: false,
        rows: [{ _id: 'p1', name: 'Priya Sharma', empCode: 'STF-0142', designation: 'Teacher', days: Object.fromEntries(days.map((col) => [col.dateKey, 's1'])) }],
        legend: { shifts: [morning], weekOff: false }, stats: { byShift: [], unassigned: 0 }
      },
      '/api/v2/attendance/shifts': { rows: [morning], total: 1, page: 1, limit: 10, summary: { total: 1, active: 1, inactive: 0 } },
      '/api/v2/attendance/shifts/options': { rows: [morning] }
    };
    const answer = fixtures[url.pathname] ?? { rows: [], data: [], classes: [], groups: [], total: 0 };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) });
  });
  await page.goto(route);
  return seen;
};

/** The open overlay (portaled to <body>) is directly below its trigger — or above, flipped. */
const expectBelow = async (page: Page, trigger: Locator, label: string): Promise<void> => {
  const panel = page.locator('body > .dd-menu.dd-portal, body > .drp-portal').first();
  await expect(panel, label + ' opens a body overlay').toBeVisible();
  // An app-dd's visible control is its host (the inner trigger sits in its padding).
  const host = trigger.locator('xpath=ancestor-or-self::app-dd[1]');
  const t = (await host.count()) ? await host.boundingBox() : await trigger.boundingBox();
  const m = await panel.boundingBox();
  if (!t || !m) throw new Error(label + ': no box');
  const flipped = await panel.evaluate((el) => el.classList.contains('flipped'));
  const gap = flipped ? t.y - (m.y + m.height) : m.y - (t.y + t.height);
  expect(Math.round(gap), label + ' sits 8px from its trigger').toBe(8);
  const viewport = page.viewportSize()!;
  const clamped = m.x + m.width >= viewport.width - 9;
  const edge = Math.min(Math.abs(m.x - t.x), Math.abs((m.x + m.width) - (t.x + t.width)));
  if (!clamped && m.x > 9) expect(edge, label + ' is aligned with an edge of its trigger').toBeLessThanOrEqual(1);
};

/** Click every enabled trigger in `scope`, check its overlay, close it. */
const auditTriggers = async (page: Page, triggers: Locator, name: string): Promise<number> => {
  const count = await triggers.count();
  let checked = 0;
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    if (!(await trigger.isVisible())) continue;
    const disabled = await trigger.evaluate((el) => el.getAttribute('aria-disabled') === 'true' || !!el.closest('.disabled'));
    if (disabled) continue;
    await trigger.click();
    await expectBelow(page, trigger, `${name} #${i}`);
    await page.keyboard.press('Escape');
    await page.mouse.click(2, 2);
    checked += 1;
  }
  return checked;
};

test('Part A: every Overview control is a shared overlay below its trigger; equal pills; disabled pills say "All …"', async ({ page }) => {
  await openApp(page, '/v2/attendance/overview');
  await page.locator('.att-grid tbody tr').first().waitFor();
  expect(await page.locator('select').count(), 'no native <select>').toBe(0);
  const checked = await auditTriggers(page, page.locator('.sw-toolbar .dd-trigger, app-pagination-bar .dd-trigger'), 'overview');
  expect(checked).toBeGreaterThanOrEqual(4); // person type, department, month, rows per page
  // Pills: one width; disabled ones keep the "All …" text (global rules 7, 8).
  const widths = await page.locator('.ov-filter-row app-dd').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(new Set(widths).size, 'equal filter widths ' + widths).toBe(1);
  const disabledLabels = await page.locator('.ov-filter-row app-dd.disabled .dd-label').allTextContents();
  expect(disabledLabels.length).toBeGreaterThan(0);
  disabledLabels.forEach((text) => expect(text.trim()).toMatch(/^All /));
});

test('Part A + C: Roster filters and month open below; Delete → re-assign, with the Assign modal dropdown and range picker as overlays', async ({ page }) => {
  let rostered = true;
  const seen = await openApp(page, '/v2/attendance/roster', (path) => {
    if (path.endsWith('/roster/staff')) {
      return { status: 200, body: {
        month: MONTH, days, truncated: false,
        rows: [{ _id: 'p1', name: 'Priya Sharma', empCode: 'STF-0142', designation: 'Teacher', days: rostered ? Object.fromEntries(days.map((col) => [col.dateKey, 's1'])) : {} }],
        legend: { shifts: [morning], weekOff: false }, stats: { byShift: [], unassigned: rostered ? 0 : 1 }
      } };
    }
    if (path.endsWith('/roster/staff/clear') || path.endsWith('/roster/staff/assign')) {
      rostered = path.endsWith('/assign');
      return { status: 200, body: { message: 'Done.', updated: 1, failed: [], warning: null } };
    }
    return null;
  });
  await page.locator('.rg-grid tbody tr').first().waitFor();
  expect(await page.locator('select').count()).toBe(0);
  const checked = await auditTriggers(page, page.locator('.sw-toolbar .dd-trigger, app-pagination-bar .dd-trigger'), 'roster');
  expect(checked).toBeGreaterThanOrEqual(3);

  // Delete Selected (type-to-confirm) → one clear call.
  const box = () => page.locator('.rg-grid tbody tr').first().locator('input[type=checkbox]');
  await box().check();
  await page.getByRole('button', { name: /Delete Selected/ }).click();
  await page.locator('app-confirm-modal input').fill('DELETE');
  await page.locator('app-confirm-modal .confirm-delete').click();
  await expect.poll(() => seen.filter((s) => s.path.endsWith('/roster/staff/clear')).length).toBe(1);

  // Re-assign: the row is unrostered now; Assign opens the modal.
  await box().check();
  await page.getByRole('button', { name: /Assign to Selected/ }).click();
  const shiftTrigger = page.locator('#assign-shift .dd-trigger');
  await shiftTrigger.click();
  await expectBelow(page, shiftTrigger, 'assign shift');
  await page.locator('body > .dd-portal .dd-option', { hasText: 'Morning Shift' }).click();
  const rangeTrigger = page.locator('.range-input-trigger');
  await rangeTrigger.click();
  await expectBelow(page, rangeTrigger, 'applies-to range picker');
  await page.keyboard.press('Escape');
  await page.locator('.modal-foot .btn-brand').click();
  await expect.poll(() => seen.filter((s) => s.path.endsWith('/roster/staff/assign')).length).toBe(1);
  const assign = seen.find((s) => s.path.endsWith('/roster/staff/assign'))!;
  expect(assign.body).toEqual(expect.objectContaining({ staffIds: ['p1'], shiftId: 's1' }));
});

test('Part A: Manage Shifts form dropdowns (start, end, status) open below their triggers', async ({ page }) => {
  await openApp(page, '/v2/attendance/shifts');
  await page.getByRole('button', { name: /Create Shift/ }).click();
  await page.locator('#shift-start').waitFor();
  expect(await page.locator('select').count()).toBe(0);
  for (const id of ['#shift-start', '#shift-end', '#shift-status']) {
    const trigger = page.locator(`${id} .dd-trigger`);
    await trigger.click();
    await expectBelow(page, trigger, id);
    await page.keyboard.press('Escape');
  }
});

// Global rule 7 (2026-10-18): the month filter is ONE filter cell of its row — (row − 40px) / 6
// on desktop, (row − 8px) / 2 on a phone — whatever the month, with 3-letter month names.
test('Part A: month filter is one filter cell wide on Overview and Roster, any month, desktop and 390px', async ({ page }) => {
  const cell = (row: number, perRow: number) => (row - (perRow - 1) * 8) / perRow;
  for (const route of ['/v2/attendance/overview', '/v2/attendance/roster']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, route);
    const nav = page.locator('app-month-nav .month-nav');
    await nav.waitFor();
    const rowWidth = () => page.locator('app-month-nav').evaluate((el) => (el.parentElement as HTMLElement).clientWidth);
    const widths: number[] = [];
    for (let i = 0; i < 12; i++) {
      widths.push(Math.round((await nav.boundingBox())!.width));
      expect(await nav.locator('.dd-label').textContent()).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
      await nav.locator('.bi-chevron-right').first().click();
    }
    expect(new Set(widths), route + ' ' + widths).toEqual(new Set([Math.round(cell(await rowWidth(), 6))]));
    await page.setViewportSize({ width: 390, height: 800 });
    expect(Math.abs((await nav.boundingBox())!.width - cell(await rowWidth(), 2))).toBeLessThan(1.5);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('Part D: Student shows no rows until a Class is chosen, then marks Present with the class context', async ({ page }) => {
  const seen = await openApp(page, '/v2/attendance/overview');
  await page.locator('.att-grid tbody tr').first().waitFor();
  await page.locator('.ov-filter-row app-dd').nth(0).locator('.dd-trigger').click();
  await page.locator('body > .dd-portal .dd-option', { hasText: 'Student' }).click();
  await expect(page.locator('.needs-class')).toHaveText(/Select a class to see students and mark attendance/);
  await expect(page.locator('.att-grid tbody tr')).toHaveCount(0);
  expect(seen.filter((s) => s.path.endsWith('/grid') && s.query.get('personType') === 'student'), 'no student grid request without a class').toHaveLength(0);

  await page.locator('.ov-filter-row app-dd').nth(3).locator('.dd-trigger').click();
  await page.locator('body > .dd-portal .dd-option', { hasText: '6th' }).click();
  await expect(page.locator('.att-grid tbody tr')).toHaveCount(1);
  const gridCall = seen.filter((s) => s.path.endsWith('/grid')).pop()!;
  expect(gridCall.query.get('classId')).toBe('c6');

  const chip = page.locator('tbody tr').first().locator('td.today-col button.chip');
  await chip.click();
  await page.locator('body > .mark-pop .mark-option', { hasText: 'Mark Present' }).click();
  await expect(chip.locator('.s')).toHaveText('P');
  const mark = seen.find((s) => s.path.endsWith('/mark'))!;
  expect(mark.body).toEqual(expect.objectContaining({ personType: 'student', personId: 'st1', status: 'Present', classId: 'c6' }));
  expect(mark.body.session).toMatch(/^\d{4}-\d{4}$/);
});

test('Part D: a refused mark keeps the cell, shows the reason and Retry — no refresh call, no raw JSON', async ({ page }) => {
  let refuse = true;
  const seen = await openApp(page, '/v2/attendance/overview', (path) => {
    if (path.endsWith('/mark') && refuse) {
      return { status: 403, body: { error: { category: 'PermissionError', code: 'MARK_OUTSIDE_WINDOW', message: 'Attendance can only be marked today between 7:45 AM and 2:00 PM.' } } };
    }
    return null;
  });
  await page.locator('.att-grid tbody tr').first().waitFor();
  const chip = page.locator('tbody tr').first().locator('td.today-col button.chip');
  await chip.click();
  const pop = page.locator('body > .mark-pop');
  await pop.locator('.mark-option', { hasText: 'Mark Present' }).click();
  await expect(pop.locator('.mark-error')).toContainText('between 7:45 AM and 2:00 PM');
  await expect(pop.locator('.mark-error')).not.toContainText('{');
  await expect(chip.locator('.s')).toHaveText('A');
  expect(seen.some((s) => s.path.includes('/refresh')), 'a shaped 403 never triggers a token refresh').toBe(false);
  refuse = false;
  await pop.locator('.mark-error button', { hasText: 'Retry' }).click();
  await expect(chip.locator('.s')).toHaveText('P');
  expect(seen.filter((s) => s.path.endsWith('/mark'))).toHaveLength(2);
});
