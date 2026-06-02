// Invoice screen — pending vs paid status, parties row, pay/download CTA.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';

test.describe('Invoice', () => {
  test.beforeEach(async ({ page, state }) => {
    await signInAs(page, state, 'alice');
  });

  test('pending invoice (unsold listing) renders the Pay CTA and "Pending" pill', async ({ page, state }) => {
    const listing = state.listings.find((l) => !l.is_sold)!;
    await page.goto(`/invoice/${listing.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('INVOICE')).toBeVisible();
    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText('Pending')).toBeVisible();
    await expect(page.getByText(/^Pay /)).toBeVisible();
  });

  test('paid=1 query param flips status to Paid and shows Download CTA', async ({ page, state }) => {
    const listing = state.listings.find((l) => !l.is_sold)!;
    await page.goto(`/invoice/${listing.id}?paid=1`);
    await waitForAppReady(page);
    await expect(page.getByText('Paid', { exact: true })).toBeVisible();
    await expect(page.getByText('Download invoice')).toBeVisible();
  });

  test('sold listing renders as Paid automatically', async ({ page, state }) => {
    const sold = state.listings.find((l) => l.is_sold)!;
    await page.goto(`/invoice/${sold.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  });

  test('Pay CTA navigates to the payment screen', async ({ page, state }) => {
    const listing = state.listings.find((l) => !l.is_sold)!;
    await page.goto(`/invoice/${listing.id}`);
    await waitForAppReady(page);
    await page.getByText(/^Pay /).click();
    await page.waitForURL(`**/payment/${listing.id}`);
  });

  test('unknown invoice id renders the "Invoice not found" state', async ({ page }) => {
    await page.goto('/invoice/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Invoice not found')).toBeVisible();
  });
});
