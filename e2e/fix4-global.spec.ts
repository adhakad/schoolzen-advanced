import { test, expect, Page } from '@playwright/test';
import { hermetic } from './hermetic';

// attendance-fix4.md C + shared-fix2.md (browser): Roster filters by type, bulk buttons
// (130 x 38, 2 per row at 390px, no page overflow), Overview Today column at the right end and
// not sticky, past-date chip popover, and the header session (v2 list, default = covers today,
// switch re-reads the page, choice survives reload). Hermetic: built app + fixtures.

const TODAY = '2026-10-16';
const MONTH = '2026-10';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fakeJwt = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ payload: { id: 'a1', name: 'Admin' }, exp: 4102444800 }) + '.sig';
const days = Array.from({ length: 31 }, (_, i) => {
  const dateKey = `${MONTH}-${String(i + 1).padStart(2, '0')}`;
  return { dateKey, day: i + 1, dow: DOW[new Date(`${dateKey}T00:00:00Z`).getUTCDay()], isToday: dateKey === TODAY, isFuture: dateKey > TODAY };
});
const cellsFor = (pattern: (day: number) => object) => Object.fromEntries(days.map((col) => [col.dateKey, pattern(col.day)]));
const morning = { _id: 's1', name: 'Morning Shift', code: 'M', startTime: '08:00', endTime: '14:00', earlyInMinutes: 15, graceMinutes: 10, status: 'active' };
const sessions = {
  sessions: [
    { _id: 'x3', label: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31', status: 'active' },
    { _id: 'x2', label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', status: 'closed' },
    { _id: 'x1', label: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31', status: 'closed' }
  ],
  activeLabel: '2027-2028',
  defaultLabel: '2026-2027'
};
const fixtures: Record<string, object> = {
  '/api/v2/settings/academic-sessions/options': sessions,
  '/api/v2/attendance/grid': {
    month: MONTH, personType: 'staff', today: TODAY, truncated: false, canMark: true, days,
    editPast: { allowed: true, from: '2026-04-01', to: '2027-03-31' },
    rows: [{
      _id: 'p1', name: 'Priya Sharma', idLine: 'EMP ID STF-0142', sub: 'Morning', code: 'STF-0142', shift: 'Morning', type: 'staff', live: false, presentCount: 9,
      mark: { from: '7:45 AM', to: '2:00 PM', open: true },
      cells: cellsFor((d) => (d < 16 ? (d === 4 ? { s: 'H', t: null } : d === 5 ? { s: 'P', t: '8:01 AM', src: 'device' } : { s: 'A', t: null })
        : d === 16 ? { s: 'P', t: '9:02 AM', src: 'manual' } : { s: 'M', f: 1 }))
    }]
  },
  '/api/v2/attendance/live-status': { dateKey: TODAY, staff: { Present: 1, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, WeeklyOff: 0, live: 0 }, student: { Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, WeeklyOff: 0, live: 0 } },
  '/api/v2/attendance/recent-arrivals': { dateKey: TODAY, staff: [], student: [] },
  '/api/v2/attendance/sync-status': { dateKey: TODAY, lastSyncAt: '9:05 AM', lastSyncDate: TODAY, lastFetched: 0, lastInserted: 0, lastUnmatched: 0, punchesToday: 0 },
  '/api/v2/attendance/roster/staff': {
    month: MONTH, days, truncated: false,
    rows: [{ _id: 'p1', name: 'Priya Sharma', empCode: 'STF-0142', designation: 'Teacher', days: Object.fromEntries(days.map((col) => [col.dateKey, col.dow === 'Sun' ? 'WO' : 's1'])) }],
    legend: { shifts: [morning], weekOff: true },
    stats: { byShift: [{ shiftId: 's1', name: 'Morning Shift', count: 1 }], unassigned: 0 }
  },
  '/api/v2/attendance/shifts/options': { rows: [morning] }
};

const requests: URL[] = [];
const openApp = async (page: Page, route: string, keepStorage = false): Promise<void> => {
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', (r) => {
    const url = new URL(r.request().url());
    requests.push(url);
    const body = fixtures[url.pathname] ?? { rows: [], data: [], classes: [], groups: [], total: 0 };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  if (!keepStorage) await page.addInitScript(() => { try { if (!sessionStorage.getItem('kept')) { localStorage.clear(); sessionStorage.setItem('kept', '1'); } } catch { /* */ } });
  await page.goto(route);
};

const box = (page: Page, selector: string) => page.locator(selector).evaluateAll((els) => els
  .filter((el) => (el as HTMLElement).offsetParent)
  .map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim() }; }));

test.describe.configure({ mode: 'parallel' });

