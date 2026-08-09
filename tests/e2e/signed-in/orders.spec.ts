// /orders — the read path for public.orders. Before this screen existed the
// route was unreachable: /invoice/[id] could only be opened from checkout or
// Stripe's return URL, and the two "purchases & sales" entry points bounced
// each other in a circle.
//
// The fixture account's order count isn't fixed, so every assertion below
// accepts either populated rows or the empty state.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Order history (signed in)', () => {
  test('renders both tabs and either rows or an empty state', async ({ page }) => {
    await page.goto('/orders');
    await waitForAppReady(page);

    await expect(page.getByText('Purchases & sales', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Purchases', { exact: true })).toBeVisible();
    await expect(page.getByText('Sales', { exact: true })).toBeVisible();

    // A price (populated) or the purchases empty state — never a blank screen.
    await expect(
      page.locator('text=/Rs|No purchases yet/').first(),
    ).toBeVisible();
  });

  test('the Sales tab is reachable and never renders blank', async ({ page }) => {
    await page.goto('/orders');
    await waitForAppReady(page);

    await page.getByText('Sales', { exact: true }).click();
    await expect(page.locator('text=/Rs|No sales yet/').first()).toBeVisible();
  });

  test('?side=sold deep-links straight to the seller half', async ({ page }) => {
    // The profile's "Sold" stat links here with this param.
    await page.goto('/orders?side=sold');
    await waitForAppReady(page);

    await expect(page.locator('text=/Rs|No sales yet/').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('the profile row opens it instead of bouncing to /settings', async ({ page }) => {
    // The regression this guards: "My shop" pushed /settings, whose own row
    // pushed back to the profile, so the user could never arrive anywhere.
    await page.goto('/profile');
    await waitForAppReady(page);

    await page.getByText('Details', { exact: true }).click();
    await page.getByText('Purchases & sales', { exact: true }).click();

    await expect(page).toHaveURL(/\/orders/);
  });
});
