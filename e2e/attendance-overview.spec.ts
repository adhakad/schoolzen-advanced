import { test, expect, Page } from '@playwright/test';
import { hermetic, hermeticPage } from './hermetic';
import * as path from 'path';
import { pathToFileURL } from 'url';

// attendance-fix1.md §4: one parity check of the Overview table against
// docs/schoolzen-planning/v1/attendance/attendance-overview.html — chips, today column,
// sticky columns, past/future styles. The reference is loaded side by side and its computed
// styles are the expected values (including its additions block: chip 45x36, fixed sticky widths, past/future states).

const REFERENCE = pathToFileURL(path.resolve(__dirname, '..', 'docs', 'schoolzen-planning', 'v1', 'attendance', 'attendance-overview.html')).href;
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
const grid = {
  month: MONTH, personType: 'staff', today: TODAY, truncated: false, canMark: true, days,
  rows: [
    {
      _id: 'p1', name: 'Priya Sharma', idLine: 'EMP ID STF-0142', sub: 'Morning', code: 'STF-0142', shift: 'Morning', type: 'staff', live: false, presentCount: 9,
      mark: { from: '7:45 AM', to: '2:00 PM', open: true },
      cells: cellsFor((d) => (d < 16 ? (d % 7 === 4 ? { s: 'H', t: null } : d % 5 === 0 ? { s: 'L', t: '9:36 AM' } : d % 6 === 0 ? { s: 'A', t: null } : { s: 'P', t: '8:23 AM' })
        : d === 16 ? { s: 'P', t: '9:02 AM', src: 'manual' } : d % 7 === 4 ? { s: 'WO', f: 1 } : { s: 'M', f: 1 }))
    },
    {
      _id: 'p2', name: 'Rahul Verma', idLine: 'EMP ID STF-0203', sub: 'Morning', code: 'STF-0203', shift: 'Morning', type: 'staff', live: true, presentCount: 3,
      mark: { from: '7:45 AM', to: '2:00 PM', open: true },
      cells: cellsFor((d) => (d < 16 ? { s: 'P', t: '8:55 AM' } : d === 16 ? { s: 'P', t: '8:55 AM', src: 'device', p: '8:55 AM' } : { s: '—', n: 1 }))
    }
  ]
};
const fixtures: Record<string, object> = {
  '/api/v2/attendance/grid': grid,
  '/api/v2/attendance/live-status': { dateKey: TODAY, staff: { Present: 2, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, WeeklyOff: 0, live: 1 }, student: { Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, WeeklyOff: 0, live: 0 } },
  '/api/v2/attendance/recent-arrivals': { dateKey: TODAY, staff: [{ personId: 'p2', name: 'Rahul Verma', role: 'Teacher', idLabel: 'Staff ID', code: 'STF-0203', shift: 'Morning', time: '8:55 AM', presentThisMonth: 12 }], student: [] },
  '/api/v2/attendance/sync-status': { dateKey: TODAY, lastSyncAt: '9:05 AM', lastSyncDate: TODAY, lastFetched: 4, lastInserted: 4, lastUnmatched: 0, punchesToday: 42 },
  '/api/v2/attendance/mark': { message: 'Priya Sharma marked Late.', cell: { s: 'L', t: '9:20 AM', src: 'manual' }, markedAt: '9:20 AM' }
};

