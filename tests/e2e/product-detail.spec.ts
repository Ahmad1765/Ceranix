// Product detail — drives the page from a live listing fetched at runtime.
// We assert the page mounted (description block or seller card visible) and
// that the not-found path renders the error state for an obviously bad id.

import { test, expect, waitForAppReady, fetchAnyLiveListing } from './helpers/page';

test.describe('Product detail', () => {
  test('renders a real listing\'s hero and description block', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/product/${listing!.id}`);
    await waitForAppReady(page);
    // The product page always renders an "Item description" eyebrow. That's
    // a stable structural element regardless of what data backs the page.
    await expect(page.getByText('Item description')).toBeVisible({ timeout: 20_000 });
    // A `$<price>` Text also always renders in the hero block.
    await expect(page.locator('text=/^\\$\\d[\\d,]*$/').first()).toBeVisible();
  });

  test('unknown listing id renders the "Listing not available" empty state', async ({ page }) => {
    await page.goto('/product/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Listing not available')).toBeVisible({ timeout: 20_000 });
  });
});
