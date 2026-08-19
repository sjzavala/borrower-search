import { test, expect } from '@playwright/test';

/**
 * @qase-id       BOR-3
 * @qase-url      https://app.qase.io/case/BOR/3
 * @title         Pagination returns every borrower with no gaps between pages
 * @suite         Borrower Search > Pagination
 * @priority      high
 * @preconditions App running with default seed data (60 borrowers, page size 10)
 * @guards        BUG-1 — slice(start, start + limit - 1) made one borrower per page unreachable
 * @generated-by  qa-tms:codegen
 */
test(
  'BOR-3 — pagination returns every borrower with no gaps between pages',
  { tag: ['@qase:BOR-3', '@regression'] },
  async ({ page }) => {
    // Step 1: open the borrower search page
    await page.goto('/');
    // See BUG-8: settle the baseline request before asserting or paging.
    await page.waitForLoadState('networkidle');

    const dataRows = page.getByRole('rowgroup').nth(1).getByRole('row');

    // Step 1 expected: a full page of 10 rows, indicator reads "Page 1 of 6"
    await expect(dataRows).toHaveCount(10);
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 1 of 6');

    // Step 2 expected: the last row of page 1 is the 10th borrower in seed order
    await expect(dataRows.last().getByRole('cell').first()).toHaveText('Elizabeth Martinez');

    // Step 3: advance to page 2
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 2 of 6');

    // Step 3 expected: page 2 starts at the 11th borrower — nobody is skipped
    await expect(dataRows.first().getByRole('cell').first()).toHaveText("Richard O'Brien");
  },
);
