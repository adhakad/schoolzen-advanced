import { test, expect, Page } from '@playwright/test';
import { hermetic } from './hermetic';

// shared-fix4.md, Rule 21: one toolbar on every page.
//   1366px — other buttons 130 x 38, primary 38 high, 130-180 wide and right-most, search 340;
//   390px  — primary + others: search row, primary alone right-aligned, others 2 per row at one
//            filter cell wide (within 1px), 38 high; primary only: search left + primary right on
//            one row, primary 110-180; no primary: search row, others 2 per row; no page overflow;
//   text   — no label wraps; a truncated label has its full text in the tooltip; the longest
//            label ("Bulk Enter Marks (12)") checked at 390px; tap opens the tooltip on touch.
// Plus shared-fix4 step 4: select + parent → child reset on Admit Card Structure, Marksheet
// Structure, Subject Groups and Leave Assign, with fixtures that give them something to pick.
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

type Kind = 'primary+others' | 'primary-only' | 'others-only';
// Every page with toolbar buttons, and the shape Rule 21 gives it.
const PAGES: [string, Kind][] = [
  ['academic-setup/classes-sections', 'primary+others'], ['academic-setup/subjects', 'primary+others'],
  ['academic-setup/subject-groups', 'primary+others'],
  ['student/manage-students', 'primary+others'], ['student/admission', 'primary-only'], ['student/class-promotion', 'primary-only'],
  ['staff/manage-staff', 'primary+others'], ['staff/departments', 'primary-only'], ['staff/designations', 'primary-only'],
  ['attendance/overview', 'primary+others'], ['attendance/shifts', 'primary-only'], ['attendance/roster', 'others-only'],
  ['leave/requests', 'primary-only'], ['leave/create', 'primary-only'], ['leave/assign', 'others-only'],
  ['holiday/holidays', 'primary+others'], ['holiday/templates', 'primary-only'], ['holiday/assign', 'others-only'],
  ['payroll/generate-payroll', 'others-only'], ['payroll/salary-groups', 'primary-only'], ['payroll/assign-salary', 'others-only'],
  ['fees/fees', 'others-only'], ['fees/fee-structure', 'primary-only'], ['fees/fee-reminder', 'primary-only'],
  ['examination/admit-card-structure', 'primary-only'], ['examination/generate-admit-card', 'others-only'],
  ['examination/generate-marksheet', 'others-only'],
  ['settings/academic-sessions', 'primary-only'], ['settings/roles-permissions', 'others-only']
];

const open = async (page: Page, route: string): Promise<void> => {
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', (r) => {
    const body = fixtures[new URL(r.request().url()).pathname] ?? DEFAULT_BODY;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/v2/' + route);
  await page.locator('.page-head, h1').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
};

interface Box { x: number; y: number; w: number; h: number; r: number; b: number }
interface Btn extends Box { primary: boolean; label: string; title: string; truncated: boolean; wrapped: boolean }

const measure = (page: Page) => page.evaluate(() => {
  const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const group = Array.from(document.querySelectorAll('.sz .toolbar-btn-group')).find((g) => g.querySelector('button'));
  const row1 = group?.closest('.toolbar-row1') || null;
  const search = row1?.querySelector(':scope > .search') || null;
  const buttons = group ? Array.from(group.querySelectorAll<HTMLButtonElement>(':scope > button')).filter(visible).map((b) => {
    const label = b.querySelector('.btn-label') as HTMLElement | null;
    const lh = label ? parseFloat(getComputedStyle(label).lineHeight) || 16 : 16;
    return {
      ...box(b), primary: b.classList.contains('btn-primary'),
      label: (label?.textContent || b.textContent || '').trim(), title: b.title,
      truncated: !!label && label.scrollWidth > label.clientWidth + 0.5,
      wrapped: !label || label.getBoundingClientRect().height > lh * 1.5
    };
  }) : [];
  // One filter cell: the first cell of the shared filter grid on this page (if any).
  const items = (el: Element): Element[] => Array.from(el.children).flatMap((c) => getComputedStyle(c).display === 'contents' ? items(c) : [c]);
  const grid = Array.from(document.querySelectorAll('.sz .toolbar-row2')).find(visible);
  const cell = grid ? items(grid).find(visible) : null;
  const rowBox = row1 ? box(row1) : null;
  return {
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    row1: rowBox, search: search && visible(search) ? box(search) : null, buttons,
    cellW: cell ? cell.getBoundingClientRect().width : rowBox ? (rowBox.w - 8) / 2 : 0
  };
});

