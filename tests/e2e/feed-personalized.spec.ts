// My Feed structural checks. We run against the real Supabase backend in
// the unsigned-in state, so we only assert what every visitor sees:
// the title, subtitle, cold-start banner, the "For you" chip, and the
// fallback grid that always renders when there are no personal signals.

import { test, expect, waitForAppReady, priceText } from './helpers/page';

test.describe('My Feed (personalized)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feed');
    await waitForAppReady(page);
  });

  test('renders title and subtitle', async ({ page }) => {
    // "My Feed" appears twice — the screen heading and the tab-bar button —
    // so an unqualified getByText is a strict-mode violation. Anchor on the
    // heading via the subtitle it sits with.
    await expect(page.getByText('My Feed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Curated from what you like')).toBeVisible();
  });

  test('signed-out viewer sees the sign-in prompt banner', async ({ page }) => {
    await expect(
      page.getByText(/Sign in and like a few items to see this feed personalize itself/i),
    ).toBeVisible();
  });

  test('shows the For you chip', async ({ page }) => {
    await expect(page.getByText('For you', { exact: true })).toBeVisible();
  });

  test('fallback grid renders listings', async ({ page }) => {
    await expect(priceText(page).first()).toBeVisible({ timeout: 15_000 });
  });

  test('tapping a card in the fallback grid routes to /product/<id>', async ({ page }) => {
    await priceText(page).first().click();
    await page.waitForURL(/\/product\/[\w-]+/);
    await expect(page).toHaveURL(/\/product\/[\w-]+/);
  });

  test('Price Drops section is absent', async ({ page }) => {
    await expect(page.getByText('Price drops')).toHaveCount(0);
  });
});
