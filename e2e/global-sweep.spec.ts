import { test, expect, Page } from '@playwright/test';
import { hermetic } from './hermetic';

// global-fixes.md sweep (rules 12, 14, 15, 17): every built v2 page at 390px and desktop —
// the page never scrolls sideways; the filter row is the shared grid (6 / 2 columns);
// toolbar buttons are 130 x 38 on desktop and 2 per row on a phone. Hermetic: empty fixtures.

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fakeJwt = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ payload: { id: 'a1', name: 'Admin' }, exp: 4102444800 }) + '.sig';

const PAGES = [
  'dashboard', 'academic-setup/classes-sections', 'academic-setup/subjects', 'academic-setup/subject-groups',
  'student/manage-students', 'student/admission', 'student/class-promotion',
  'staff/manage-staff', 'staff/departments', 'staff/designations',
  'attendance/overview', 'attendance/shifts', 'attendance/roster',
  'leave/requests', 'leave/create', 'leave/assign',
  'holiday/holidays', 'holiday/templates', 'holiday/assign',
  'payroll/generate-payroll', 'payroll/salary-payouts', 'payroll/salary-groups', 'payroll/assign-salary',
  'fees/fees', 'fees/fee-structure', 'fees/fee-reminder',
  'examination/admit-card-structure', 'examination/generate-admit-card', 'examination/marksheet-structure', 'examination/generate-marksheet',
  'certificates/tc-structure', 'certificates/generate-tc',
  'approvals',
  'settings/academic-sessions', 'settings/admission-form-fields', 'settings/roles-permissions', 'settings/marksheet-templates'
];

const open = async (page: Page, route: string): Promise<void> => {
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], data: [], classes: [], groups: [], total: 0, sessions: [] }) }));
  await page.goto('/v2/' + route);
  await page.locator('.page-head, h1').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
};

const measure = (page: Page) => page.evaluate(() => {
  const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;
  const rows = Array.from(document.querySelectorAll('.sz .toolbar-row2')).filter(visible)
    .map((row) => getComputedStyle(row).gridTemplateColumns.split(' ').length);
  const buttons = Array.from(document.querySelectorAll('.sz .toolbar-btn-group > button')).filter(visible)
    .map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top) }; });
  return { overflow: document.documentElement.scrollWidth - window.innerWidth, rows, buttons };
});

test.describe.configure({ mode: 'parallel' });

for (const route of PAGES) {
  test(`sweep ${route}`, async ({ browser }) => {
    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(desk, route);
    const d = await measure(desk);
    expect(d.overflow, 'desktop page overflow').toBeLessThanOrEqual(0);
    d.rows.forEach((cols) => expect(cols, 'desktop filter grid columns').toBe(6));
    d.buttons.forEach((b) => { expect(b.w, 'button width').toBe(130); expect(b.h, 'button height').toBe(38); });
    await desk.close();

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await open(phone, route);
    const m = await measure(phone);
    expect(m.overflow, '390px page overflow').toBeLessThanOrEqual(0);
    m.rows.forEach((cols) => expect(cols, 'phone filter grid columns').toBe(2));
    if (m.buttons.length >= 2) expect(m.buttons[0].y, 'two buttons per row').toBe(m.buttons[1].y);
    await phone.close();
  });
}
