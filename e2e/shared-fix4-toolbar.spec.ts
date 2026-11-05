import { test, expect, Page } from '@playwright/test';
import { hermetic } from './hermetic';

// shared-fix4.md - Rule 21 (one toolbar: search + Actions menu + primary) and Rule 22 (one
// skeleton), measured on every toolbar page at 390 / 1366 / 1920; Actions `needs` logic; the menu
// stays inside the card; slow API -> skeleton, then data, no layout shift (one page per module).
// Plus step 4: select + parent -> child reset on Admit Card Structure, Marksheet Structure,
// Subject Groups and Leave Assign, and the Approvals Stream Group filter (shared-fix3 pending item).
// Hermetic: the built app, every API call answered here (nothing to clean up afterwards).

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fakeJwt = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ payload: { id: 'a1', name: 'Admin' }, exp: 4102444800 }) + '.sig';

const departments = { rows: [{ _id: 'd1', name: 'Teaching', status: 'active' }, { _id: 'd2', name: 'Admin', status: 'active' }] };
const designations = { rows: [{ _id: 'g1', title: 'PRT', departmentId: 'd1' }, { _id: 'g2', title: 'Clerk', departmentId: 'd2' }] };
const classes = [
  { _id: 'c6', class: 6, label: '6th', hasStreams: false, sections: [{ _id: 's6a', name: 'A' }, { _id: 's6b', name: 'B' }], streams: [] },
  {
    _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [],
    streams: [{ _id: 'sci', name: 'science', sections: [{ _id: 'sciA', name: 'A' }, { _id: 'sciB', name: 'B' }] }]
  }
];
const groups = [
  { _id: 'gen6', name: 'General', classId: 'c6', streamId: null, isSystemGroup: true },
  { _id: 'pcm', name: 'PCM', classId: 'c11', streamId: 'sci' },
  { _id: 'pcb', name: 'PCB', classId: 'c11', streamId: 'sci' }
];
const emptyRoster = { legend: { shifts: [], weekOff: false }, stats: { byShift: [], unassigned: 0 } };
const fixtures: Record<string, object> = {
  '/api/v2/staff/departments/options': departments,
  '/api/v2/staff/designations/options': designations,
  '/api/v2/student/filter-options': { classes, groups },
  '/api/v2/academic-setup/subject-groups/form-options': { classes, subjects: [] },
  '/api/v2/attendance/roster/staff': { month: '2026-10', days: [], rows: [], truncated: false, ...emptyRoster },
  '/api/v2/attendance/roster/classes': { rows: [], ...emptyRoster },
  '/api/v2/attendance/grid': { month: '2026-10', personType: 'staff', today: '2026-10-16', truncated: false, canMark: false, days: [], rows: [],
    editPast: { allowed: false, from: null, to: null } },
  '/api/v2/attendance/live-status': { dateKey: '2026-10-16', staff: {}, student: {} },
  '/api/v2/attendance/recent-arrivals': { dateKey: '2026-10-16', staff: [], student: [] },
  // Step 4: the list shapes these pages read on every filter change (an empty generic body
  // threw on `summary`, so the cascade never re-rendered — why shared-fix3 could not test it).
  '/api/v2/settings/my-permissions': { isSuperAdmin: true, modules: {} },
  '/api/v2/examination/admit-card-structures': { rows: [], total: 0, page: 1, canEdit: true, summary: { classesTotal: 0, examsConfigured: 0 } },
  '/api/v2/examination/marksheet-structure': { rows: [], total: 0, canEdit: true, summary: { classesTotal: 0, setUp: 0 } },
  '/api/v2/leave/assign/staff': { leaveTypes: [], rows: [], total: 0, page: 1, limit: 10, truncated: false, canAssign: true, summary: { people: 0, fullySet: 0, types: 0 } },
  '/api/v2/leave/assign/classes': { leaveTypes: [], rows: [], canAssign: true, summary: { classes: 0, fullySet: 0, types: 0 } }
};
// Edit grants on, so permission-gated buttons (Payroll, Fees, Exam, Holiday/Leave Assign) render.
const DEFAULT_BODY = { rows: [], data: [], classes: [], groups: [], total: 0, sessions: [], canEdit: true, canAssign: true, canIssue: true };

