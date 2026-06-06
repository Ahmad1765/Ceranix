// /(tabs)/profile while signed in: the @handle / stats / tabs render and
// the Selling / Liked tab grids hydrate without throwing. We do NOT mutate
// the account in any way.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Profile tab (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile');
    await waitForAppReady(page);
  });

  test('renders @handle, the three stat columns (Posts, Followers, Following), and the four tabs (Selling, Liked, Shop, Saved)', async ({ page }) => {
    // The @handle prefix is unique enough — there's always at least one.
    await expect(page.locator('text=/^@[\\w.]+$/').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Posts', { exact: true })).toBeVisible();
    await expect(page.getByText('Followers', { exact: true })).toBeVisible();
    await expect(page.getByText('Following', { exact: true })).toBeVisible();
    await expect(page.getByText('Selling', { exact: true })).toBeVisible();
    await expect(page.getByText('Liked', { exact: true })).toBeVisible();
    await expect(page.getByText('Shop', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  });

  test('Liked tab is reachable and renders either its grid or empty state', async ({ page }) => {
    await page.getByText('Liked', { exact: true }).click();
    // Either a `$<price>` chip (real liked listing) or the empty state.
    await expect(
      page.locator('text=/^\\$\\d[\\d,]*$|Nothing liked yet/').first(),
    ).toBeVisible();
  });

  test('Shop tab lists the shop settings rows', async ({ page }) => {
    await page.getByText('Shop', { exact: true }).click();
    await expect(page.getByText('My shop')).toBeVisible();
    await expect(page.getByText('Bundle discount')).toBeVisible();
    await expect(page.getByText('Vacation mode')).toBeVisible();
    await expect(page.getByText('Share your profile')).toBeVisible();
  });

  test('Saved tab shows the placeholder empty state', async ({ page }) => {
    await page.getByText('Saved', { exact: true }).click();
    await expect(page.getByText('No saved boards yet')).toBeVisible();
  });

  test('Edit profile button routes to /profile/edit', async ({ page }) => {
    await page.getByText('Edit profile', { exact: true }).click();
    await page.waitForURL(/profile\/edit/);
    await expect(page.getByText(/Edit your[\s\S]*profile\./i)).toBeVisible();
  });
});
