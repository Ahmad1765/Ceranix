// Discover screen — search input filters listings client-side after a
// `tab: 'popular'` fetch, and category pills filter by `category`.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('Discover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/discover');
    await waitForAppReady(page);
  });

  test('shows the page title, search input, and category tiles', async ({ page }) => {
    await expect(page.getByText('Discover', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Search items, brands, sellers')).toBeVisible();
    await expect(page.getByText('Browse by category')).toBeVisible();
    for (const label of ['Trending', 'Clothing', 'Shoes', 'Bags', 'Accessories', 'Tech', 'Beauty', 'Other']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('search input filters listings by title, brand, and description', async ({ page, state }) => {
    const sneakers = state.listings.find((l) => /sneaker/i.test(l.title))!;
    await page.getByPlaceholder('Search items, brands, sellers').fill('sneaker');
    await expect(page.getByText(sneakers.title).first()).toBeVisible();
    // Items unrelated to the query disappear.
    const unrelated = state.listings.find((l) => !/sneaker/i.test(l.title) && !l.is_sold)!;
    await expect(page.getByText(unrelated.title)).toHaveCount(0);
  });

  test('selecting a category filters the grid to that category', async ({ page, state }) => {
    await page.getByText('Bags', { exact: true }).click();
    const bag = state.listings.find((l) => l.category === 'bags' && !l.is_sold)!;
    await expect(page.getByText(bag.title).first()).toBeVisible();
    const clothing = state.listings.find((l) => l.category === 'clothing' && !l.is_sold)!;
    await expect(page.getByText(clothing.title)).toHaveCount(0);
  });

  test('Clear button restores the full grid', async ({ page, state }) => {
    await page.getByText('Bags', { exact: true }).click();
    await page.getByText('Clear', { exact: true }).click();
    const clothing = state.listings.find((l) => l.category === 'clothing' && !l.is_sold)!;
    await expect(page.getByText(clothing.title).first()).toBeVisible();
  });

  test('no matches shows the "Nothing matched" empty state', async ({ page }) => {
    await page
      .getByPlaceholder('Search items, brands, sellers')
      .fill('quantumprocessorrandomtokenxyz');
    await expect(page.getByText('Nothing matched')).toBeVisible();
    await expect(page.getByText('Try a different word, brand, or category.')).toBeVisible();
  });
});
