import { test, expect, signInAs } from '../fixtures.js';

/**
 * @qase-id       BOR-11
 * @title         A mid-suite data reset does not invalidate a cached session
 * @suite         Borrower Search > Isolation
 * @priority      critical
 * @preconditions API running with NODE_ENV=test; each worker owns schema test_wN
 * @covers        server/db/seed.js server/db/schema.sql server/db/pool.js server/auth.js
 * @guards        The composition trap — a per-worker data reset silently invalidating the
 *                cached storageState it was supposed to be independent of
 *                (docs/isolation-lifecycle.md)
 *
 * The proof the whole extension exists for.
 *
 * Four of these run in parallel, one per worker, each against its own schema. Two things
 * are being demonstrated at once:
 *
 *   1. **Isolation** — a worker resets its own data while three others are mid-query, and
 *      nobody sees anybody else's rows. If schemas leaked, these tests would interfere and
 *      flake, which is exactly the signal wanted.
 *   2. **Composition** — the reset reloads the fixture without destroying the session, so a
 *      cached login keeps working across it.
 *
 * Run it deliberately parallel:
 *
 *   npx playwright test tests/isolation --workers=4
 */

test.describe('per-worker isolation', () => {
  test('BOR-11 — a data reset reloads the fixture and keeps the session', async ({
    page,
    api,
    workerSchema,
  }) => {
    // Step 1: this worker is on its own schema with the full fixture
    const before = await (await api.get('/test/counts')).json();
    expect(before.schema).toBe(workerSchema.schema);
    expect(before.borrowers).toBe(60);

    // Step 2: sign in through the UI — the session a real suite would cache once
    await signInAs(page, 'underwriter');
    const sessions = await (await api.get('/test/counts')).json();
    expect(sessions.sessions).toBeGreaterThan(0);

    // Step 2 expected: the underwriter's view differs visibly from an analyst's, which is
    // what makes caching a session per role worth doing at all
    await expect(page.getByRole('combobox', { name: /^Status for / }).first()).toBeVisible();

    // Step 3: mutate the data so the reset has something to undo
    await page.getByRole('combobox', { name: /^Status for / }).first().selectOption('Denied');
    await expect(page.getByRole('combobox', { name: /^Status for / }).first()).toHaveValue('Denied');

    // Step 4: reset this worker's data mid-suite — the moment the trap springs
    const reset = await api.post('/test/reset');
    expect(reset.ok()).toBe(true);

    const after = await (await api.get('/test/counts')).json();
    // Step 4 expected: the fixture is back...
    expect(after.borrowers).toBe(60);
    // ...and the session is still there. This is the assertion that fails if the reset
    // scope ever grows to include sessions or users.
    expect(after.sessions).toBe(sessions.sessions);

    // Step 5: the cached session still resolves against the recreated user row
    await page.reload();
    await expect(page.getByTestId('current-user')).toContainText('underwriter');

    // Step 5 expected: the mutation is gone, so the reset genuinely happened rather than
    // being a no-op that trivially preserved the session
    await expect(page.getByRole('combobox', { name: /^Status for / }).first()).toHaveValue('Approved');
  });

  // Four copies so a `--workers=4` run actually occupies four workers. Playwright assigns
  // tests to workers dynamically, so the only way to prove isolation at width N is to give
  // it at least N concurrent tests — one test cannot demonstrate that two schemas do not
  // collide.
  //
  // Each copy is destructive against its own schema while the others are mid-query. If the
  // search_path ever leaked between pooled connections, these would interfere and flake,
  // which is precisely the signal wanted.
  for (const copy of [1, 2, 3, 4]) {
    test(`BOR-12 — the fixture this worker sees is its own (${copy}/4)`, async ({ api, workerSchema }) => {
      // Deliberately destructive, and safe precisely because it is scoped: wiping
      // everything here must not be visible to any other worker running at the same time.
      await api.post('/test/truncate');
      const empty = await (await api.get('/test/counts')).json();
      expect(empty.schema).toBe(workerSchema.schema);
      expect(empty.borrowers).toBe(0);

      // Put it back for whatever runs next in this worker.
      await api.post('/test/seed');
      const restored = await (await api.get('/test/counts')).json();
      expect(restored.borrowers).toBe(60);
      expect(restored.users).toBe(3);
    });
  }
});
