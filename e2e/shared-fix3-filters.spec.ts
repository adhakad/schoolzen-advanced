import { test, expect, Page } from '@playwright/test';
import { hermetic } from './hermetic';

// shared-fix3.md: one filter system on every page. For each page with a toolbar:
//   1366px — filter rows of at most 6 equal cells (within 1px), 38px high, month filter last,
//            search 340px, toolbar buttons 130 x 38, every filter on "All …" at load;
//   390px  — 2 cells per row, no horizontal page overflow;
//   a parent filter change resets its children to "All …" (where the page has a cascade);
//   Overview keeps every filter visible on a Person Type switch, Roster hides the other type's.
// Hermetic: the built app with fixtures for the shared filter lookups, empty lists elsewhere.

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fakeJwt = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ payload: { id: 'a1', name: 'Admin' }, exp: 4102444800 }) + '.sig';

const departments = { rows: [{ _id: 'd1', name: 'Teaching', status: 'active' }, { _id: 'd2', name: 'Admin', status: 'active' }] };
const designations = { rows: [{ _id: 'g1', title: 'PRT', departmentId: 'd1' }, { _id: 'g2', title: 'Clerk', departmentId: 'd2' }] };
const filterOptions = {
  classes: [
    { _id: 'c6', class: 6, label: '6th', hasStreams: false, sections: [{ _id: 's6a', name: 'A' }, { _id: 's6b', name: 'B' }], streams: [] },
    {
      _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [],
      streams: [{ _id: 'sci', name: 'science', sections: [{ _id: 'sciA', name: 'A' }, { _id: 'sciB', name: 'B' }] }]
    }
  ],
  groups: [
    { _id: 'gen6', name: 'General', classId: 'c6', streamId: null, isSystemGroup: true },
    { _id: 'pcm', name: 'PCM', classId: 'c11', streamId: 'sci' },
    { _id: 'pcb', name: 'PCB', classId: 'c11', streamId: 'sci' }
  ]
};
const emptyRoster = { legend: { shifts: [], weekOff: false }, stats: { byShift: [], unassigned: 0 } };
const fixtures: Record<string, object> = {
  '/api/v2/staff/departments/options': departments,
  '/api/v2/staff/designations/options': designations,
  '/api/v2/student/filter-options': filterOptions,
  // Roster and Overview read these shapes on load; an empty list body breaks their render.
  '/api/v2/attendance/roster/staff': { month: '2026-10', days: [], rows: [], truncated: false, ...emptyRoster },
  '/api/v2/attendance/roster/classes': { rows: [], ...emptyRoster },
  '/api/v2/attendance/grid': { month: '2026-10', personType: 'staff', today: '2026-10-16', truncated: false, canMark: false, days: [], rows: [],
    editPast: { allowed: false, from: null, to: null } },
  '/api/v2/attendance/live-status': { dateKey: '2026-10-16', staff: {}, student: {} },
  '/api/v2/attendance/recent-arrivals': { dateKey: '2026-10-16', staff: [], student: [] }
};

// Every page of every module with a toolbar (the shared-fix3 audit table).
const PAGES = [
  'academic-setup/classes-sections', 'academic-setup/subjects', 'academic-setup/subject-groups',
  'student/manage-students', 'student/admission', 'student/class-promotion',
  'staff/manage-staff', 'staff/departments', 'staff/designations',
  'attendance/overview', 'attendance/shifts', 'attendance/roster',
  'leave/requests', 'leave/create', 'leave/assign',
  'holiday/holidays', 'holiday/templates', 'holiday/assign',
  'payroll/generate-payroll', 'payroll/salary-payouts', 'payroll/salary-groups', 'payroll/assign-salary',
  'fees/fees', 'fees/fee-structure', 'fees/fee-reminder',
  'examination/admit-card-structure', 'examination/generate-admit-card', 'examination/marksheet-structure', 'examination/generate-marksheet',
  'certificates/generate-tc',
  'approvals',
  'settings/academic-sessions', 'settings/roles-permissions'
];

// Filters that are not "All …" by design (the page's html): Person Type starts on Staff, Applicant
// on "All applicants", Class Promotion works on one chosen class, Generate Marksheet on a term.
const NOT_ALL = /^(Person type|Filter by applicant|Term \/ Exam)$/;
const PROMOTION_CLASS = 'student/class-promotion';

