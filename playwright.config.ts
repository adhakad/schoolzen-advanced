import { defineConfig } from '@playwright/test';

// Browser checks for v2 pages against their reference html (docs/schoolzen-planning/v1/...).
// Hermetic: the production build is served locally and every API call is answered by the
// spec's own fixtures — no backend, database or login needed.
//   npm run build && npx playwright test
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:4300',
    // The machine's installed Chrome — no separate browser download.
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: 'node e2e/serve-dist.js 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    timeout: 30000
  }
});
