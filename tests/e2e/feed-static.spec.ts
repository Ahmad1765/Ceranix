// The static "My Feed" promo screen — purely presentational, covers USPs,
// category pills, and a hand-crafted product grid.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('My Feed (static promo)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feed');
    await waitForAppReady(page);
  });

  test('renders the hero, USPs, category pills, and product cards', async ({ page }) => {
    await expect(page.getByText('Cheaper than new,', { exact: false })).toBeVisible();
    await expect(page.getByText('better than used.', { exact: false })).toBeVisible();
    await expect(page.getByText('Certified by experts')).toBeVisible();
    await expect(page.getByText('Minimum 1 year warranty')).toBeVisible();
    await expect(page.getByText('30 days return policy')).toBeVisible();
    await expect(page.getByText('Express delivery')).toBeVisible();
    await expect(page.getByText('iPhones', { exact: true })).toBeVisible();
    await expect(page.getByText('iPhone 11', { exact: true })).toBeVisible();
    await expect(page.getByText('iPhone 11 Pro', { exact: true })).toBeVisible();
  });
});