const open = async (page: Page, route: string): Promise<void> => {
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', (r) => {
    const url = new URL(r.request().url());
    const body = fixtures[url.pathname] ?? { rows: [], data: [], classes: [], groups: [], total: 0, sessions: [] };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/v2/' + route);
  await page.locator('.page-head, h1').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
};

interface Cell { tag: string; aria: string; label: string; x: number; y: number; w: number; h: number; month: boolean }

/** Grid items of each visible filter row (display:contents hosts are looked through). */
const measure = (page: Page) => page.evaluate(() => {
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const items = (el: Element): Element[] => Array.from(el.children).flatMap((child) =>
    getComputedStyle(child).display === 'contents' ? items(child) : [child]);
  const rows = Array.from(document.querySelectorAll('.sz .toolbar-row2')).filter(visible).map((row) => ({
    cols: getComputedStyle(row).gridTemplateColumns.split(' ').length,
    // shared-fix4 Rule 21.11: the grid follows the CARD width (6 / 4 at 641-819px / 2 at <= 640px).
    cardW: (row.closest('.sw-card-main') || row).getBoundingClientRect().width,
    cells: items(row).filter((el) => visible(el) && !el.classList.contains('fetch-error')).map((el) => {
      const r = el.getBoundingClientRect();
      const trigger = el.querySelector('.dd-trigger');
      return {
        tag: el.tagName.toLowerCase(),
        aria: trigger?.getAttribute('aria-label') || '',
        label: (el.querySelector('.dd-label')?.textContent || '').trim(),
        x: Math.round(r.left), y: Math.round(r.top), w: r.width, h: Math.round(r.height),
        month: el.tagName.toLowerCase() === 'app-month-nav'
      };
    })
  }));
  const search = Array.from(document.querySelectorAll('.sz .sw-toolbar .search, .sz .staff-toolbar .search')).filter(visible)
    .map((el) => Math.round(el.getBoundingClientRect().width));
  // Rule 21 (shared-fix4): only the non-primary buttons are a fixed 130 x 38 and pair up on phones.
  const buttons = Array.from(document.querySelectorAll('.sz .toolbar-btn-group > button:not(.btn-primary)')).filter(visible)
    .map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top) }; });
  return { overflow: document.documentElement.scrollWidth - window.innerWidth, rows, search, buttons };
});

const pick = async (page: Page, aria: RegExp, option: string): Promise<boolean> => {
  const trigger = page.locator('.toolbar-row2 .dd-trigger');
  const all = await trigger.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') || ''));
  const index = all.findIndex((label) => aria.test(label));
  if (index < 0) return false;
  const target = trigger.nth(index);
  if (await target.getAttribute('aria-disabled') === 'true') return false;
  await target.click();
  const choice = page.locator('.dd-menu.dd-portal .dd-option', { hasText: option }).first();
  if (!(await choice.count())) { await page.keyboard.press('Escape'); return false; }
  await choice.click();
  await page.waitForTimeout(150);
  return true;
};

const labelOf = async (page: Page, aria: RegExp): Promise<string> => {
  const pairs = await page.locator('.toolbar-row2 .dd-trigger').evaluateAll((els) => els.map((el) => [
    el.getAttribute('aria-label') || '', (el.querySelector('.dd-label')?.textContent || '').trim()]));
  return pairs.find(([aria_]) => aria.test(aria_))?.[1] ?? '';
};

const CLASS = /^(Filter by class|Class)$/;
const STREAM = /^(Filter by stream|Stream)$/;
const DEPT = /^(Filter by department|Department)$/;
const DESIG = /^(Filter by designation|Designation)$/;
const TYPE = /^(Person type|Filter by applicant)$/;

test.describe.configure({ mode: 'parallel' });

