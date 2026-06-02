// Payment screen — uses a real listing id at runtime. We test the hero +
// rows + slide-to-pay copy, and the unknown-id error state. We don't
// trigger the slide-to-pay confirm; that opens Stripe Checkout (or runs the
// demo redirect) and we don't want to touch either side in this suite.

import { test, expect, waitForAppReady, fetchAnyLiveListing } from './helpers/page';

test.describe('Payment', () => {
  test('renders Pay in full hero, rows, and slide-to-pay control', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/payment/${listing!.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('Pay in full')).toBeVisible({ timeout: 20_000 });
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
    await expect(page.getByText('Item unavailable')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Go back')).toBeVisible();
  });

  test('See details routes to the invoice screen for the same listing', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/payment/${listing!.id}`);
    await waitForAppReady(page);
    await page.getByText('See details').click();
    await page.waitForURL(`**/invoice/${listing!.id}**`);
    await expect(page.getByText('INVOICE')).toBeVisible({ timeout: 20_000 });
  });
});