test('Roster: filters by Person Type, month filter last cell, Bulk buttons 130 x 38', async ({ page }) => {
  await openApp(page, '/v2/attendance/roster');
  await page.locator('.rg-grid tbody tr').first().waitFor();
  const labels = async () => (await box(page, '.toolbar-row2 > *')).map((cell) => cell.text.replace(/\s+/g, ' '));
  const staff = await labels();
  expect(staff.some((t) => t.includes('All departments'))).toBe(true);
  expect(staff.some((t) => t.includes('All classes'))).toBe(false);
  const cells = await box(page, '.toolbar-row2 > *');
  const month = cells[cells.length - 1];
  expect(month.text).toMatch(/^Oct 2026|Oct 2026/);
  expect(Math.abs(month.w - cells[0].w)).toBeLessThanOrEqual(1);
  const buttons = await box(page, '.toolbar-btn-group > button');
  expect(buttons.map((b) => b.text)).toEqual(['Bulk Assign', 'Bulk Edit', 'Bulk Delete']);
  buttons.forEach((b) => { expect(b.w).toBe(130); expect(b.h).toBe(38); });
  // Student: only the student filters.
  await page.locator('.toolbar-row2 > app-dd').first().click();
  await page.locator('.dd-option', { hasText: 'Student' }).first().click();
  const student = await labels();
  expect(student.some((t) => t.includes('All classes'))).toBe(true);
  expect(student.some((t) => t.includes('All stream groups'))).toBe(true);
  expect(student.some((t) => t.includes('All departments'))).toBe(false);
});

test('Roster at 390px: buttons 2 per row, filters 2 per row, no page overflow', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openApp(page, '/v2/attendance/roster');
  await page.locator('.rg-grid tbody tr').first().waitFor();
  const buttons = await box(page, '.toolbar-btn-group > button');
  expect(buttons[0].y).toBe(buttons[1].y);
  expect(buttons[2].y).toBeGreaterThan(buttons[0].y);
  const filters = await box(page, '.toolbar-row2 > *');
  expect(filters[0].y).toBe(filters[1].y);
  expect(filters[2].y).toBeGreaterThan(filters[0].y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.close();
});

for (const width of [1440, 390]) {
  test(`Overview Today is a normal column at the right end of the grid (${width}px)`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await openApp(page, '/v2/attendance/overview');
    await page.locator('.att-grid tbody tr').first().waitFor();
    const th = page.locator('.att-grid th.today-col');
    expect(await th.evaluate((el) => getComputedStyle(el).position)).toBe('static');
    await expect.poll(async () => {
      const [cell, wrap] = await Promise.all([th.boundingBox(), page.locator('.grid-scroll').boundingBox()]);
      const right = (wrap!.x + wrap!.width) - (cell!.x + cell!.width);
      return right >= 0 && right <= 30;
    }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.close();
  });
}

test('Overview past chip: editable with the past popover; device and holiday stay locked', async ({ page }) => {
  await openApp(page, '/v2/attendance/overview');
  await page.locator('.att-grid tbody tr').first().waitFor();
  const row = page.locator('.att-grid tbody tr').first();
  const cellOf = (day: number) => row.locator('td').nth(2 + day);
  await expect(cellOf(5).locator('.chip')).toHaveAttribute('title', "Recorded by the device, can't be changed");
  await expect(cellOf(4).locator('.chip')).toHaveAttribute('title', "Holiday, leave or week off can't be changed here");
  const past = cellOf(7).locator('button.chip.past-edit');
  await expect(past).toHaveAttribute('title', 'Past date, click to change');
  await past.click();
  const pop = page.locator('.mark-pop.mark-portal');
  await expect(pop).toBeVisible();
  await expect(pop.locator('.cap')).toHaveText('Past date. This change is saved in the activity log.');
  await expect(pop.locator('.mark-option')).toHaveCount(3);
});

test('Header session: v2 list, default covers today, switch re-reads, survives reload', async ({ page }) => {
  await openApp(page, '/v2/attendance/overview');
  await page.locator('.att-grid tbody tr').first().waitFor();
  const header = page.locator('app-shell-header app-dd').first();
  await expect(header).toContainText('2026-2027');
  await expect.poll(() => requests.some((u) => u.pathname === '/api/v2/attendance/grid' && u.searchParams.get('session') === '2026-2027')).toBe(true);
  await header.click();
  await page.locator('.dd-option', { hasText: '2025-2026' }).first().click();
  await expect.poll(() => requests.some((u) => u.pathname === '/api/v2/attendance/grid' && u.searchParams.get('session') === '2025-2026')).toBe(true);
  await page.goto('/v2/student/manage-students');
  await expect.poll(() => requests.some((u) => u.pathname.startsWith('/api/v2/student') && u.searchParams.get('session') === '2025-2026')).toBe(true);
  await page.reload();
  await expect(page.locator('app-shell-header app-dd').first()).toContainText('2025-2026');
});
