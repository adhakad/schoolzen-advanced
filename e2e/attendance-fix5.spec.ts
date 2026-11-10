import { test, expect, Page, Browser } from '@playwright/test';
import { hermetic } from './hermetic';

// attendance-fix5.md §4 — browser tests at 390 / 1366 / 1920:
//   1. Roster: Person Type switches the type filters (hidden, not disabled) ONLY in Roster;
//      filters default to "All …"; a parent change resets its children; month filter last, 3 letters.
//   2. Roster: Bulk Assign / Bulk Edit / Bulk Delete inside Actions, enabled only with the
//      needed rows; no overflow at 390px.
//   3. Overview + Roster: Today is a normal date column (no sticky/z-index/shadow), fully
//      visible at the right end of the grid on load.
//   4. Overview: past chip popover, every attendance-fix4 B3 tooltip; locked dates not clickable.
//   5. Sticky column shadow (Rule 16) on the LAST left sticky column; no page overflow.
//   6. Header session from the v2 academic-session API, the same on every attendance page.
// Hermetic: built app + fixtures; the browser clock is fixed so "today" is mid-month.

const TODAY = '2026-10-16';
const MONTH = '2026-10';
const WIDTHS = [390, 1366, 1920];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PURPLE = 'rgba(140, 82, 255, 0.22)';
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
    { _id: 'x2', label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', status: 'active' },
    { _id: 'x1', label: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31', status: 'closed' }
  ],
  activeLabel: '2026-2027',
  defaultLabel: '2026-2027'
};
// Day pattern: 3 device, 4 holiday, 6 leave, 7 week off, 9 no roster; other past days A; 16 today;
// future days expected (17+), 25 a future holiday.
const gridRow = {
  _id: 'p1', name: 'Priya Sharma', idLine: 'EMP ID STF-0142', sub: 'Morning', code: 'STF-0142', shift: 'Morning', type: 'staff', live: false, presentCount: 9,
  mark: { from: '7:45 AM', to: '2:00 PM', open: true },
  cells: cellsFor((d) => d === 3 ? { s: 'P', t: '8:01 AM', src: 'device' } : d === 4 ? { s: 'H', t: null } : d === 6 ? { s: 'LV', t: null }
    : d === 7 ? { s: 'WO', t: null } : d === 9 ? { s: '—', n: 1 } : d < 16 ? { s: 'A', t: null }
      : d === 16 ? { s: 'P', t: '9:02 AM', src: 'manual' } : d === 25 ? { s: 'H', f: 1 } : { s: 'M', f: 1 })
};
const grid = (allowed: boolean) => ({
  month: MONTH, personType: 'staff', today: TODAY, truncated: false, canMark: true, days,
  editPast: { allowed, from: '2026-04-01', to: '2027-03-31' }, rows: [gridRow]
});
const rosterDays = Object.fromEntries(days.map((col) => [col.dateKey, col.dow === 'Sun' ? 'WO' : 's1']));
const baseFixtures: Record<string, object> = {
  '/api/v2/settings/academic-sessions/options': sessions,
  '/api/v2/attendance/grid': grid(true),
  '/api/v2/attendance/live-status': { dateKey: TODAY, staff: { Present: 1, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, WeeklyOff: 0, live: 0 }, student: { Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, WeeklyOff: 0, live: 0 } },
  '/api/v2/attendance/recent-arrivals': { dateKey: TODAY, staff: [], student: [] },
  '/api/v2/attendance/sync-status': { dateKey: TODAY, lastSyncAt: '9:05 AM', lastSyncDate: TODAY, lastFetched: 0, lastInserted: 0, lastUnmatched: 0, punchesToday: 0 },
  '/api/v2/attendance/roster/staff': {
    month: MONTH, days, truncated: false,
    rows: [
      { _id: 'p1', name: 'Priya Sharma', empCode: 'STF-0142', designation: 'Teacher', days: rosterDays },
      { _id: 'p2', name: 'Arjun Rao', empCode: 'STF-0150', designation: 'Clerk', days: {} }
    ],
    legend: { shifts: [morning], weekOff: true },
    stats: { byShift: [{ shiftId: 's1', name: 'Morning Shift', count: 1 }], unassigned: 1 }
  },
  '/api/v2/attendance/shifts/options': { rows: [morning] },
  '/api/v2/attendance/roster/classes': {
    rows: [{ key: 'c2||', classId: 'c2', streamId: null, sectionId: null, level: 0, label: 'Class 8', selectable: true, shiftId: 's1' }],
    legend: { shifts: [morning], weekOff: false }, stats: { byShift: [{ shiftId: 's1', name: 'Morning Shift', count: 1 }], unassigned: 0 }
  },
  '/api/v2/attendance/shifts': { rows: [morning], total: 1, page: 1, limit: 25 },
  '/api/v2/staff/departments/options': { rows: [{ _id: 'd1', name: 'Teaching' }, { _id: 'd2', name: 'Office' }] },
  '/api/v2/staff/designations/options': { rows: [{ _id: 'g1', title: 'Teacher', departmentId: 'd1' }, { _id: 'g2', title: 'Clerk', departmentId: 'd2' }] },
  '/api/v2/student/filter-options': {
    classes: [
      { _id: 'c1', class: 11, label: 'Class 11', hasStreams: true, sections: [], streams: [{ _id: 'st1', name: 'science', sections: [{ _id: 'sec1', name: 'A' }] }] },
      { _id: 'c2', class: 8, label: 'Class 8', hasStreams: false, sections: [{ _id: 'sec2', name: 'B' }], streams: [] }
    ],
    groups: [{ _id: 'gr1', name: 'PCM', classId: 'c1', streamId: 'st1' }]
  }
};

