import { test, expect } from '@playwright/test';

/**
 * @qase-id       BOR-2
 * @qase-url      https://app.qase.io/case/BOR/2
 * @title         Search by last name is case-insensitive
 * @suite         Borrower Search > Filtering
 * @priority      high
 * @preconditions App running with default seed data (60 borrowers, 3 with last name Smith)
 * @guards        BUG-5 — a lowercase query returned zero results
 * @generated-by  qa-tms:codegen
 */
test(
  'BOR-2 — search by last name is case-insensitive',
  { tag: ['@qase:BOR-2', '@regression'] },
  async ({ page }) => {
    // Step 1: open the borrower search page
    await page.goto('/');
    // Settle the initial load before interacting. The app fires its baseline request
    // twice and does not guard against out-of-order responses (BUG-8), so acting too
    // early lets a stale response overwrite the filtered results and this guard would
    // then fail for the wrong reason.
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('table')).toBeVisible();

    // rowgroup[0] is the header (thead), rowgroup[1] is the body (tbody)
    const dataRows = page.getByRole('rowgroup').nth(1).getByRole('row');

    // Step 2: type "smith" (lowercase) into the Search borrowers field
    await page.getByRole('textbox', { name: 'Search borrowers' }).fill('smith');

    // Step 2 expected: exactly 3 rows, all with last name Smith
    await expect(dataRows).toHaveCount(3);
    await expect(page.getByRole('cell', { name: /\bSmith$/ })).toHaveCount(3);

    // Step 3 expected: the result count reads "3 borrowers"
    await expect(page.getByTestId('result-count')).toHaveText('3 borrowers');
  },
);
