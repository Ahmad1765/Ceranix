// Invoice screen — uses a real listing id at runtime. Pending vs. paid query
// param, plus the unknown-id error state.

import { test, expect, waitForAppReady, fetchAnyLiveListing } from './helpers/page';

test.describe('Invoice', () => {
  test('renders the INVOICE hero and a status pill for a real listing', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/invoice/${listing!.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('INVOICE')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText(/Pending|Paid/).first()).toBeVisible();
  });

  test('paid=1 query param flips status to Paid and shows Download CTA', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/invoice/${listing!.id}?paid=1`);
    await waitForAppReady(page);
    await expect(page.getByText('Paid', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Download invoice')).toBeVisible();
  });

  test('unknown invoice id renders the "Invoice not found" state', async ({ page }) => {
    await page.goto('/invoice/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Invoice not found')).toBeVisible({ timeout: 20_000 });
  });
});