const fmt = (b: Box) => `${b.w.toFixed(1)}x${Math.round(b.h)}`;
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

test.describe.configure({ mode: 'parallel' });

for (const [route, kind] of PAGES) {
  test(`toolbar ${route}`, async ({ browser }) => {
    const notes: string[] = [];

    // --- 1366px ---------------------------------------------------------------------
    const desk = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await open(desk, route);
    const d = await measure(desk);
    expect(d.buttons.length, 'toolbar buttons rendered').toBeGreaterThan(0);
    expect(d.overflow, 'desktop overflow').toBeLessThanOrEqual(0);
    const primaries = d.buttons.filter((b) => b.primary);
    const others = d.buttons.filter((b) => !b.primary);
    expect(primaries.length, 'at most one primary').toBeLessThanOrEqual(1);
    expect(primaries.length ? (others.length ? 'primary+others' : 'primary-only') : 'others-only', 'toolbar shape').toBe(kind);
    others.forEach((b) => { expect(Math.round(b.w), `130 wide (${b.label})`).toBe(130); expect(Math.round(b.h), `38 high (${b.label})`).toBe(38); });
    for (const p of primaries) {
      expect(Math.round(p.h), 'primary 38 high').toBe(38);
      expect(p.w, 'primary >= 130').toBeGreaterThanOrEqual(129.5);
      expect(p.w, 'primary <= 180').toBeLessThanOrEqual(180.5);
      expect(p.r, 'primary is right-most').toBeGreaterThanOrEqual(Math.max(...d.buttons.map((b) => b.r)) - 0.5);
    }
    // Buttons share the search row when they fit beside it; when they cannot (3+ buttons
    // next to a 340px search in a 736px card), they move as one right-aligned row below it.
    let placement = '-';
    if (d.search) {
      expect(Math.round(d.search.w), 'search 340').toBe(340);
      const need = d.search.w + 16 + d.buttons.reduce((sum, b) => sum + b.w, 0) + 10 * (d.buttons.length - 1);
      const fits = need <= d.row1!.w + 0.5;
      d.buttons.forEach((b) => expect(near(b.y, d.buttons[0].y), 'buttons in one row').toBe(true));
      if (fits) d.buttons.forEach((b) => expect(near(b.y + b.h / 2, d.search!.y + d.search!.h / 2, 2), 'buttons on the search row').toBe(true));
      placement = fits ? 'same row' : `next row (need ${Math.round(need)} > ${Math.round(d.row1!.w)})`;
    }
    expect(near(Math.max(...d.buttons.map((b) => b.r)), d.row1!.r), 'buttons right-aligned').toBe(true);
    for (const b of d.buttons) {
      expect(b.wrapped, `one line (${b.label})`).toBe(false);
      expect(b.title, `tooltip has the full label (${b.label})`).toContain(b.label);
    }
    notes.push(`1366: search=${d.search ? Math.round(d.search.w) : '-'} buttons=${placement} others=${others.map(fmt).join(',') || '-'} primary=${primaries.map(fmt).join(',') || '-'}`);
    await desk.close();

    // --- 390px ----------------------------------------------------------------------
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await open(phone, route);
    const m = await measure(phone);
    expect(m.overflow, '390 overflow').toBeLessThanOrEqual(0);
    const p = m.buttons.find((b) => b.primary);
    const rest = m.buttons.filter((b) => !b.primary);
    rest.forEach((b) => {
      expect(near(b.w, m.cellW), `width = filter cell (${b.label}: ${b.w.toFixed(1)} vs ${m.cellW.toFixed(1)})`).toBe(true);
      expect(Math.round(b.h), `38 high (${b.label})`).toBe(38);
    });
    for (let i = 0; i + 1 < rest.length; i += 2) expect(near(rest[i].y, rest[i + 1].y), 'others 2 per row').toBe(true);
    if (kind === 'primary+others') {
      expect(p!.y, 'primary below the search').toBeGreaterThan(m.search!.b - 0.5);
      expect(rest.every((b) => !near(b.y, p!.y)), 'primary alone on its row').toBe(true);
      expect(near(p!.r, m.row1!.r), 'primary right-aligned').toBe(true);
      expect(rest.every((b) => b.y > p!.b - 0.5), 'others below the primary').toBe(true);
    }
    if (kind === 'primary-only') {
      expect(p!.w, 'primary >= 110').toBeGreaterThanOrEqual(109.5);
      expect(p!.w, 'primary <= 180').toBeLessThanOrEqual(180.5);
      expect(near(p!.r, m.row1!.r), 'primary right-aligned').toBe(true);
      if (m.search) {
        expect(near(m.search.y + m.search.h / 2, p!.y + p!.h / 2, 2), 'search and primary on one row').toBe(true);
        expect(m.search.r, 'search left of the primary').toBeLessThanOrEqual(p!.x);
      }
    }
    if (kind === 'others-only' && m.search) expect(rest.every((b) => b.y > m.search!.b - 0.5), 'others below the search').toBe(true);
    for (const b of m.buttons) {
      expect(b.wrapped, `one line at 390 (${b.label})`).toBe(false);
      if (b.truncated) expect(b.title, `truncated label in tooltip (${b.label})`).toContain(b.label);
    }
    notes.push(`390: overflow=${m.overflow} cell=${m.cellW.toFixed(1)} search=${m.search ? fmt(m.search) : '-'} primary=${p ? fmt(p) : '-'} others=${rest.map(fmt).join(',') || '-'}`);
    await phone.close();
    console.log(`MEASURED ${route}: ${notes.join(' | ')}`);
  });
}