const openApp = async (page: Page, route: string, overrides: Record<string, object> = {}, requests: URL[] = []): Promise<void> => {
  await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  const fixtures = { ...baseFixtures, ...overrides };
  await page.route('http://localhost:3000/**', (r) => {
    const url = new URL(r.request().url());
    requests.push(url);
    const body = fixtures[url.pathname] ?? { rows: [], data: [], classes: [], groups: [], total: 0 };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(route);
};
const newPage = (browser: Browser, width: number) => browser.newPage({ viewport: { width, height: 900 } });
const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const visibleCells = (page: Page, selector: string) => page.locator(selector).evaluateAll((els) => els
  .filter((el) => (el as HTMLElement).offsetParent)
  .map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), text: ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim(), disabled: el.querySelector('[aria-disabled="true"]') !== null }; }));
const filterCells = (page: Page) => visibleCells(page, '.toolbar-row2 > *');
const pick = async (page: Page, ariaLabel: string, option: string) => {
  await page.locator(`app-dd .dd-trigger[aria-label="${ariaLabel}"]`).click();
  await page.locator('.dd-option', { hasText: option }).first().click();
};

test.describe.configure({ mode: 'parallel' });

for (const width of WIDTHS) {
  // ---- 4.1 -------------------------------------------------------------------------------
  test(`4.1 Roster filters by Person Type, defaults, cascade reset, month last (${width}px)`, async ({ browser }) => {
    const page = await newPage(browser, width);
    await openApp(page, '/v2/attendance/roster');
    await page.locator('.rg-grid tbody tr').first().waitFor();
    let cells = await filterCells(page);
    expect(cells.map((c) => c.text)).toEqual(['Staff', 'All departments', 'All designations', 'Oct 2026']);
    expect(cells[2].disabled).toBe(true);
    // Student filters are HIDDEN (not in the DOM), not disabled.
    await expect(page.locator('app-dd .dd-trigger[aria-label="Filter by class"]')).toHaveCount(0);
    // Parent change resets children.
    await pick(page, 'Filter by department', 'Teaching');
    await pick(page, 'Filter by designation', 'Teacher');
    expect((await filterCells(page)).map((c) => c.text)).toEqual(['Staff', 'Teaching', 'Teacher', 'Oct 2026']);
    await pick(page, 'Filter by department', 'Office');
    expect((await filterCells(page)).map((c) => c.text)).toEqual(['Staff', 'Office', 'All designations', 'Oct 2026']);
    // Student: the other type's filters disappear, everything back on "All …".
    await pick(page, 'Person type', 'Student');
    cells = await filterCells(page);
    expect(cells.map((c) => c.text)).toEqual(['Student', 'All classes', 'All streams', 'All stream groups', 'All sections', 'Oct 2026']);
    await expect(page.locator('app-dd .dd-trigger[aria-label="Filter by department"]')).toHaveCount(0);
    await pick(page, 'Filter by class', 'Class 11');
    await pick(page, 'Filter by stream', 'Science');
    await pick(page, 'Filter by class', 'Class 8');
    cells = await filterCells(page);
    expect(cells[2].text).toBe('All streams');
    expect(cells[3].text).toBe('All stream groups');
    // Month filter: last cell, one filter wide, 3-letter month.
    const last = cells[cells.length - 1];
    expect(last.text).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
    expect(Math.abs(last.w - cells[1].w)).toBeLessThanOrEqual(1);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    await page.close();
  });

  // ---- 4.2 -------------------------------------------------------------------------------
  test(`4.2 Roster Bulk actions inside Actions, enabled only with the needed rows (${width}px)`, async ({ browser }) => {
    const page = await newPage(browser, width);
    await openApp(page, '/v2/attendance/roster');
    await page.locator('.rg-grid tbody tr').first().waitFor();
    await expect(page.locator('app-data-toolbar button', { hasText: /^\s*Bulk/ })).toHaveCount(0);
    const state = async () => {
      await page.locator('.tb-actions-btn').click();
      const items = await page.locator('.tb-menu-item').evaluateAll((els) => els.map((el) => ({
        label: (el.querySelector('.tb-item-label')?.textContent || '').trim(), off: el.getAttribute('aria-disabled') === 'true'
      })));
      const menu = await page.locator('.tb-menu').boundingBox();
      expect(menu!.x).toBeGreaterThanOrEqual(0);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await page.keyboard.press('Escape');
      return items;
    };
    expect(await state()).toEqual([
      { label: 'Bulk Assign', off: true }, { label: 'Bulk Edit', off: true }, { label: 'Bulk Delete', off: true }]);
    // A row WITH a roster → Edit + Delete; Assign stays off.
    await page.locator('.rg-grid tbody tr').nth(0).locator('input[type=checkbox]').check();
    expect(await state()).toEqual([
      { label: 'Bulk Assign (1)', off: true }, { label: 'Bulk Edit (1)', off: false }, { label: 'Bulk Delete (1)', off: false }]);
    // Only a row WITHOUT a roster → Assign only.
    await page.locator('.rg-grid tbody tr').nth(0).locator('input[type=checkbox]').uncheck();
    await page.locator('.rg-grid tbody tr').nth(1).locator('input[type=checkbox]').check();
    const onlyAssign = await state();
    expect(onlyAssign.map((i) => i.off)).toEqual([false, true, true]);
    expect(onlyAssign[0].label).toMatch(/^Bulk Assign/);
    const [actions] = await visibleCells(page, '.tb-actions-btn');
    expect(actions.w).toBeGreaterThanOrEqual(width <= 640 ? 110 : 130);
    await page.close();
  });

  // ---- 4.3 + 4.5 -------------------------------------------------------------------------
  for (const [name, route, gridSel] of [['Overview', '/v2/attendance/overview', '.att-grid'], ['Roster', '/v2/attendance/roster', '.rg-grid']] as const) {
    test(`4.3/4.5 ${name}: Today a normal column at the right end; sticky shadow on the last sticky column (${width}px)`, async ({ browser }) => {
      const page = await newPage(browser, width);
      await openApp(page, route);
      await page.locator(`${gridSel} tbody tr`).first().waitFor();
      // Same position / z-index / shadow as an ordinary day column (Roster cells are all
      // position:relative for the pencil); never sticky, never raised, no shadow.
      const styleOf = (sel: string) => page.locator(sel).first().evaluate((el) => { const cs = getComputedStyle(el); return { position: cs.position, z: cs.zIndex, shadow: cs.boxShadow }; });
      for (const [todaySel, otherSel] of [[`${gridSel} th.today-col`, `${gridSel} thead th:nth-last-child(2)`], [`${gridSel} tbody tr:first-child td.today-col`, `${gridSel} tbody tr:first-child td:nth-last-child(2)`]]) {
        const [today, other] = [await styleOf(todaySel), await styleOf(otherSel)];
        expect(today, todaySel).toEqual(other);
        expect(['static', 'relative']).toContain(today.position);
        expect(today.z).toBe('auto');
        expect(today.shadow).toBe('none');
      }
      // Fully visible at the right end of the grid wrapper (only the wrapper scrolled).
      const wrap = page.locator(`${gridSel}`).locator('xpath=ancestor::div[contains(@class,"grid-scroll")][1]');
      // When the days before Today don't fill the wrapper (wide screens, narrow columns) the
      // wrapper can't scroll further left than day 1: Today must then be fully visible with
      // the wrapper at scrollLeft 0 — that IS as far right as it can sit.
      await expect.poll(async () => {
        const [cell, box, left] = await Promise.all([page.locator(`${gridSel} th.today-col`).boundingBox(), wrap.boundingBox(), wrap.evaluate((el) => el.scrollLeft)]);
        const right = (box!.x + box!.width) - (cell!.x + cell!.width);
        return cell!.x >= box!.x && right >= 0 && (right <= 30 || left === 0);
      }).toBe(true);
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
      // Earlier days sit to its left (chronological, nothing moved).
      const heads = await page.locator(`${gridSel} thead th`).allTextContents();
      const dayNums = heads.map((t) => Number((t.match(/(\d+)\s*$/) || [])[1])).filter((n) => n > 0);
      expect(dayNums).toEqual(days.map((d) => d.day));
      // Rule 16: only the LAST visible left sticky column carries the purple shadow.
      const sticky = await page.locator(`${gridSel} tbody tr:first-child td`).evaluateAll((els) => els
        .filter((el) => (el as HTMLElement).offsetParent && getComputedStyle(el).position === 'sticky')
        .map((el) => ({ left: el.getBoundingClientRect().left, shadow: getComputedStyle(el).boxShadow, bg: getComputedStyle(el).backgroundColor })));
      expect(sticky.length).toBeGreaterThan(0);
      const lastSticky = sticky.reduce((a, b) => (b.left > a.left ? b : a));
      expect(lastSticky.shadow).toContain(PURPLE);
      sticky.filter((c) => c !== lastSticky).forEach((c) => expect(c.shadow).not.toContain(PURPLE));
      sticky.forEach((c) => expect(c.bg).toBe('rgb(255, 255, 255)'));
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await page.close();
    });
  }

  // ---- 4.4 -------------------------------------------------------------------------------
  test(`4.4 Overview past chip popover, B3 tooltips, locked dates not clickable (${width}px)`, async ({ browser }) => {
    const page = await newPage(browser, width);
    await openApp(page, '/v2/attendance/overview');
    await page.locator('.att-grid tbody tr').first().waitFor();
    const cellOf = (day: number) => page.locator('.att-grid tbody tr').first().locator(`td:nth-child(${3 + day})`);
    const title = (day: number) => cellOf(day).locator('.chip').getAttribute('title');
    expect(await title(8)).toBe('Past date, click to change');
    expect(await title(3)).toBe("Recorded by the device, can't be changed");
    for (const d of [4, 6, 7]) expect(await title(d)).toBe("Holiday, leave or week off can't be changed here");
    expect(await title(25)).toBe('Upcoming date');
    expect(await title(20)).toMatch(/^Upcoming date/);
    expect(await title(9)).toBe('No roster for this day');
    // Locked dates are plain chips (no button) and clicking them opens nothing.
    for (const d of [3, 4, 6, 7, 9, 20, 25]) {
      await expect(cellOf(d).locator('button')).toHaveCount(0);
      await cellOf(d).locator('.chip').click({ force: true });
      await expect(page.locator('.mark-pop:visible')).toHaveCount(0);
    }
    // The editable past chip opens the past popover with three choices, inside the viewport.
    await cellOf(8).locator('button.chip.past-edit').click();
    const pop = page.locator('.mark-pop.mark-portal');
    await expect(pop).toBeVisible();
    await expect(pop.locator('.cap')).toHaveText('Past date. This change is saved in the activity log.');
    await expect(pop.locator('.mark-option')).toHaveCount(3);
    const box = await pop.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    await page.close();
  });

  test(`4.4 Overview without attendance-edit-past: permission tooltip, not clickable (${width}px)`, async ({ browser }) => {
    const page = await newPage(browser, width);
    await openApp(page, '/v2/attendance/overview', { '/api/v2/attendance/grid': grid(false) });
    await page.locator('.att-grid tbody tr').first().waitFor();
    const cell = page.locator('.att-grid tbody tr').first().locator('td:nth-child(11)');
    await expect(cell.locator('.chip')).toHaveAttribute('title', 'You do not have permission to change past attendance');
    await expect(cell.locator('button')).toHaveCount(0);
    await cell.locator('.chip').click({ force: true });
    await expect(page.locator('.mark-pop:visible')).toHaveCount(0);
    await page.close();
  });

  // ---- 4.6 -------------------------------------------------------------------------------
  test(`4.6 Header session from the v2 academic-session API, same on every attendance page (${width}px)`, async ({ browser }) => {
    const page = await newPage(browser, width);
    const requests: URL[] = [];
    await openApp(page, '/v2/attendance/overview', {}, requests);
    const labels: string[] = [];
    for (const route of ['/v2/attendance/overview', '/v2/attendance/roster', '/v2/attendance/shifts']) {
      await page.goto(route);
      const header = page.locator('app-shell-header app-dd').first();
      await expect(header).toContainText('2026-2027');
      labels.push(((await header.textContent()) || '').trim());
    }
    expect(new Set(labels).size).toBe(1);
    expect(requests.some((u) => u.pathname === '/api/v2/settings/academic-sessions/options')).toBe(true);
    const legacy = requests.filter((u) => /academic-session/i.test(u.pathname) && !u.pathname.startsWith('/api/v2/settings/academic-sessions'));
    expect(legacy.map((u) => u.pathname)).toEqual([]);
    expect(requests.some((u) => u.pathname === '/api/v2/attendance/grid' && u.searchParams.get('session') === '2026-2027')).toBe(true);
    await page.close();
  });
}
