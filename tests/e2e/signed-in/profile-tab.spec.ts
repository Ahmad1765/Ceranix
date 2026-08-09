// /(tabs)/profile while signed in: the @handle / stats / tabs render and
// the Selling / Liked tab grids hydrate without throwing. We do NOT mutate
// the account in any way.

import { test, expect } from '@playwright/test';
import { waitForAppReady, PRICE_PATTERN } from '../helpers/page';

test.describe('Profile tab (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile');
    await waitForAppReady(page);
  });

  test('renders @handle, the four stat columns (Items, Sold, Followers, Following), and the four tabs (Selling, Liked, Saved, Details)', async ({ page }) => {
    // The @handle prefix is unique enough — there's always at least one.
    await expect(page.locator('text=/^@[\\w.]+$/').first()).toBeVisible({ timeout: 20_000 });
    // The first stat column is labelled "Items"; it was "Posts" when this spec
    // was written. "Sold" joined the bar in the banner redesign.
    await expect(page.getByText('Items', { exact: true })).toBeVisible();
    await expect(page.getByText('Sold', { exact: true })).toBeVisible();
    await expect(page.getByText('Followers', { exact: true })).toBeVisible();
    await expect(page.getByText('Following', { exact: true })).toBeVisible();
    await expect(page.getByText('Selling', { exact: true })).toBeVisible();
    await expect(page.getByText('Liked', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    // The old "Shop" tab became "Details"; its settings rows moved inside it.
    await expect(page.getByText('Details', { exact: true })).toBeVisible();
  });

  test('Liked tab is reachable and renders either its grid or empty state', async ({ page }) => {
    await page.getByText('Liked', { exact: true }).click();
    // Either a price chip (real liked listing) or the empty state.
    await expect(
      page.locator(`text=/${PRICE_PATTERN}|Nothing liked yet/`).first(),
    ).toBeVisible();
  });

  test('Details tab shows About me, the seller level and the shop settings rows', async ({ page }) => {
    await page.getByText('Details', { exact: true }).click();
    await expect(page.getByText('About me')).toBeVisible();
    await expect(page.getByText('Seller level')).toBeVisible();
    // The rows that used to live behind the "Shop" tab. "My shop" was renamed
    // to "Purchases & sales" when it stopped bouncing to /settings and started
    // opening the order history at /orders.
    await expect(page.getByText('Purchases & sales', { exact: true })).toBeVisible();
    await expect(page.getByText('Ratings & reviews', { exact: true })).toBeVisible();
    await expect(page.getByText('Bundle discount')).toBeVisible();
    await expect(page.getByText('Vacation mode')).toBeVisible();
    await expect(page.getByText('Share your profile')).toBeVisible();
  });

  test('Saved tab shows its grid or the empty state', async ({ page }) => {
    await page.getByText('Saved', { exact: true }).click();
    // Saved lists were reworked from "boards" to items: the empty copy is now
    // "No saved items yet" (or "This list is empty" inside a specific list).
    // Accept a populated grid too — this account's saves aren't fixed.
    await expect(
      page.locator(`text=/${PRICE_PATTERN}|No saved items yet|This list is empty/`).first(),
    ).toBeVisible();
  });

  test('Edit profile button routes to /profile/edit', async ({ page }) => {
    await page.getByText('Edit profile', { exact: true }).click();
    await page.waitForURL(/profile\/edit/);
    await expect(page.getByText(/Edit your[\s\S]*profile\./i)).toBeVisible();
  });
});
