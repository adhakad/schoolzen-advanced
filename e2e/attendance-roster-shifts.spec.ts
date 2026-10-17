import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import { pathToFileURL } from 'url';

// attendance-fix1.md §1 / §2: Roster and Manage Shifts against their reference html — the
// reference's computed styles are the expected values. Same hermetic setup as
// attendance-overview.spec.ts (built app, fixtures for every API call).

const ref = (file: string): string => pathToFileURL(path.resolve(__dirname, '..', 'docs', 'schoolzen-planning', 'v1', 'attendance', file)).href;
const TODAY = '2026-10-16';
const MONTH = '2026-10';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fakeJwt = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ payload: { id: 'a1', name: 'Admin' }, exp: 4102444800 }) + '.sig';

const days = Array.from({ length: 31 }, (_, i) => {
  const dateKey = `${MONTH}-${String(i + 1).padStart(2, '0')}`;
  return { dateKey, day: i + 1, dow: DOW[new Date(`${dateKey}T00:00:00Z`).getUTCDay()], isToday: dateKey === TODAY, isFuture: dateKey > TODAY };
});
const morning = {
  _id: 's1', name: 'Morning Shift', code: 'M', startTime: '08:00', endTime: '14:00', earlyInMinutes: 15, graceMinutes: 10,
  halfDayAfterMinutes: 120, earlyOutMinutes: 30, lateOutMinutes: 60, status: 'active', people: 1, classes: 0
};
const fixtures: Record<string, object> = {
  '/api/v2/attendance/roster/staff': {
    month: MONTH, days, truncated: false,
    rows: [{ _id: 'p1', name: 'Priya Sharma', empCode: 'STF-0142', designation: 'Teacher',
      days: Object.fromEntries(days.map((col) => [col.dateKey, col.dow === 'Sun' ? 'WO' : 's1'])) }],
    legend: { shifts: [morning], weekOff: true },
    stats: { byShift: [{ shiftId: 's1', name: 'Morning Shift', count: 1 }], unassigned: 0 }
  },
  '/api/v2/attendance/shifts': { rows: [morning], total: 1, page: 1, limit: 10, summary: { total: 1, active: 1, inactive: 0 } },
  '/api/v2/attendance/shifts/options': { rows: [morning] }
};

const openApp = async (page: Page, route: string): Promise<void> => {
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', (r) => {
    const body = fixtures[new URL(r.request().url()).pathname] ?? { rows: [], data: [], classes: [], groups: [], total: 0 };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(route);
};

const styles = (page: Page, selector: string, props: string[]) => page.locator(selector).first().evaluate((el, keys) => {
  const cs = getComputedStyle(el as Element);
  return Object.fromEntries((keys as string[]).map((key) => [key, cs.getPropertyValue(key)]));
}, props);

const BOX = ['height', 'border-top-width', 'border-top-color', 'border-top-left-radius', 'font-size', 'padding-left'];

test('Roster grid and toolbar match roster.html', async ({ page, browser }) => {
  const reference = await browser.newPage();
  await reference.goto(ref('roster.html'));
  await openApp(page, '/v2/attendance/roster');
  await page.locator('.rg-grid tbody tr').first().waitFor();

  expect(await styles(page, '.search input', BOX)).toEqual(await styles(reference, '.search input', BOX));
  expect(await styles(page, '.sw-report-btn', ['height', 'border-top-left-radius', 'font-size', 'font-weight']))
    .toEqual(await styles(reference, '.sw-report-btn', ['height', 'border-top-left-radius', 'font-size', 'font-weight']));
  const chip = ['width', 'height', 'border-top-left-radius', 'font-size', 'font-weight', 'color'];
  expect(await styles(page, '.shift-chip.c0', chip)).toEqual(await styles(reference, '.shift-chip.c0', chip));
  expect(await styles(page, '.legend-chip.c0', ['font-size', 'padding-left', 'border-top-color', 'color']))
    .toEqual(await styles(reference, '.legend-chip.c0', ['font-size', 'padding-left', 'border-top-color', 'color']));
  // Today: day name AND date both brand-coloured (§1.3 — the only intended difference to the html's faded date).
  const brand = (await styles(reference, '.rg-grid th.today-col', ['color']))['color'];
  expect((await styles(page, '.rg-grid th.today-col', ['color', 'background-color'])))
    .toEqual(await styles(reference, '.rg-grid th.today-col', ['color', 'background-color']));
  expect((await styles(page, '.rg-grid th.today-col .dow', ['color']))['color']).toBe(brand);
  // Filters: 6 equal columns on desktop, 2 on a phone (global rule 12).
  const cols = () => page.locator('.toolbar-row2').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(await cols()).toBe(6);
  await page.setViewportSize({ width: 390, height: 800 });
  expect(await cols()).toBe(2);
  // Sticky columns take at most ~40% of a 390px phone (global rule 13); the page never scrolls sideways.
  const sticky = await page.evaluate(() => ['th.chk-col', 'th.name-col'].reduce((sum, s) => sum + (document.querySelector('.rg-grid ' + s) as HTMLElement).offsetWidth, 0));
  expect(sticky).toBeLessThanOrEqual(156);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await reference.close();
});

test('Manage Shifts form inputs match manage-shifts.html', async ({ page, browser }) => {
  const reference = await browser.newPage();
  await reference.goto(ref('manage-shifts.html'));
  await reference.evaluate(() => (window as unknown as { openShiftModal: () => void }).openShiftModal());
  await openApp(page, '/v2/attendance/shifts');
  await page.getByRole('button', { name: /Create Shift/ }).click();
  await page.locator('#shift-early').waitFor();

  // Punch-In and Staff Only inputs: the same box as the upper Name input, and as the reference.
  const want = await styles(reference, '#shiftNameInput', BOX);
  for (const id of ['#shift-name', '#shift-early', '#shift-grace', '#shift-halfday', '#shift-earlyout', '#shift-lateout']) {
    expect(await styles(page, id, BOX), id).toEqual(want);
  }
  await page.locator('#shift-grace').focus();
  await reference.locator('#shiftGraceInput').focus();
  expect(await styles(page, '#shift-grace', ['border-top-color'])).toEqual(await styles(reference, '#shiftGraceInput', ['border-top-color']));

  // Submit stays disabled until Early Punch and Grace hold valid numbers (§2.3).
  const submit = page.locator('.modal-foot .btn-brand');
  await page.locator('#shift-name').fill('Day');
  await page.locator('#shift-start').click();
  await page.locator('.dd-option', { hasText: '8:00 AM' }).first().click();
  await page.locator('#shift-end').click();
  await page.locator('.dd-option', { hasText: '2:00 PM' }).first().click();
  await expect(submit).toBeDisabled();
  await page.locator('#shift-early').fill('15');
  await expect(submit).toBeDisabled();
  await page.locator('#shift-grace').fill('10');
  await expect(submit).toBeEnabled();
  await reference.close();
});
