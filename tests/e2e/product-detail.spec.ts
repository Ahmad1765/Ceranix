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

    // The inline offer field replaced the OfferSheet modal. Signed out, the
    // guest gate must intercept before the field can expand.
    const offer = page.getByRole('button', { name: 'Make an offer' });
    await expect(offer).toBeVisible({ timeout: 20_000 });
    await offer.click();

    // Assert behaviour, not layout: the field is always mounted and merely
    // faded out (Playwright counts opacity-0 as visible), and its width tracks
    // the button size. The load-bearing property is that the field only becomes
    // editable once expanded — so signed out it must stay non-editable while
    // the guest gate takes over.
    await expect(page.getByText(/free account/i).first()).toBeVisible();
    await expect(page.getByLabel('Offer amount')).not.toBeEditable();
  });

  test('unknown listing id renders the "Listing not available" empty state', async ({ page }) => {
    await page.goto('/product/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Listing not available')).toBeVisible({ timeout: 20_000 });
  });
});