// Rows for the Actions tests (Bulk Delete needs ticked rows).
fixtures['/api/v2/academic-setup/classes'] = [
  { _id: 'c6', adminId: 'a1', class: 6, order: 8, hasStreams: false, sections: [{ _id: 's6a', name: 'A' }], streams: [], studentCount: 0 },
  { _id: 'c7', adminId: 'a1', class: 7, order: 9, hasStreams: false, sections: [{ _id: 's7a', name: 'A' }], streams: [], studentCount: 0 }
];

type Kind = 'primary+actions' | 'primary-only' | 'actions-only' | 'search-only';
// Every page with the shared toolbar, and its shape under Rule 21.
const PAGES: [string, Kind][] = [
  ['academic-setup/classes-sections', 'primary+actions'], ['academic-setup/subjects', 'primary+actions'],
  ['academic-setup/subject-groups', 'primary+actions'],
  ['student/manage-students', 'primary+actions'], ['student/admission', 'primary-only'], ['student/class-promotion', 'primary-only'],
  ['staff/manage-staff', 'primary+actions'], ['staff/departments', 'primary-only'], ['staff/designations', 'primary-only'],
  ['attendance/overview', 'primary+actions'], ['attendance/shifts', 'primary-only'], ['attendance/roster', 'actions-only'],
  ['leave/requests', 'primary-only'], ['leave/create', 'primary-only'], ['leave/assign', 'actions-only'],
  ['holiday/holidays', 'primary+actions'], ['holiday/templates', 'primary-only'], ['holiday/assign', 'actions-only'],
  ['payroll/generate-payroll', 'actions-only'], ['payroll/salary-groups', 'primary-only'], ['payroll/assign-salary', 'actions-only'],
  ['payroll/salary-payouts', 'search-only'],
  ['fees/fees', 'actions-only'], ['fees/fee-structure', 'primary-only'], ['fees/fee-reminder', 'primary-only'],
  ['examination/admit-card-structure', 'primary-only'], ['examination/generate-admit-card', 'actions-only'],
  ['examination/generate-marksheet', 'actions-only'],
  ['certificates/generate-tc', 'search-only'], ['approvals', 'search-only'],
  ['settings/academic-sessions', 'primary-only'], ['settings/roles-permissions', 'actions-only']
];

const open = async (page: Page, route: string, delayMs = 0): Promise<void> => {
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', async (r) => {
    const body = fixtures[new URL(r.request().url()).pathname] ?? DEFAULT_BODY;
    if (delayMs) await new Promise((res) => setTimeout(res, delayMs));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => undefined);
  });
  await page.goto('/v2/' + route);
  if (delayMs) return;
  await page.locator('.page-head, h1').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
};

interface Box { x: number; y: number; w: number; h: number; r: number; b: number }
const measure = (page: Page) => page.evaluate(() => {
  const box = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } : null;
  };
  const tb = document.querySelector('app-data-toolbar');
  return {
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    narrow: !!tb?.classList.contains('tb-narrow'),
    row: box(tb?.querySelector('.tb-row') || null),
    search: box(tb?.querySelector('.tb-row > .search') || null),
    actions: box(tb?.querySelector('.tb-actions-btn') || null),
    primary: box(tb?.querySelector('.tb-primary') || null),
    labelsClipped: Array.from(tb?.querySelectorAll('.tb-row .btn-label') || []).filter((l) => {
      const b = l.closest('button') as HTMLElement;
      return l.scrollWidth > l.clientWidth + 0.5 && !(b.title || '').includes((l.textContent || '').trim());
    }).length
  };
});
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const f = (b: Box | null) => (b ? `${b.w.toFixed(0)}x${b.h.toFixed(0)}` : '-');

test.describe.configure({ mode: 'parallel' });

