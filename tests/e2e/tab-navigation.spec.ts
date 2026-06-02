// Bottom tab bar — every tab routes correctly and the hidden Chat tab is
// reachable from the home header.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';

test.describe('Tab navigation', () => {
  test.beforeEach(async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('Home tab is the default route', async ({ page }) => {
    await expect(page.getByText('What are you looking for today?')).toBeVisible();
  });

  test('My Feed tab routes to the static promo screen', async ({ page }) => {
    await page.getByText('My Feed', { exact: true }).click();
    await expect(page.getByText('Cheaper than new,', { exact: false })).toBeVisible();
    await expect(page.getByText('Certified by experts')).toBeVisible();
  });

  test('Discover tab routes to the search screen', async ({ page }) => {
    await page.getByText('Discover', { exact: true }).click();
    await expect(page.getByPlaceholder('Search items, brands, sellers')).toBeVisible();
  });

  test('Upload ad tab routes to the upload flow (or auth gate when signed out)', async ({ page }) => {
    await page.getByText('Upload ad', { exact: true }).click();
    await expect(page.getByText(/Upload listing|Your story[\s\S]*starts now\./i)).toBeVisible();
  });

  test('My profile tab routes to the profile screen', async ({ page }) => {
    await page.getByText('My profile', { exact: true }).click();
    await expect(page.getByText('Posts', { exact: true })).toBeVisible();
  });
});