const openApp = async (page: Page): Promise<void> => {
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', (route) => {
    const url = new URL(route.request().url());
    const body = fixtures[url.pathname] ?? { rows: [], data: [], classes: [], groups: [], total: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/v2/attendance/overview');
  await page.locator('.att-grid tbody tr').first().waitFor();
};

/** Computed style values of the first element matching each selector. */
const styles = (page: Page, selector: string, props: string[]) => page.locator(selector).first().evaluate((el, keys) => {
  const cs = getComputedStyle(el as Element);
  return Object.fromEntries((keys as string[]).map((key) => [key, cs.getPropertyValue(key)]));
}, props);

test('Overview table matches attendance-overview.html', async ({ page, browser }) => {
  const reference = await hermeticPage(browser);
  await reference.goto(REFERENCE);
  await openApp(page);

  // Sticky checkbox / name / type columns at the reference's offsets.
  for (const selector of ['.att-grid th.check-col', '.att-grid th.name-col', '.att-grid th.type-col', '.att-grid td.name-cell']) {
    const want = await styles(reference, selector, ['position', 'left', 'z-index']);
    expect(await styles(page, selector, ['position', 'left', 'z-index']), selector).toEqual(want);
  }
  // Horizontal scroll inside the card, and it auto-scrolled to today.
  expect((await styles(page, '.grid-scroll', ['overflow-x']))['overflow-x']).toBe('auto');
  await expect.poll(() => page.locator('.grid-scroll').evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

  // Today column: header colour and cell background exactly as the reference.
  expect(await styles(page, '.att-grid th.today-col', ['color', 'background-color'])).toEqual(await styles(reference, '.att-grid th.today-col', ['color', 'background-color']));
  expect(await styles(page, '.att-grid td.today-col', ['background-color'])).toEqual(await styles(reference, '.att-grid td.today-col', ['background-color']));
  await expect(page.locator('.att-grid th.today-col')).toContainText('16');

  // Fixed column widths and table layout exactly as the reference.
  const widthProps = ['width', 'min-width', 'max-width'];
  for (const selector of ['.att-grid th.check-col', '.att-grid th.name-col', '.att-grid th.type-col', '.att-grid th.day-cell']) {
    expect(await styles(page, selector, widthProps), selector).toEqual(await styles(reference, selector, widthProps));
  }
  expect(await styles(page, '.att-grid', ['table-layout', 'min-width'])).toEqual(await styles(reference, '.att-grid', ['table-layout', 'min-width']));

  // Filter row: 6 equal columns, the 7th wraps.
  const cols = await page.locator('.toolbar-row2').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(6);

  // Chips: size, padding, gap, radius, fonts and colours as the reference (45 x 36).
  const chipProps = ['width', 'height', 'padding-left', 'padding-right', 'row-gap', 'border-top-left-radius', 'flex-direction'];
  expect(await styles(page, '.chip.present', chipProps)).toEqual(await styles(reference, '.chip.present', chipProps));
  for (const status of ['present', 'late', 'absent', 'holiday']) {
    const want = await styles(reference, `.chip.${status} .s`, ['color', 'font-size', 'font-weight']);
    expect(await styles(page, `.chip.${status} .s`, ['color', 'font-size', 'font-weight']), status).toEqual(want);
  }
  expect(await styles(page, '.chip.present .t', ['font-size', 'white-space'])).toEqual(await styles(reference, '.chip.present .t', ['font-size', 'white-space']));
  await expect(page.locator('.chip.present .t').first()).toHaveText(/^\d{1,2}:\d{2} (AM|PM)$/);

  // Past / future / no-roster / today-markable treatment (§3c), the reference's classes and values.
  const stateProps = ['opacity', 'cursor', 'border-top-style', 'border-top-color'];
  for (const cls of ['locked-past', 'future', 'nocell', 'live-click']) {
    expect(await styles(page, `.chip.${cls}`, stateProps), cls).toEqual(await styles(reference, `.chip.${cls}`, stateProps));
  }
  await expect(page.locator('.chip.locked-past').first()).toHaveAttribute('title', "Past dates can't be changed");
  await expect(page.locator('.chip.future').first()).toHaveAttribute('title', 'Upcoming date (from roster)');
  await expect(page.locator('.chip.future .s').first()).toHaveText('M');

  // Live pulsing ring for punched-in-no-out, and the Recent Arrivals panel.
  await expect(page.locator('td.today-col .pulse-cell .pring .ring')).toHaveCount(1);
  await expect(page.locator('.arrival-row .aname')).toHaveText(['Rahul Verma']);

  // Identity line + the Last sync line.
  await expect(page.locator('.g-id').first()).toHaveText('EMP ID STF-0142');
  await expect(page.locator('.g-shift').first()).toHaveText('Morning');
  expect(await styles(page, '.g-id', ['font-size', 'font-weight', 'color'])).toEqual(await styles(reference, '.g-id', ['font-size', 'font-weight', 'color']));
  await expect(page.locator('.sync-line')).toContainText('Last sync: 9:05 AM / 42 punches today');

  // Manual marking: popover directly below today's chip, three options, saves on click.
  const todayChip = page.locator('tbody tr').first().locator('td.today-col button.chip');
  await todayChip.click();
  const pop = page.locator('body > .mark-pop.mark-portal');
  await expect(pop).toBeVisible();
  await expect(pop.locator('.mark-option')).toHaveText([/Mark Present/, /Mark Late/, /Mark Absent/]);
  await expect(pop.locator('.mark-option.on')).toHaveText(/Mark Present/);
  await expect(pop.locator('.mark-sub')).toHaveText('Today • EMP ID STF-0142');
  expect((await styles(page, 'body > .mark-pop', ['width']))['width']).toBe('230px');
  const chipBox = await todayChip.boundingBox();
  const popBox = await pop.boundingBox();
  expect(Math.round((popBox?.y ?? 0) - ((chipBox?.y ?? 0) + (chipBox?.height ?? 0)))).toBe(8);
  await pop.locator('.mark-option', { hasText: 'Mark Late' }).click();
  await expect(pop).toBeHidden();
  await expect(todayChip.locator('.s')).toHaveText('L');
  await expect(todayChip.locator('.t')).toHaveText('9:20 AM');

  await reference.close();
});

test('Overview on a 390px phone matches the reference mobile rules', async ({ browser }) => {
  const viewport = { width: 390, height: 800 };
  const reference = await hermeticPage(browser, { viewport });
  await reference.goto(REFERENCE);
  const page = await hermeticPage(browser, { viewport });
  await openApp(page);

  // Only checkbox + name sticky; Type and avatar hidden; narrower day columns.
  await expect(page.locator('.att-grid th.type-col')).toBeHidden();
  await expect(page.locator('.att-grid .g-avatar').first()).toBeHidden();
  const props = ['width', 'left'];
  for (const selector of ['.att-grid th.check-col', '.att-grid th.name-col', '.att-grid th.day-cell']) {
    expect((await styles(page, selector, props)), selector).toEqual(await styles(reference, selector, props));
  }
  // Filters 2 per row; the page itself never scrolls sideways, only the grid wrapper.
  const cols = await page.locator('.toolbar-row2').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);

  await reference.close();
  await page.close();
});
