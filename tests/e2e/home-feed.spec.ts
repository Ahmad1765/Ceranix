// Home feed structural checks — search header, tab pills, and navigation.
// We do NOT assert specific listing titles because the suite runs against the
// real Supabase backend; we only assert that listings render (any of them)
// and that tapping one routes to /product/<id>.

import { test, expect, waitForAppReady, scrollFeedToBottom } from './helpers/page';

test.describe('Home feed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('renders search header and the three tab pills', async ({ page }) => {
    await expect(page.getByText('What are you looking for today?')).toBeVisible();
    await expect(page.getByText('For you', { exact: true })).toBeVisible();
    await expect(page.getByText('Popular', { exact: true })).toBeVisible();
    await expect(page.getByText('Following', { exact: true })).toBeVisible();
  });

  test('the For You feed shows at least one listing price', async ({ page }) => {
    await scrollFeedToBottom(page);
    // Every ListingCard renders a `$<price>` Text. Any match means the grid
    // hydrated against the real backend. We accept currency strings with or
    // without commas (e.g. "$24", "$1,290").
    await expect(page.locator('text=/^\\$\\d[\\d,]*$/').first()).toBeVisible();
  });

  test('switching to Popular still renders at least one listing price', async ({ page }) => {
    await page.getByText('Popular', { exact: true }).click();
    await scrollFeedToBottom(page);
    await expect(page.locator('text=/^\\$\\d[\\d,]*$/').first()).toBeVisible();
  });

  test('Following tab shows the empty/suggestion state copy', async ({ page }) => {
    await page.getByText('Following', { exact: true }).click();
    await expect(page.getByText('You are not following anyone yet.')).toBeVisible();
    await expect(page.getByText('Follow').first()).toBeVisible();
  });

  test('tapping the first listing card navigates to /product/<id>', async ({ page }) => {
    await scrollFeedToBottom(page);
    // The first card's `$<price>` element is inside the same Pressable as the
    // card; click it and wait for the route to change.
    await page.locator('text=/^\\$\\d[\\d,]*$/').first().click();
    await page.waitForURL(/\/product\/[\w-]+/);
    await expect(page).toHaveURL(/\/product\/[\w-]+/);
  });

  test('chat tab is reachable by route', async ({ page }) => {
    await page.goto('/chat');
    await waitForAppReady(page);
    // Logged-out: empty state. Logged-in (unlikely in this run): Inbox header.
    await expect(page.getByText(/Inbox|Sign in to chat|It's quiet here/).first()).toBeVisible();
  });
});
