// Bottom tab bar — every tab routes correctly. We don't require auth here;
// the upload/profile tabs render their RequireAuth gate when unauthenticated,
// which is also a valid destination for "the route works".

import { test, expect, waitForAppReady, discoverSearch } from './helpers/page';

test.describe('Tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('Home is the default route', async ({ page }) => {
    await expect(page.getByText('What are you looking for today?')).toBeVisible();
  });

  // /feed used to be a static promo screen headlined "Cheaper than new," —
  // that copy no longer exists anywhere in the app; the route is now the
  // personalized feed. Assert the URL (the thing this spec is actually about)
  // plus the screen heading, rather than marketing copy that turns over.
  test('My Feed tab routes to the personalized feed', async ({ page }) => {
    await page.getByText('My Feed', { exact: true }).first().click();
    await page.waitForURL(/\/feed/);
    // "My Feed" is both the tab label and the screen heading — .first() to
    // stay out of strict mode.
    await expect(page.getByText('My Feed', { exact: true }).first()).toBeVisible();
  });

  test('Discover tab routes to the search screen', async ({ page }) => {
    await page.getByText('Discover', { exact: true }).click();
    await expect(discoverSearch(page)).toBeVisible();
  });

  test('Sell tab routes (gate or upload form depending on auth)', async ({ page }) => {
    await page.getByText('Sell', { exact: true }).click();
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
