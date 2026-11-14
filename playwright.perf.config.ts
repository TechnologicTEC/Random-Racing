import { defineConfig, devices } from '@playwright/test';

/**
 * Frame times on a real graphics card (`npm run perf`). Apart from `npm run e2e` because it opens a real
 * browser window: headless browsers draw in software, which says nothing about a graphics card.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: /perf\.spec\.ts/,
  outputDir: 'test-results',
  // One window at a time, so nothing else is drawing while a view is timed.
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    headless: false,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    // Without these the browser never draws faster than the screen refreshes, and a fast view would read as the screen's rate.
    launchOptions: { args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
});
