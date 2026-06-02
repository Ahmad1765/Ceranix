// Discover screen — structural assertions only. We never type a specific
// brand name (we don't know what data exists); we type junk and confirm the
// empty state appears.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('Discover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/discover');
    await waitForAppReady(page);
  });

  test('shows page title, search input, and the eight category tiles', async ({ page }) => {
    // "Discover" is rendered both as the page title AND as the bottom tab
    // label — use .first() to skip strict mode.
    await expect(page.getByText('Discover', { exact: true }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Search items, brands, sellers')).toBeVisible();
    await expect(page.getByText('Browse by category')).toBeVisible();
    for (const label of ['Trending', 'Clothing', 'Shoes', 'Bags', 'Accessories', 'Tech', 'Beauty', 'Other']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('typing junk into search renders the "Nothing matched" empty state', async ({ page }) => {
    await page
      .getByPlaceholder('Search items, brands, sellers')
      .fill('quantumprocessorrandomtokenxyz');
    await expect(page.getByText('Nothing matched')).toBeVisible();
    await expect(page.getByText('Try a different word, brand, or category.')).toBeVisible();
  });

  test('selecting a category surfaces the Clear chip', async ({ page }) => {
    await page.getByText('Bags', { exact: true }).click();
    await expect(page.getByText('Clear', { exact: true })).toBeVisible();
    await page.getByText('Clear', { exact: true }).click();
    // After clearing, the Trending section header is back.
    await expect(page.getByText(/Trending|Results/i).first()).toBeVisible();
  });
});
