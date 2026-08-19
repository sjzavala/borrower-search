import { test, expect } from '@playwright/test';

/**
 * @qase-id       BOR-5
 * @qase-url      https://app.qase.io/case/BOR/5
 * @title         Case sensitivity for borrower search
 * @suite         Borrower Search > Filtering
 * @priority      medium
 * @preconditions App running with default seed data (60 borrowers; exactly 3 match
 *                "James" — James Smith id 1, James Martin id 40, James Jackson id 59)
 * @covers        server/routes.js client/src/App.jsx
 * @guards        BUG-6 — a lowercase query returned zero results because the API
 *                compares with `.includes(query)` and never normalises case
 *                (server/routes.js:37-39)
 * @generated-by  qa-tms:codegen
 */
test(
  'BOR-5 — borrower search matches regardless of query case',
  { tag: ['@qase:BOR-5', '@regression'] },
  async ({ page }) => {
    // BUG-6 is planted and permanent in this sandbox, so this guard can never go green
    // here the way it would in a real repo. Annotating it keeps the suite meaningful:
    // the assertion below still describes correct behaviour, and if anyone ever fixes
    // server/routes.js this test passes unexpectedly and *fails* the run — which is the
    // signal to delete this line. A guard that is merely expected to fail is silent; one
    // that is expected to fail and then doesn't is a notification.
    test.fail();

    // Step 1: open the borrower search page and click into the search bar
    await page.goto('/');
    // Settle the baseline request before interacting. The app fetches in useEffect with
    // no abort or sequence guard, and the API deliberately delays short queries longest
    // (server/routes.js:56), so acting too early lets the unfiltered response land after
    // a filtered one and this guard would fail for the wrong reason.
    await page.waitForLoadState('networkidle');

    const searchBox = page.getByRole('textbox', { name: 'Search borrowers' });
    await searchBox.click();

    // Step 1 expected: the search bar is selected
    await expect(searchBox).toBeFocused();

    // rowgroup[0] is the header (thead), rowgroup[1] is the body (tbody)
    const dataRows = page.getByRole('rowgroup').nth(1).getByRole('row');

    // Step 2: type "James" (capital J) into the Search borrowers field
    await searchBox.fill('James');

    // Step 2 expected: the 3 borrowers named James populate
    await expect(dataRows).toHaveCount(3);
    await expect(page.getByRole('cell', { name: /^James\b/ })).toHaveCount(3);

    // Step 3: clear the search bar and let the results settle before retyping.
    // This intermediate assertion is load-bearing: without it, a stale render of the
    // "James" results (also 3 rows) could satisfy the lowercase assertion below and
    // report a false pass — the one outcome this test exists to prevent.
    await searchBox.fill('');
    await expect.poll(async () => dataRows.count()).toBeGreaterThan(3);

    // Step 3: type "james" (lower case j)
    await searchBox.fill('james');

    // Step 3 expected: the same 3 borrowers return — search matches regardless of case
    await expect(dataRows).toHaveCount(3);
    await expect(page.getByRole('cell', { name: /^James\b/ })).toHaveCount(3);
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
  },
);
