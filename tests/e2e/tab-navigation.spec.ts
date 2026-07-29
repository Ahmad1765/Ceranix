// Bottom tab bar — every tab routes correctly. We don't require auth here;
// the upload/profile tabs render their RequireAuth gate when unauthenticated,
// which is also a valid destination for "the route works".
//
// Tabs are located by role + accessible name, never by getByText: the tab bar
// is icon-only (AnimatedTabBar renders glyphs, and the label survives solely
// as the button's aria-label), so a text locator matches nothing and times
// out. That mismatch is what made this file look chronically flaky.

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
    await page.getByRole('button', { name: 'Chat' }).click();
    await page.waitForURL(/\/chat/);
    await expect(
      page.getByText(/Inbox|Sign in to chat|It's quiet here/).first(),
    ).toBeVisible();
  });

  // The Discover tab no longer routes — like Sell, it opens a sheet over the
  // current screen (components/discover/DiscoverSheet.tsx). Picking something
  // in the sheet is what navigates, so this asserts both halves.
  // Located by role/aria-label, not text: the tab bar is icon-only.
  test('Discover tab opens the search sheet, which routes on pick', async ({ page }) => {
    await page.getByRole('button', { name: 'Discover' }).click();
    await expect(page.getByPlaceholder(/^Search \w+\.\.\.$/)).toBeVisible();
    await expect(page.getByText('Browse', { exact: true })).toBeVisible();
    await expect(page.getByText('Topics', { exact: true })).toBeVisible();
    // Still on Home — the sheet is an overlay, not a route.
    await expect(page).toHaveURL(/\/(\?.*)?$/);

    await page.getByText('Bags', { exact: true }).first().click();
    await page.waitForURL(/category=bags/);
    await expect(discoverSearch(page)).toBeVisible();
  });

  test('Sell tab routes (gate or upload form depending on auth)', async ({ page }) => {
    await page.getByRole('button', { name: 'Sell' }).click();
    await expect(
      page.getByText(/Upload listing|Your story[\s\S]*starts now\.|Continue as guest/i).first(),
    ).toBeVisible();
  });

  test('My profile tab routes (auth gate or profile)', async ({ page }) => {
    await page.getByRole('button', { name: 'My profile' }).click();
    await expect(
      page.getByText(/Posts|Continue as guest|Your story[\s\S]*starts now\./i).first(),
    ).toBeVisible();
  });
});