for (const route of PAGES) {
  test(`filters ${route}`, async ({ browser }, info) => {
    const notes: string[] = [];
    const desk = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await open(desk, route);
    const d = await measure(desk);
    expect(d.overflow, 'desktop page overflow').toBeLessThanOrEqual(0);
    for (const row of d.rows) {
      expect(row.cols, 'desktop grid columns').toBe(row.cardW <= 640 ? 2 : row.cardW < 820 ? 4 : 6);
      const lines = new Map<number, Cell[]>();
      row.cells.forEach((cell) => lines.set(cell.y, [...(lines.get(cell.y) || []), cell]));
      for (const line of lines.values()) {
        expect(line.length, 'cells per row').toBeLessThanOrEqual(6);
        const w0 = line[0].w;
        line.forEach((cell) => expect(Math.abs(cell.w - w0), `equal width (${cell.aria || cell.tag})`).toBeLessThanOrEqual(1));
      }
      row.cells.forEach((cell) => expect(cell.h, `height 38 (${cell.aria || cell.tag})`).toBe(38));
      const monthAt = row.cells.findIndex((cell) => cell.month);
      if (monthAt >= 0) {
        expect(monthAt, 'month filter is the last cell').toBe(row.cells.length - 1);
        const label = row.cells[monthAt].label;
        if (label !== 'Holiday Calendar') expect(label, '3-letter month').toMatch(/^[A-Z][a-z]{2} \d{4}$/);
      }
      row.cells.filter((cell) => !cell.month && !NOT_ALL.test(cell.aria) && !(route === PROMOTION_CLASS && CLASS.test(cell.aria)))
        .forEach((cell) => expect(cell.label, `"All …" on load (${cell.aria})`).toMatch(/^All /));
      notes.push(`${row.cells.length} cells, w=${row.cells.map((c) => c.w.toFixed(1)).join('/')}, h=${[...new Set(row.cells.map((c) => c.h))].join('/')}`);
    }
    d.search.forEach((w) => expect(w, 'search width (shared-fix4: 280)').toBe(280));
    d.buttons.forEach((b) => { expect(b.w, 'button width').toBe(130); expect(b.h, 'button height').toBe(38); });
    notes.push(`search=${d.search.join('/') || '-'} buttons=${d.buttons.map((b) => b.w + 'x' + b.h).join(',') || '-'}`);

    // A parent change resets its children to "All …".
    await pick(desk, TYPE, 'Student');
    if (await pick(desk, CLASS, '11th') && await pick(desk, STREAM, 'Science')) {
      expect(await labelOf(desk, STREAM)).toBe('Science');
      await pick(desk, CLASS, '6th');
      expect(await labelOf(desk, STREAM), 'stream reset').toBe('All streams');
      notes.push('class→stream reset ok');
    }
    await pick(desk, TYPE, 'Staff');
    if (await pick(desk, DEPT, 'Teaching') && await pick(desk, DESIG, 'PRT')) {
      expect(await labelOf(desk, DESIG)).toBe('PRT');
      await pick(desk, DEPT, 'Admin');
      expect(await labelOf(desk, DESIG), 'designation reset').toBe('All designations');
      notes.push('dept→designation reset ok');
    }
    await desk.close();

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await open(phone, route);
    const m = await measure(phone);
    expect(m.overflow, '390px page overflow').toBeLessThanOrEqual(0);
    m.rows.forEach((row) => expect(row.cols, 'phone grid columns').toBe(2));
    if (m.buttons.length >= 2) expect(m.buttons[0].y, 'two buttons per row').toBe(m.buttons[1].y);
    notes.push(`390: overflow=${m.overflow} cols=${m.rows.map((r) => r.cols).join('/') || '-'}`);
    await phone.close();
    info.annotations.push({ type: 'measured', description: notes.join(' | ') });
    console.log(`MEASURED ${route}: ${notes.join(' | ')}`);
  });
}

test('Overview: switching Person Type keeps every filter visible (inapplicable ones disabled)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page, 'attendance/overview');
  const count = () => page.locator('.toolbar-row2 app-dd, .toolbar-row2 app-month-nav').count();
  const disabled = () => page.locator('.toolbar-row2 app-dd.disabled').count();
  expect(await count()).toBe(8);
  const staffDisabled = await disabled();
  await pick(page, TYPE, 'Student');
  expect(await count()).toBe(8);
  expect(await labelOf(page, DEPT)).toBe('All departments');
  expect(await page.locator('.toolbar-row2 app-dd.disabled .dd-trigger[aria-label="Filter by department"]').count()).toBe(1);
  console.log(`MEASURED overview-type: cells staff=8 student=8, disabled staff=${staffDisabled} student=${await disabled()}`);
});

test('Roster: switching Person Type hides/shows that type\'s filters', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page, 'attendance/roster');
  const labels = () => page.locator('.toolbar-row2 .dd-trigger').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  const staff = await labels();
  expect(staff).toContain('Filter by department');
  expect(staff).not.toContain('Filter by class');
  await pick(page, TYPE, 'Student');
  const student = await labels();
  expect(student).toContain('Filter by class');
  expect(student).toContain('Filter by stream group');
  expect(student).not.toContain('Filter by department');
  console.log(`MEASURED roster-type: staff=${staff.length} dd, student=${student.length} dd`);
});
