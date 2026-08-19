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
  // Two servers, each with its own readiness check.
  //
  // This used to be one entry running `npm run dev` and waiting on the client at :3000.
  // That worked only because the old in-memory API was serving before the first request
  // could arrive. Now the API waits for Postgres and seeds 60 rows before it listens, so
  // waiting on the client alone let specs run against an API that was not up yet — the page
  // rendered, the fetch failed, and the table never appeared.
  //
  // `/health` is the right gate rather than the port: it reports `ok` only when the
  // dataset is actually loaded, so "the server is listening" and "the server can answer"
  // are not confused.
  webServer: [
    {
      command: 'npm run server',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm run client',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
