// Payment screen — demo mode (no STRIPE_PUBLISHABLE_KEY), slide-to-pay,
// and redirect to /invoice/[id]?paid=1.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';

test.describe('Payment', () => {
  test.beforeEach(async ({ page, state }) => {
    await signInAs(page, state, 'alice');
  });

  test('renders Pay in full hero, seller row, card row, total, and slide-to-pay', async ({ page, state }) => {
    const listing = state.listings.find((l) => !l.is_sold)!;
    await page.goto(`/payment/${listing.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('Pay in full')).toBeVisible();
    await expect(page.getByText('Stripe not connected · Demo')).toBeVisible();
    await expect(page.getByText('To', { exact: true })).toBeVisible();
    await expect(page.getByText('From', { exact: true })).toBeVisible();
    await expect(page.getByText('Pay on')).toBeVisible();
    await expect(page.getByText('Fee (0%)')).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();
    await expect(page.getByText(/Slide to pay/i)).toBeVisible();
  });

  test('unknown listing id shows the "Item unavailable" state', async ({ page }) => {
    await page.goto('/payment/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Item unavailable')).toBeVisible();
    await expect(page.getByText('Go back')).toBeVisible();
  });

  test('See details routes to the invoice screen for the same listing', async ({ page, state }) => {
    const listing = state.listings.find((l) => !l.is_sold)!;
    await page.goto(`/payment/${listing.id}`);
    await waitForAppReady(page);
    await page.getByText('See details').click();
    await page.waitForURL(`**/invoice/${listing.id}**`);
    await expect(page.getByText('INVOICE')).toBeVisible();
  });
});
