// Bottom tab bar — every tab routes correctly. We don't require auth here;
// the upload/profile tabs render their RequireAuth gate when unauthenticated,
// which is also a valid destination for "the route works".

import { test, expect, waitForAppReady, discoverSearch } from './helpers/page';

test.describe('Tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  // Home now renders what used to live at /feed (the personalized feed) —
  // the old search-header Home screen was removed and this became "/".
  test('Home is the default route', async ({ page }) => {
    await expect(page.getByPlaceholder('Search your feed')).toBeVisible();
  });

  test('Chat tab routes to the inbox', async ({ page }) => {
    await page.getByText('Chat', { exact: true }).click();
    await page.waitForURL(/\/chat/);
    await expect(
      page.getByText(/Inbox|Sign in to chat|It's quiet here/).first(),
    ).toBeVisible();
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
