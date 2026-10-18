import { Browser, BrowserContextOptions, Page } from '@playwright/test';
import * as path from 'path';

// shared-fix1.md S4: parity specs must not depend on the internet, or they stall when several
// run in parallel. The reference htmls load Bootstrap Icons from jsDelivr (served here from
// node_modules instead) and Google Fonts on both sides (blocked, so the app and the reference
// fall back to the same font). Every page gets its own context — no state is shared.
const ICONS = path.resolve(__dirname, '..', 'node_modules', 'bootstrap-icons', 'font');

export const hermetic = async (page: Page): Promise<void> => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => {
    const icons = route.request().url().match(/bootstrap-icons@[^/]+\/font\/([^?#]+)/);
    return icons ? route.fulfill({ path: path.join(ICONS, icons[1]) }) : route.abort();
  });
};

export const hermeticPage = async (browser: Browser, options: BrowserContextOptions = {}): Promise<Page> => {
  const page = await browser.newPage(options);
  await hermetic(page);
  return page;
};
