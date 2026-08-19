import { test, expect } from '@playwright/test';

/**
 * @qase-id       BOR-1
 * @qase-url      —
 * @title         Borrower search page loads with its core controls
 * @suite         Borrower Search > Smoke
 * @priority      high
 * @preconditions API on :4000 with default seed data (60 borrowers)
 * @covers        client/src/App.jsx server/index.js
 * @generated-by  hand — reference for house style
 */
test(
  'BOR-1 — borrower search page loads with its core controls',
  { tag: ['@qase:BOR-1', '@smoke'] },
  async ({ page }) => {
    // Step 1: open the app
    await page.goto('/');

    // Step 2: expected — the page identifies itself
    await expect(page.getByRole('heading', { name: 'Borrower Search' })).toBeVisible();

    // Step 3: expected — the search and filter controls are present and labelled
    await expect(page.getByRole('textbox', { name: 'Search borrowers' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Status' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Minimum credit score' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toBeVisible();

    // Step 4: expected — results render in a table
    await expect(page.getByRole('table')).toBeVisible();
  },
);
