import { test, expect, Page, Browser } from '@playwright/test';
import { hermetic } from './hermetic';

// shared-fix6 F — Settings → School Profile at 390 / 1366 / 1920 (reference
// docs/schoolzen-planning/v1/settings/school-profile.html): the page opens from the Settings
// sidebar (5th item), empty state, fill + save, live preview stays centred, the logo never
// touches the divider, no horizontal overflow, Save 44px on phones. Hermetic: built app + fixtures.

const WIDTHS = [390, 1366, 1920];
const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fakeJwt = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ payload: { id: 'a1', name: 'Admin' }, exp: 4102444800 }) + '.sig';
const BOARDS = [
  { label: 'National', boards: ['Central Board of Secondary Education (CBSE)', 'Council for the Indian School Certificate Examinations (CISCE)'] },
  { label: 'District affiliated (State, up to Class 8)', boards: ['District Education Office, State (up to Class 8) (DEO)'] },
  { label: 'State boards (A to Z by state)', boards: ['Madhya Pradesh Board of Secondary Education (MPBSE)'] }
];
const STATES = ['Madhya Pradesh', 'Rajasthan', 'Delhi'];
const sessions = { sessions: [{ _id: 'x2', label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', status: 'active' }], activeLabel: '2026-2027', defaultLabel: '2026-2027' };

const openApp = async (page: Page, puts: object[]): Promise<void> => {
  await hermetic(page);
  await page.context().addCookies([{ name: 'adminAccessToken', value: fakeJwt, domain: 'localhost', path: '/' }]);
  await page.route('http://localhost:3000/**', (r) => {
    const url = new URL(r.request().url());
    let body: object = { rows: [], data: [], classes: [], groups: [], total: 0 };
    if (url.pathname === '/api/v2/settings/academic-sessions/options') body = sessions;
    if (url.pathname === '/api/v2/settings/school-profile') {
      if (r.request().method() === 'PUT') {
        const sent = r.request().postDataJSON();
        puts.push(sent);
        body = { message: 'School profile saved', profile: { ...sent, foundedYear: Number(sent.foundedYear), senderName: sent.senderName || sent.schoolName, schoolLogo: null, updatedAt: new Date().toISOString(), updatedByName: 'School Owner' } };
      } else {
        body = { profile: null, boards: BOARDS, states: STATES, mediums: ['English', 'Hindi', 'Hindi & English'] };
      }
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/v2/settings/school-profile');
};
const newPage = (browser: Browser, width: number) => browser.newPage({ viewport: { width, height: 900 } });
const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test.describe.configure({ mode: 'parallel' });

for (const width of WIDTHS) {
  test(`School Profile: opens, empty state, fill + save, preview centred, logo clear of divider (${width}px)`, async ({ browser }) => {
    const page = await newPage(browser, width);
    const puts: object[] = [];
    await openApp(page, puts);

    // Opens; empty state; Save disabled; "SCHOOL" in the preview.
    await expect(page.locator('h1', { hasText: 'School Profile' })).toBeVisible();
    await expect(page.locator('#emptyNote')).toContainText('No school profile saved yet. Letterheads currently print "SCHOOL" with no address.');
    await expect(page.locator('#saveBtn')).toBeDisabled();
    await expect(page.locator('#pvName')).toHaveText('SCHOOL');
    await expect(page.locator('#meta')).toHaveText('Not saved yet');

    // Sidebar: School Profile is the 5th Settings item (desktop sidebar only; hidden on phones).
    if (width >= 1366) {
      const items = await page.locator('a', { hasText: /^(Academic Sessions|Admission Form Fields|Roles & Permissions|Marksheet Templates|School Profile)$/ }).allInnerTexts();
      expect(items.map((t) => t.trim())).toEqual(['Academic Sessions', 'Admission Form Fields', 'Roles & Permissions', 'Marksheet Templates', 'School Profile']);
    }

    // Fill — the preview updates live.
    await page.fill('#fName', 'Green Valley Public School');
    await expect(page.locator('#pvName')).toHaveText('Green Valley Public School');
    await expect(page.locator('#pvLogo')).toHaveText('GV');
    await expect(page.locator('#fSender')).toHaveValue('Green Valley Public School');
    await page.selectOption('#fBoard', 'Central Board of Secondary Education (CBSE)');
    await page.fill('#fAff', '1030123');
    await page.fill('#fCode', 'GV-0142');
    await page.fill('#fYear', '1998');
    await page.fill('#fAddr', '12, Vijay Nagar Main Road');
    await page.fill('#fCity', 'Indore');
    await page.fill('#fDist', 'Indore');
    await page.selectOption('#fState', 'Madhya Pradesh');
    await page.fill('#fPin', '452010');
    await page.fill('#fPhone', '9876543210');
    await expect(page.locator('#saveBtn')).toBeDisabled();
    await page.fill('#fMail', 'office@greenvalley.in');
    await expect(page.locator('#pvSub')).toHaveText('CBSE · Affil./Recog. No. 1030123 · School Code GV-0142');
    await expect(page.locator('#pvAddr')).toContainText('12, Vijay Nagar Main Road, Indore, Madhya Pradesh - 452010');
    await expect(page.locator('#pvAddr')).toContainText('9876543210 · office@greenvalley.in');

    // A bad value shows its error under the field and keeps Save disabled.
    await page.fill('#fPin', '4520');
    await page.locator('#fPin').blur();
    await expect(page.locator('#saveBtn')).toBeDisabled();
    await expect(page.locator('.pf-field', { has: page.locator('#fPin') }).locator('.pf-err')).toHaveText('Pin code is exactly 6 digits.');
    await page.fill('#fPin', '452010');
    await expect(page.locator('#saveBtn')).toBeEnabled();

    // Preview: name centred in the letterhead band, logo left and clear of the divider.
    const top = await box(page, '.lh-top');
    const name = await box(page, '#pvName');
    const logo = await box(page, '#pvLogo');
    const nameCentre = name.x + name.width / 2;
    const topCentre = top.x + top.width / 2;
    expect(Math.abs(nameCentre - topCentre)).toBeLessThanOrEqual(2);
    const divider = top.y + top.height; // the 2px border-bottom sits at the band's bottom edge
    expect(logo.y + logo.height).toBeLessThanOrEqual(divider - 2 - 8);
    expect(logo.x + logo.width).toBeLessThanOrEqual(name.x);

    // Save: toast, meta, empty note gone, Save disabled again; one PUT sent.
    await page.click('#saveBtn');
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast')).toHaveText('School profile saved');
    await expect(page.locator('#meta')).toHaveText('Last saved just now by School Owner');
    await expect(page.locator('#emptyNote')).toHaveCount(0);
    await expect(page.locator('#saveBtn')).toBeDisabled();
    expect(puts.length).toBe(1);
    expect((puts[0] as Record<string, string>)['senderName']).toBe('Green Valley Public School');

    // Layout: no horizontal overflow; one column + Save 44px on phones.
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    const cols = await page.locator('.pf-grid').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    const save = await box(page, '#saveBtn');
    if (width <= 640) {
      expect(cols).toBe(1);
      expect(Math.round(save.height)).toBe(44);
      const preview = await box(page, '.pf-side');
      const form = await box(page, '.layout-row > .sw-card-main:not(.pf-side)');
      expect(preview.y).toBeGreaterThan(form.y + form.height - 1); // preview below the form
    } else {
      expect(cols).toBe(2);
      expect(Math.round(save.height)).toBe(38);
    }
    await page.close();
  });
}
