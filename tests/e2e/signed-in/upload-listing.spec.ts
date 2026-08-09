// Sell form (components/sell/SellSheet.tsx) — for a signed-in user, tapping
// the Sell tab opens it as a full-screen Modal over whatever screen is
// active, the same way the product page's "Offer" button opens OfferSheet.
// It is not a route: there's no `/sell` URL to `page.goto()`, so every spec
// here opens it via openSellSheet() (lands on Home, taps the Sell tab).
// The flow is a single continuous scroll (Photos → About your item → Item
// details → Pricing → Shipping) with row pickers, not a multi-step wizard,
// so every section should be visible without navigating.
// We do NOT drive a full publish because the web image picker isn't testable
// headlessly and we don't want to insert real listings into the account.

import { test, expect, openSellSheet } from '../helpers/page';

test.describe('Upload listing (signed in)', () => {
  test('the old /upload tab route opens the same sell sheet as a fallback', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });
  });

  test('sell form renders every section as one scroll, with Upload gated until required fields are filled', async ({ page }) => {
    await openSellSheet(page);
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });

    // Photos — empty state offers the pill upload affordance.
    await expect(page.getByText('Photos', { exact: true })).toBeVisible();
    await expect(page.getByText('Upload photos', { exact: true })).toBeVisible();

    // About your item — plain underline fields, no boxed inputs.
    await expect(page.getByText('About your item')).toBeVisible();
    await expect(page.getByPlaceholder("Tell buyers what you're selling")).toBeVisible();
    await expect(page.getByPlaceholder('Tell buyers more about it')).toBeVisible();

    // Item details — row pickers, all present on the same page. Material was
    // removed from the form (2026-07-27) so it must NOT be here.
    await expect(page.getByText('Item details')).toBeVisible();
    await expect(page.getByText('Category', { exact: true })).toBeVisible();
    await expect(page.getByText('Brand', { exact: true })).toBeVisible();
    await expect(page.getByText('Size', { exact: true })).toBeVisible();
    await expect(page.getByText('Condition', { exact: true })).toBeVisible();
    await expect(page.getByText('Material (recommended)')).toHaveCount(0);

    // Pricing / Shipping.
    await expect(page.getByText('Pricing', { exact: true })).toBeVisible();
    await expect(page.getByText('Shipping', { exact: true })).toBeVisible();
    await expect(page.getByText('Parcel size', { exact: true })).toBeVisible();
    await expect(page.getByText('The buyer always pays for shipping')).toBeVisible();

    // Upload CTA (scrolls with the form, right after the safety banner — not
    // a sticky footer) is disabled until photos/title/price/category are filled.
    const uploadCta = page.getByRole('button', { name: 'Upload listing' });
    await expect(uploadCta).toBeVisible();
    await expect(uploadCta).toBeDisabled();
  });

  test('Category row falls back to the placeholder — not the top-level label — until a subcategory is actually picked, and Upload only enables once it is', async ({ page }) => {
    // Regression test: Clothing (the default category) requires a
    // subcategory before canPublish is true, but the row used to show
    // "Clothing" regardless — looking already-set — so sellers filled in
    // everything else and Upload silently stayed disabled with no visible
    // reason why. See project_sell_upload_redesign memory, 2026-07-27.
    await openSellSheet(page);
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('Upload photos', { exact: true }).click(),
    ]);
    await chooser.setFiles('tests/e2e/fixtures/portrait.jpg');
    await expect(page.getByText('COVER', { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder("Tell buyers what you're selling").fill('Vintage denim jacket');

    await page.getByText('Price', { exact: true }).click();
    await page.locator('input[placeholder="0"]').first().fill('2500');
    await page.getByText('Save', { exact: true }).click();

    const uploadCta = page.getByRole('button', { name: 'Upload listing' });
    const categoryRow = page.getByRole('button', { name: /^Category/ });

    // Category defaults to Clothing internally, but nothing has been picked
    // yet — the row must say so, and Upload must stay disabled.
    await expect(categoryRow).toContainText('Add category');
    await expect(uploadCta).toBeDisabled();

    await categoryRow.click();
    await page.getByText('Jeans', { exact: true }).click();

    // Now the row reflects the real pick, and every requirement is met.
    await expect(categoryRow).toContainText('Jeans');
    await expect(uploadCta).toBeEnabled();
  });

  test('the X button closes the sheet back to the screen underneath', async ({ page }) => {
    await openSellSheet(page);
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });

    await page.getByLabel('Close').click();
    await expect(page.getByText('Sell an item')).toHaveCount(0);
    // The Home screen underneath is still there — the tab bar never actually
    // switched to Sell, so we land right back on it.
    await expect(page.getByPlaceholder('Search your feed')).toBeVisible();
  });

  test('Category row opens a picker sheet and writes the chosen value back to the row', async ({ page }) => {
    await openSellSheet(page);
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });

    await page.getByText('Category', { exact: true }).click();
    await expect(page.getByText('Hoodies & Sweats', { exact: true })).toBeVisible();
    await page.getByText('Hoodies & Sweats', { exact: true }).click();

    // Sheet closes and the row now shows the picked subcategory.
    await expect(page.getByRole('button', { name: /^Category\s+Hoodies & Sweats/ })).toBeVisible();
  });
});
