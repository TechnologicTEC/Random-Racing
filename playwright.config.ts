import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  // Each page now generates whole islands, which keeps a processor core busy. More browsers than this at once and the slow ones time out.
  workers: 4,
  timeout: 60_000,
  // Waiting for a new seed means waiting for a whole world, which can take a few seconds in Firefox on a busy machine.
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@budget/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grepInvert: /@budget/ },
    // Timings against the brief's budgets run on their own once everything else has finished: while four
    // browsers draw islands in software at once, every core is busy and a world takes three or four times as long.
    { name: 'chromium-budget', use: { ...devices['Desktop Chrome'] }, grep: /@budget/, dependencies: ['chromium', 'firefox'] },
    { name: 'firefox-budget', use: { ...devices['Desktop Firefox'] }, grep: /@budget/, dependencies: ['chromium', 'firefox'] },
  ],
});
