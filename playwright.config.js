import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,

  // Retries exist here to *observe* flakiness, not to hide it. A retry that changes the
  // outcome is the highest-quality flake evidence there is — same commit, same machine,
  // seconds apart — and flake-radar scores exactly that. With retries at 0 the JSON report
  // carries one final status per test and that evidence never exists.
  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // Consumed by flake-radar. Written always, so a failing run — the run most worth
    // scoring — still produces one.
    ['json', { outputFile: 'test-results/report.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
