import { defineConfig, devices } from '@playwright/test';

// Tests run against the static web export (`expo export -p web` → `dist/`),
// served by `serve -s dist`. Every backend call (Supabase REST/RPC/auth,
// edge functions, realtime, Stripe) is intercepted in tests/e2e/helpers/
// supabase-mock.ts — no live backend is touched.

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Each spec resets local storage + mocks; specs are independent.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        // The JSON reporter writes a machine-readable summary the workflow
        // parses to render the GitHub job summary (pass/fail counts, the
        // list of failing specs, etc.).
        ['json', { outputFile: 'playwright-report/results.json' }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // Lock the locale/timezone so date-based assertions (invoice dates etc.)
    // are deterministic in CI.
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The app reads viewport size at mount — keep it consistent.
    viewport: { width: 1280, height: 900 },
    // Speed: don't wait for slow analytics/font CDNs that we don't control.
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
      // Mobile-specific smoke run — the responsive layout switches columns.
      testMatch: /(tab-navigation|home-feed|discover|product-detail)\.spec\.ts$/,
    },
  ],

  webServer: {
    // `serve -s` serves the SPA with index.html fallback, mirroring
    // vercel.json's rewrites. Reusing an existing server speeds up local
    // iteration; CI always boots fresh.
    command: `npx serve -s dist -l ${PORT} --no-clipboard`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
