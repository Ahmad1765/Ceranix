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

  test('Saved tab CTA routes to the sign-in page (signed-out)', async ({
    page,
  }) => {
    await page.getByText('Saved', { exact: true }).click();
    // Signed-out variant.
    await expect(page.getByText('Sign in to save searches')).toBeVisible();
    await page.getByText('Sign in', { exact: true }).first().click();
    // Lands on the auth flow (either modal or the welcome view).
    await expect(
      page
        .getByText(/Your story[\s\S]*starts now\.|Welcome[\s\S]*back\.|Continue as guest/i)
        .first(),
    ).toBeVisible();
  });
});
