// Product detail — drives the page from a live listing fetched at runtime.
// We assert the page mounted (details box or seller card visible) and that the
// not-found path renders the error state for an obviously bad id.

import { test, expect, waitForAppReady, fetchAnyLiveListing } from './helpers/page';

test.describe('Product detail', () => {
  test('renders a real listing\'s hero and details box', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/product/${listing!.id}`);
    await waitForAppReady(page);
    // The details box always opens with a Category row, whatever data backs
    // the page. This replaced the old "Item description" eyebrow, dropped when
    // the description moved to the bottom of the box.
    await expect(page.getByText('Category', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Condition', { exact: true })).toBeVisible();
    // A formatted price also always renders in the hero block. Money is PKR
    // via lib/currency ("Rs 16,450" / "Rs 16,450.45"), never "$".
    await expect(page.locator('text=/^Rs [\\d,]+(\\.\\d{2})?$/').first()).toBeVisible();
  });

  test('offer stays shut for signed-out visitors', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/product/${listing!.id}`);
    await waitForAppReady(page);

    // app/product/[id].tsx imports ProductActionBar.legacy, so "Make an offer"
    // opens the OfferSheet modal — it is NOT the inline field. canOffer()
    // (app/product/[id].tsx:531) fires the guest gate and returns false for a
    // signed-out visitor, so the sheet must never mount.
    //
    // This previously asserted getByLabel('Offer amount'), which exists only in
    // the non-imported components/product/ProductActionBar.tsx — so it could
    // never match and failed on all four viewports. If the inline bar is ever
    // restored, swap the second assertion for `not.toBeEditable()` on that label.
    const offer = page.getByRole('button', { name: 'Make an offer' });
    await expect(offer).toBeVisible({ timeout: 20_000 });
    await offer.click();

    // The gate intercepted...
    await expect(page.getByText(/free account/i).first()).toBeVisible();
    // ...and the offer sheet stayed shut: its submit control never mounted.
    await expect(page.getByRole('button', { name: 'Send price suggestion' })).toHaveCount(0);
  });

  test('unknown listing id renders the "Listing not available" empty state', async ({ page }) => {
    await page.goto('/product/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Listing not available')).toBeVisible({ timeout: 20_000 });
  });
});