test('390px: longest label "Bulk Enter Marks (12)" stays on one line, full text in the tooltip', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await open(page, 'examination/generate-marksheet');
  const button = page.locator('.toolbar-btn-group > button', { hasText: 'Bulk Enter Marks' });
  await button.locator('.btn-label').evaluate((el) => { el.textContent = 'Bulk Enter Marks (12)'; });
  await page.waitForTimeout(100);
  const r = await button.evaluate((b) => {
    const label = b.querySelector('.btn-label') as HTMLElement;
    return { h: b.getBoundingClientRect().height, lh: label.getBoundingClientRect().height, truncated: label.scrollWidth > label.clientWidth, title: (b as HTMLElement).title };
  });
  expect(Math.round(r.h)).toBe(38);
  expect(r.lh).toBeLessThan(24);
  expect(r.title).toContain('Bulk Enter Marks (12)');
  console.log(`MEASURED longest-label: h=${Math.round(r.h)} labelH=${r.lh.toFixed(1)} truncated=${r.truncated} title="${r.title}"`);
});

test('touch: tapping a disabled button opens the tooltip with the reason', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await open(page, 'academic-setup/classes-sections');
  // A disabled button is not "actionable" for locator.tap(), so tap its centre directly.
  const r = (await page.locator('.toolbar-btn-group > button', { hasText: 'Bulk Delete' }).boundingBox())!;
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  const tip = page.locator('.sz-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('Bulk Delete — Select at least one row');
  console.log(`MEASURED tap-tooltip: "${await tip.textContent()}"`);
});

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
