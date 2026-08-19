import { test, expect } from '@playwright/test';

/**
 * @qase-id       BOR-4
 * @qase-url      https://app.qase.io/case/BOR/4
 * @title         Minimum credit score filter includes borrowers at exactly the threshold
 * @suite         Borrower Search > Filtering
 * @priority      high
 * @preconditions App running with default seed data; Patricia Garcia and Joseph Gonzalez both score exactly 700
 * @guards        BUG-6 — `creditScore > minScore` excluded applicants who exactly meet the threshold
 * @generated-by  qa-tms:codegen
 */
test(
  'BOR-4 — minimum credit score filter includes borrowers at exactly the threshold',
  { tag: ['@qase:BOR-4', '@regression'] },
  async ({ page }) => {
    // Step 1: open the borrower search page
    await page.goto('/');
    // See BUG-8: the baseline request is not guarded against out-of-order responses,
    // so settle it before filtering or a stale response masks this defect.
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('table')).toBeVisible();

    // Step 2: filter at the policy threshold
    await page.getByRole('spinbutton', { name: 'Minimum credit score' }).fill('700');

    // Step 2 expected: no row falls below the threshold.
    // This runs FIRST and polls, so it doubles as the wait for the filter to apply.
    // Asserting Patricia before this point would pass against the unfiltered list
    // and report a false green.
    const scores = page.getByRole('rowgroup').nth(1).getByRole('row').getByRole('cell').nth(3);
    await expect
      .poll(async () => (await scores.allTextContents()).every((t) => Number(t) >= 700))
      .toBe(true);

    // Step 3 expected: the borrower scoring exactly 700 is included
    const patricia = page.getByRole('row').filter({ hasText: 'Patricia Garcia' });
    await expect(patricia).toBeVisible();
    await expect(patricia.getByRole('cell', { name: '700', exact: true })).toBeVisible();
  },
);
