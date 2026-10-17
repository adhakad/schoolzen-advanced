import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import { pathToFileURL } from 'url';

// attendance-fix1.md §4: one parity check of the Overview table against
// docs/schoolzen-planning/v1/attendance/attendance-overview.html — chips, today column,
// sticky columns, past/future styles. The reference is loaded side by side and its computed
// styles are the expected values (the chip is 46px wide instead of 38px by decision §3a).

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
      _id: 'p1', name: 'Priya Sharma', sub: 'ID STF-0142', code: 'STF-0142', shift: 'Morning', type: 'staff', live: false, presentCount: 9,
      mark: { from: '7:45 AM', to: '2:00 PM', open: true },
      cells: cellsFor((d) => (d < 16 ? (d % 7 === 4 ? { s: 'H', t: null } : d % 5 === 0 ? { s: 'L', t: '9:36 AM' } : d % 6 === 0 ? { s: 'A', t: null } : { s: 'P', t: '8:23 AM' })
        : d === 16 ? { s: 'P', t: '9:02 AM', src: 'manual' } : d % 7 === 4 ? { s: 'WO', f: 1 } : { s: 'M', f: 1 }))
    },
    {
      _id: 'p2', name: 'Rahul Verma', sub: 'ID STF-0203', code: 'STF-0203', shift: 'Morning', type: 'staff', live: true, presentCount: 3,
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
  const reference = await browser.newPage();
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

  // Chips: same height/radius/fonts/colours as the reference; width 46px (decided §3a).
  const chipProps = ['height', 'border-top-left-radius', 'flex-direction'];
  expect(await styles(page, '.chip.present', chipProps)).toEqual(await styles(reference, '.chip.present', chipProps));
  expect((await styles(page, '.chip.present', ['width']))['width']).toBe('46px');
  for (const status of ['present', 'late', 'absent', 'holiday']) {
    const want = await styles(reference, `.chip.${status} .s`, ['color', 'font-size', 'font-weight']);
    expect(await styles(page, `.chip.${status} .s`, ['color', 'font-size', 'font-weight']), status).toEqual(want);
  }
  expect((await styles(page, '.chip.present .t', ['font-size']))['font-size']).toBe('8px');
  await expect(page.locator('.chip.present .t').first()).toHaveText(/^\d{1,2}:\d{2} (AM|PM)$/);

  // Past / future / no-roster treatment (§3c).
  expect((await styles(page, '.chip.locked', ['opacity', 'cursor']))).toEqual({ opacity: '0.62', cursor: 'not-allowed' });
  await expect(page.locator('.chip.locked').first()).toHaveAttribute('title', "Past dates can't be changed");
  expect(await styles(page, '.chip.future', ['opacity', 'border-top-style', 'cursor'])).toEqual({ opacity: '0.45', 'border-top-style': 'dashed', cursor: 'not-allowed' });
  await expect(page.locator('.chip.future').first()).toHaveAttribute('title', 'Upcoming date');
  await expect(page.locator('.chip.future .s').first()).toHaveText('M');
  expect(await styles(page, '.chip.nocell', ['opacity', 'border-top-style'])).toEqual({ opacity: '0.35', 'border-top-style': 'dashed' });

  // Live pulsing ring for punched-in-no-out, and the Recent Arrivals panel.
  await expect(page.locator('td.today-col .pulse-cell .pring .ring')).toHaveCount(1);
  await expect(page.locator('.arrival-row .aname')).toHaveText(['Rahul Verma']);

  // Identity line + the Last sync line.
  await expect(page.locator('.g-shift').first()).toHaveText('ID STF-0142');
  await expect(page.locator('.sync-line')).toContainText('Last sync: 9:05 AM / 42 punches today');

  // Manual marking: popover directly below today's chip, three options, saves on click.
  const todayChip = page.locator('tbody tr').first().locator('td.today-col button.chip');
  await todayChip.click();
  const pop = page.locator('body > .mark-pop.mark-portal');
  await expect(pop).toBeVisible();
  await expect(pop.locator('.mark-option')).toHaveText([/Mark Present/, /Mark Late/, /Mark Absent/]);
  const chipBox = await todayChip.boundingBox();
  const popBox = await pop.boundingBox();
  expect(Math.round((popBox?.y ?? 0) - ((chipBox?.y ?? 0) + (chipBox?.height ?? 0)))).toBe(8);
  await pop.locator('.mark-option', { hasText: 'Mark Late' }).click();
  await expect(pop).toBeHidden();
  await expect(todayChip.locator('.s')).toHaveText('L');
  await expect(todayChip.locator('.t')).toHaveText('9:20 AM');

  await reference.close();
});
