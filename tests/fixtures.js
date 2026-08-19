import { test as base, expect } from '@playwright/test';

/**
 * Worker-scoped isolation fixtures.
 *
 * Each Playwright worker gets its own Postgres schema, and every request that worker makes
 * — from the browser *and* from the API client — carries `X-Test-Worker`, so the server
 * routes it to `test_wN`.
 *
 * The browser half matters and is easy to miss: the app's own `fetch` calls come from the
 * page, not from the test, so setting the header only on the API client would leave every
 * UI-driven query reading the shared `public` schema. `extraHTTPHeaders` on the context is
 * what covers both.
 *
 * The schema is created and seeded once per worker (`scope: 'worker'`), not once per test.
 * Per-test setup would be correct and would also spend a schema build on every spec.
 */

const API = process.env.API_BASE ?? 'http://localhost:4000';

export const test = base.extend({
  /** This worker's schema name, seeded and ready. Created once per worker. */
  workerSchema: [
    async ({}, use, workerInfo) => {
      const index = workerInfo.parallelIndex;
      const schema = `test_w${index}`;

      const setup = await base.request.newContext({
        baseURL: API,
        extraHTTPHeaders: { 'X-Test-Worker': String(index) },
      });
      const res = await setup.post('/test/seed');
      if (!res.ok()) {
        throw new Error(
          `could not seed ${schema} (${res.status()}). Is the API running with NODE_ENV=test? ` +
            'The control endpoints do not exist in any other mode, by design.',
        );
      }
      await setup.dispose();

      await use({ schema, index });
    },
    { scope: 'worker' },
  ],

  /** Browser context pinned to this worker's schema. */
  context: async ({ context, workerSchema }, use) => {
    await context.setExtraHTTPHeaders({ 'X-Test-Worker': String(workerSchema.index) });
    await use(context);
  },

  /** An API client pinned to this worker's schema, for setup, teardown and assertions. */
  api: async ({ workerSchema }, use) => {
    const client = await base.request.newContext({
      baseURL: API,
      extraHTTPHeaders: { 'X-Test-Worker': String(workerSchema.index) },
    });
    await use(client);
    await client.dispose();
  },
});

export { expect };

/** Sign in through the UI once, and hand back the storage state to reuse. */
export async function signInAs(page, role) {
  await page.goto('/');
  await page.getByRole('button', { name: `Sign in as ${role}` }).click();
  await expect(page.getByTestId('current-user')).toContainText(role);
}