for (const [route, kind] of PAGES) {
  test(`R21 toolbar ${route}`, async ({ browser }) => {
    const notes: string[] = [];
    for (const width of [1920, 1366, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await open(page, route);
      const m = await measure(page);
      expect(m.overflow, `${width}: no horizontal overflow`).toBeLessThanOrEqual(0);
      expect(m.labelsClipped, `${width}: a clipped label has its full text in the tooltip`).toBe(0);
      const shape = m.primary && m.actions ? 'primary+actions' : m.primary ? 'primary-only' : m.actions ? 'actions-only' : 'search-only';
      expect(shape, `${width}: toolbar shape`).toBe(kind);
      // Rule 21b.6: 38px on desktop, 44px on a narrow (<= 640px) card.
      for (const b of [m.search, m.actions, m.primary]) if (b) expect(Math.round(b.h), `${width}: height`).toBe(m.narrow ? 44 : 38);
      if (m.primary) expect(m.primary.w).toBeLessThanOrEqual(180.5);
      if (!m.narrow) {
        if (m.search) expect(Math.round(m.search.w), `${width}: search 280`).toBe(280);
        if (m.actions) expect(Math.round(m.actions.w), `${width}: Actions 130`).toBe(130);
        if (m.primary) expect(m.primary.w, `${width}: primary >= 130`).toBeGreaterThanOrEqual(129.5);
        if (m.primary && m.actions) expect(m.actions.r, 'Actions left of primary').toBeLessThanOrEqual(m.primary.x);
        const last = m.primary || m.actions;
        if (last) expect(near(last.r, m.row!.r), 'last button right-most').toBe(true);
        if (m.search && last) expect(near(last.y, m.search.y, 2), 'one row').toBe(true);
      } else {
        // Card <= 640px: search alone on its row; Actions | primary in equal columns below.
        if (m.search) {
          expect(near(m.search.w, m.row!.w), `${width}: search full width`).toBe(true);
          for (const b of [m.actions, m.primary]) if (b) expect(b.y, `${width}: no button in the search row`).toBeGreaterThan(m.search.b - 0.5);
        }
        if (m.actions && m.primary) {
          expect(near(m.actions.w, m.primary.w), `${width}: equal widths (${f(m.actions)} vs ${f(m.primary)})`).toBe(true);
          expect(near(m.actions.y, m.primary.y), `${width}: one row`).toBe(true);
          expect(near(m.primary.r, m.row!.r), `${width}: primary right`).toBe(true);
        } else if (m.actions || m.primary) {
          const one = (m.actions || m.primary)!;
          expect(near(one.r, m.row!.r), `${width}: lone button on the right`).toBe(true);
          expect(one.w, `${width}: lone button >= 110`).toBeGreaterThanOrEqual(109.5);
        }
      }
      notes.push(`${width}${m.narrow ? 'n' : ''}: search=${f(m.search)} actions=${f(m.actions)} primary=${f(m.primary)} overflow=${m.overflow}`);
      await page.close();
    }
    console.log(`MEASURED ${route}: ${notes.join(' | ')}`);
  });
}

const menuItem = (page: Page, label: string) => page.locator('.tb-menu .tb-menu-item', { hasText: label });

test('R21 Actions: disabled with no rows, enabled after ticking rows (Classes & Sections)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page, 'academic-setup/classes-sections');
  await page.locator('.tb-actions-btn').click();
  const del = menuItem(page, 'Bulk Delete');
  await expect(del).toHaveAttribute('aria-disabled', 'true');
  await expect(del.locator('.tb-item-why')).toHaveText('select rows');
  await expect(page.locator('.tb-menu-hint')).toHaveText('Some actions unlock when you tick rows or choose a filter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tb-menu')).toHaveCount(0);
  await page.locator('.row-check').first().check();
  await page.locator('.tb-actions-btn').click();
  await expect(del).not.toHaveAttribute('aria-disabled', 'true');
  await expect(del.locator('.tb-item-label')).toHaveText('Bulk Delete (1)');
  console.log('MEASURED actions-sel: Bulk Delete disabled ("select rows") -> 1 row ticked -> enabled "Bulk Delete (1)"');
});

test('R21 Actions: filter-dependent item enabled only after choosing the filter (Manage Students)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page, 'student/manage-students');
  await page.locator('.tb-actions-btn').click();
  const imp = menuItem(page, 'Import / Export');
  await expect(imp).toHaveAttribute('aria-disabled', 'true');
  await expect(imp.locator('.tb-item-why')).toHaveText('choose a class');
  await page.keyboard.press('Escape');
  await pick(page, CLASS, '6th');
  await page.locator('.tb-actions-btn').click();
  await expect(imp).not.toHaveAttribute('aria-disabled', 'true');
  console.log('MEASURED actions-filter: Import / Export disabled ("choose a class") -> Class 6th -> enabled');
});

// One page per module that has an Actions menu.
const MENU_PAGES = ['academic-setup/classes-sections', 'student/manage-students', 'staff/manage-staff', 'attendance/roster',
  'leave/assign', 'holiday/holidays', 'payroll/generate-payroll', 'fees/fees', 'examination/generate-marksheet', 'settings/roles-permissions'];
