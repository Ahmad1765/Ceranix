// Bottom tab bar — every tab routes correctly. We don't require auth here;
// the upload/profile tabs render their RequireAuth gate when unauthenticated,
// which is also a valid destination for "the route works".

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('Tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('Home is the default route', async ({ page }) => {
    await expect(page.getByText('What are you looking for today?')).toBeVisible();
  });

  test('My Feed tab routes to the static promo screen', async ({ page }) => {
    await page.getByText('My Feed', { exact: true }).click();
    await expect(page.getByText('Cheaper than new,', { exact: false })).toBeVisible();
  });

  test('Discover tab routes to the search screen', async ({ page }) => {
    await page.getByText('Discover', { exact: true }).click();
    await expect(page.getByPlaceholder('Search items, brands, sellers')).toBeVisible();
  });

  test('Upload ad tab routes (gate or upload form depending on auth)', async ({ page }) => {
    await page.getByText('Upload ad', { exact: true }).click();
    await expect(
      page.getByText(/Upload listing|Your story[\s\S]*starts now\.|Continue as guest/i).first(),
    ).toBeVisible();
  });

  test('My profile tab routes (auth gate or profile)', async ({ page }) => {
    await page.getByText('My profile', { exact: true }).click();
    await expect(
      page.getByText(/Posts|Continue as guest|Your story[\s\S]*starts now\./i).first(),
    ).toBeVisible();
  });
});
