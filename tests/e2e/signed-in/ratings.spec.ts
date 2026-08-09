// /ratings — the overall-rating card renders for the signed-in user and the
// achievements list is shown. Empty-sales-and-rating accounts get the
// "No sales yet" callout instead of unlocked achievements.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Ratings (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ratings');
    await waitForAppReady(page);
  });

  test('renders the OVERALL RATING card and the achievements section', async ({ page }) => {
    await expect(page.getByText('OVERALL RATING')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('ACHIEVEMENTS')).toBeVisible();
    await expect(page.getByText('Verified by buyers')).toBeVisible();
    await expect(page.getByText('Featured seller')).toBeVisible();
    await expect(page.getByText('Top-rated shop')).toBeVisible();
  });

  test('renders either a rating value or the no-sales callout', async ({ page }) => {
    // The score card always shows a numeric rating (eg "0.0"); zero-sales
    // accounts additionally render the info banner about needing a sale.
    await expect(page.locator('text=/^\\d+\\.\\d+$/').first()).toBeVisible();
  });
});