for (const route of MENU_PAGES) {
  test(`R21 menu stays inside the card: ${route}`, async ({ browser }) => {
    const notes: string[] = [];
    for (const width of [1366, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await open(page, route);
      await page.locator('.tb-actions-btn').click();
      const r = await page.evaluate(() => {
        const box = (el: Element) => el.getBoundingClientRect();
        const m = box(document.querySelector('.tb-menu')!);
        const t = box(document.querySelector('.tb-actions-btn')!);
        const c = box(document.querySelector('app-data-toolbar')!.closest('.sw-card-main')!);
        return { ml: m.left, mr: m.right, mt: m.top, mw: m.width, tb: t.bottom, tl: t.left, cl: c.left, cr: c.right, cw: c.width,
          overflow: document.documentElement.scrollWidth - window.innerWidth };
      });
      expect(r.ml, 'menu inside the card (left)').toBeGreaterThanOrEqual(r.cl);
      expect(r.mr, 'menu inside the card (right)').toBeLessThanOrEqual(r.cr);
      expect(r.mw, 'menu <= card - 36').toBeLessThanOrEqual(r.cw - 36 + 0.5);
      expect(r.mt, 'menu under the button').toBeGreaterThanOrEqual(r.tb);
      // Mobile: left-aligned with Actions; a lone Actions sits on the right, so there the menu is
      // pulled left only as far as it must be to stay inside the card.
      if (width === 390) expect(near(r.ml, r.tl) || near(r.mr, r.cr - 20, 2), 'mobile: left-aligned, or clamped to the card').toBe(true);
      expect(r.overflow).toBeLessThanOrEqual(0);
      await page.mouse.click(2, 450);
      await expect(page.locator('.tb-menu'), 'closes on outside click').toHaveCount(0);
      notes.push(`${width}: menu ${r.mw.toFixed(0)}w in card ${r.cw.toFixed(0)}w`);
      await page.close();
    }
    console.log(`MEASURED menu ${route}: ${notes.join(' | ')}`);
  });
}

// Rule 22 point 10: slow API -> skeleton shows, goes away after load, no layout shift. One page per module.
const SKELETON_PAGES = ['academic-setup/classes-sections', 'student/manage-students', 'staff/departments', 'attendance/shifts',
  'leave/create', 'holiday/templates', 'payroll/salary-groups', 'fees/fee-structure', 'examination/admit-card-structure',
  'certificates/generate-tc', 'approvals', 'settings/academic-sessions'];
for (const route of SKELETON_PAGES) {
  test(`R22 skeleton ${route}`, async ({ browser }) => {
    for (const width of [1366, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await open(page, route, 3000);
      await page.locator('tbody.sk-body .sk-row').first().waitFor({ timeout: 8000 });
      const during = await page.evaluate(() => {
        const top = (s: string) => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
        const search = document.querySelector('app-data-toolbar .search input') as HTMLInputElement | null;
        return {
          head: top('.sw-card-main thead'), tb: top('app-data-toolbar .tb-row'),
          rows: document.querySelectorAll('tbody.sk-body .sk-row').length,
          searchEnabled: !search || !search.disabled,
          faded: Array.from(document.querySelectorAll('.sw-card-main .grid-scroll, .sw-card-main .table-scroll, .sw-card-main table'))
            .some((e) => { const cs = getComputedStyle(e); return cs.filter.includes('blur') || parseFloat(cs.opacity) < 0.95; }),
          overflow: document.documentElement.scrollWidth - window.innerWidth
        };
      });
      expect(during.rows, 'skeleton rows 8-10').toBeGreaterThanOrEqual(8);
      expect(during.searchEnabled, 'search stays enabled').toBe(true);
      expect(during.faded, 'no blur/fade on the table').toBe(false);
      expect(during.overflow).toBeLessThanOrEqual(0);
      await expect(page.locator('tbody.sk-body')).toHaveCount(0, { timeout: 15000 });
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => {
        const top = (s: string) => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
        return { head: top('.sw-card-main thead'), tb: top('app-data-toolbar .tb-row'), stuck: !!document.querySelector('table.sk-loading') };
      });
      expect(near(after.tb, during.tb), 'toolbar did not move').toBe(true);
      if (during.head >= 0 && after.head >= 0) expect(near(after.head, during.head), 'table header did not move').toBe(true);
      expect(after.stuck, 'no stuck skeleton').toBe(false);
      console.log(`MEASURED skeleton ${route} @${width}: rows=${during.rows} headY ${during.head.toFixed(0)}->${after.head.toFixed(0)} toolbarY ${during.tb.toFixed(0)}->${after.tb.toFixed(0)}`);
      await page.close();
    }
  });
}

// --- shared-fix4 step 4: select + parent → child reset on the four pages -------------------
const pick = async (page: Page, aria: RegExp, option: string): Promise<void> => {
  const triggers = page.locator('.toolbar-row2 .dd-trigger');
  const labels = await triggers.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') || ''));
  const index = labels.findIndex((label) => aria.test(label));
  expect(index, `filter ${aria} present`).toBeGreaterThanOrEqual(0);
  await triggers.nth(index).click();
  await page.locator('.dd-menu.dd-portal .dd-option', { hasText: option }).first().click();
  await page.waitForTimeout(150);
};
const labelOf = async (page: Page, aria: RegExp): Promise<string> => {
  const pairs = await page.locator('.toolbar-row2 .dd-trigger').evaluateAll((els) => els.map((el) => [
    el.getAttribute('aria-label') || '', (el.querySelector('.dd-label')?.textContent || '').trim()]));
  return pairs.find(([a]) => aria.test(a))?.[1] ?? '';
};
const CLASS = /^(Filter by class|Class)$/;
const STREAM = /^(Filter by stream|Stream)$/;
const GROUP = /^(Filter by stream group|Stream group)$/;

for (const route of ['examination/admit-card-structure', 'examination/marksheet-structure', 'academic-setup/subject-groups', 'leave/assign']) {
  test(`reset ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await open(page, route);
    if (route === 'leave/assign') await pick(page, /^Person type$/, 'Student');
    await pick(page, CLASS, '11th');
    expect(await labelOf(page, CLASS)).toBe('11th');
    await pick(page, STREAM, 'Science');
    expect(await labelOf(page, STREAM)).toBe('Science');
    const hasGroup = (await labelOf(page, GROUP)) !== '';
    if (hasGroup) { await pick(page, GROUP, 'PCM'); expect(await labelOf(page, GROUP)).toBe('PCM'); }
    await pick(page, CLASS, '6th');
    expect(await labelOf(page, STREAM), 'stream reset').toBe('All streams');
    if (hasGroup) expect(await labelOf(page, GROUP), 'group reset').toBe('All stream groups');
    console.log(`MEASURED reset ${route}: class 11th → stream Science${hasGroup ? ' → group PCM' : ''}; class 6th → stream "All streams"${hasGroup ? ', group "All stream groups"' : ''}`);
  });
}

test('Approvals: Stream Group sits between Stream and Section, enables on a streamed class, resets', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page, 'approvals');
  const order = await page.locator('.toolbar-row2 .dd-trigger').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(order.slice(4, 7)).toEqual(['Filter by stream', 'Filter by stream group', 'Filter by section']);
  expect(await labelOf(page, GROUP)).toBe('All stream groups');
  await pick(page, /^Filter by applicant$/, 'Student');
  await pick(page, CLASS, '11th');
  await pick(page, STREAM, 'Science');
  await pick(page, GROUP, 'PCB');
  expect(await labelOf(page, GROUP)).toBe('PCB');
  const sent = page.waitForRequest((r) => r.url().includes('/approvals') && r.url().includes('groupId='));
  await pick(page, GROUP, 'PCM');
  expect(new URL((await sent).url()).searchParams.get('groupId')).toBe('pcm');
  await pick(page, STREAM, 'All streams');
  expect(await labelOf(page, GROUP), 'group reset on stream change').toBe('All stream groups');
  console.log(`MEASURED approvals-group: order=${order.join(' > ')}; groupId sent; reset ok`);
});

// --- Rule 21b / 22b: match the preview ---------------------------------------------------------
test('R21b divider, Actions icon, filter columns (Manage Students)', async ({ browser }) => {
  for (const width of [1920, 1366, 1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await open(page, 'student/manage-students');
    const r = await page.evaluate(() => {
      const tb = document.querySelector('app-data-toolbar')!;
      const card = tb.closest('.sw-card-main')!.getBoundingClientRect();
      const cs = getComputedStyle(tb.closest('.sw-card-main')!);
      const d = tb.querySelector('.tb-divider')!.getBoundingClientRect();
      const row1 = tb.querySelector('.tb-row')!.getBoundingClientRect();
      const grid = tb.querySelector('.toolbar-row2')!;
      const btn = tb.querySelector('.tb-actions-btn')!;
      return {
        dl: d.left, dr: d.right, dh: d.height, dt: d.top, db: d.bottom, row1b: row1.bottom, gridT: grid.getBoundingClientRect().top,
        cl: card.left + parseFloat(cs.borderLeftWidth), cr: card.right - parseFloat(cs.borderRightWidth), cw: card.width,
        cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        order: Array.from(btn.children).map((c) => c.tagName.toLowerCase() + (c.classList.contains('bi-chevron-down') ? '.chev' : '')),
        dots: btn.querySelectorAll('svg circle').length, dotsW: btn.querySelector('svg')!.getBoundingClientRect().width,
        filterH: grid.querySelector("app-dd")!.getBoundingClientRect().height
      };
    });
    expect(near(r.dl, r.cl) && near(r.dr, r.cr), `${width}: divider edge to edge`).toBe(true);
    expect(Math.round(r.dh)).toBe(1);
    const gap = r.cw <= 640 ? 10 : 14;
    expect(near(r.dt - r.row1b, gap, 1.5) && near(r.gridT - r.db, gap, 1.5), `${width}: ${gap}px around divider`).toBe(true);
    expect(r.order).toEqual(['svg', 'span', 'i.chev']);
    expect(r.dots).toBe(3);
    expect(Math.round(r.dotsW)).toBe(15);
    expect(r.cols, `${width}: card ${r.cw.toFixed(0)} columns`).toBe(r.cw <= 640 ? 2 : r.cw < 820 ? 4 : 6);
    expect(Math.round(r.filterH), 'filters stay 38').toBe(38);
    await page.locator('.tb-actions-btn').click();
    const open1 = await page.evaluate(() => {
      const b = document.querySelector('.tb-actions-btn')!;
      return { bg: getComputedStyle(b).backgroundColor, rot: getComputedStyle(b.querySelector('.tb-chevron')!).transform };
    });
    expect(open1.bg).toBe('rgb(242, 234, 255)');
    expect(open1.rot).not.toBe('none');
    console.log(`MEASURED 21b @${width}: card ${r.cw.toFixed(0)} divider ${r.dl.toFixed(0)}-${r.dr.toFixed(0)} cols=${r.cols}`);
    await page.close();
  }
});

test('R22b skeleton looks like the preview: checkbox, avatar, two bars, pill, shimmer, no blur', async ({ browser }) => {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await open(page, 'student/manage-students', 3000);
    await page.locator('tbody.sk-body .sk-row').first().waitFor({ timeout: 8000 });
    const r = await page.evaluate(() => {
      const row = document.querySelector('tbody.sk-body .sk-row')!;
      const box = (s: string) => { const b = row.querySelector(s)!.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
      const bar1 = row.querySelector('.sk-bar1')!;
      return {
        check: !!row.querySelector('.sk-check'), avatar: box('.sk-avatar'), pill: box('.sk-pill'),
        bar1H: box('.sk-bar1')[1], bar1Bg: getComputedStyle(bar1).backgroundColor, bar2: !!row.querySelector('.sk-person .sk-bar2'),
        anim: getComputedStyle(bar1, '::after').animationDuration,
        blur: Array.from(document.querySelectorAll('.sw-card-main *')).some((e) => getComputedStyle(e).filter.includes('blur')),
        bar: !!document.querySelector('.sw-card-main mat-progress-bar, .sw-card-main [role="progressbar"]')
      };
    });
    expect(r.check).toBe(true);
    expect(r.avatar).toEqual([26, 26]);
    expect(r.pill).toEqual([46, 16]);
    expect(r.bar1H).toBe(7);
    expect(r.bar1Bg).toBe('rgb(221, 214, 236)');
    expect(r.bar2).toBe(true);
    expect(r.anim).toBe('1.2s');
    expect(r.blur || r.bar, 'no blur, no bar loader').toBe(false);
    console.log(`MEASURED 22b @${width}: avatar ${r.avatar} pill ${r.pill} shimmer ${r.anim}`);
    await page.close();
  }
});
