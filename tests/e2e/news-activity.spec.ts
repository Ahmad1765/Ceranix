// Activity screen (/news) — Following / For you / Saved pill tabs, each with
// its own empty state. No backend dependency.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('News / Activity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/news');
    await waitForAppReady(page);
  });

  test('renders the Activity header and the three tabs', async ({ page }) => {
    await expect(page.getByText('Activity', { exact: true })).toBeVisible();
    await expect(page.getByText('Following', { exact: true })).toBeVisible();
    await expect(page.getByText('For you', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  });

  test('Following tab shows "Quiet on this side"', async ({ page }) => {
    await expect(page.getByText('Quiet on this side')).toBeVisible();
  });

  test('For you tab shows "Nothing for you yet"', async ({ page }) => {
    await page.getByText('For you', { exact: true }).click();
    await expect(page.getByText('Nothing for you yet')).toBeVisible();
  });

  test('Saved tab CTA routes to Discover', async ({ page }) => {
    await page.getByText('Saved', { exact: true }).click();
    await expect(page.getByText('No saved searches')).toBeVisible();
    await page.getByText('Search now').click();
    await page.waitForURL(/discover/);
    // "Discover" appears as both page title and the bottom tab label.
    await expect(page.getByText('Discover', { exact: true }).first()).toBeVisible();
  });
});
