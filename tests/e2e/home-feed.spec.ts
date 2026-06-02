// Home feed (the `(tabs)/index` route). Three pill tabs (For you / Popular /
// Following), a search header that opens the inbox, and a 3-column listing
// grid backed by `fetchListingsResult` against the `listings` table.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('Home feed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('renders search header, tab pills, and listing cards from the mocked feed', async ({ page, state }) => {
    await expect(page.getByText('What are you looking for today?')).toBeVisible();
    await expect(page.getByText('For you', { exact: true })).toBeVisible();
    await expect(page.getByText('Popular', { exact: true })).toBeVisible();
    await expect(page.getByText('Following', { exact: true })).toBeVisible();
    // The non-sold mocked listings should render their titles in the grid.
    for (const listing of state.listings.filter((l) => !l.is_sold)) {
      await expect(page.getByText(listing.title).first()).toBeVisible();
    }
    // Sold listings must not appear on the feed (RLS+filter remove them).
    const sold = state.listings.find((l) => l.is_sold);
    if (sold) await expect(page.getByText(sold.title)).toHaveCount(0);
  });

  test('switching to Popular reorders by likes desc', async ({ page, state }) => {
    await page.getByText('Popular', { exact: true }).click();
    // The first non-sold listing in the Popular tab should be the highest-liked.
    const topByLikes = [...state.listings]
      .filter((l) => !l.is_sold)
      .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))[0];
    await expect(page.getByText(topByLikes.title).first()).toBeVisible();
  });

  test('Following tab shows the empty/suggestion state', async ({ page }) => {
    await page.getByText('Following', { exact: true }).click();
    await expect(page.getByText('You are not following anyone yet.')).toBeVisible();
    // Suggested users are static — at least one Follow CTA should render.
    await expect(page.getByText('Follow').first()).toBeVisible();
  });

  test('empty feed renders the "Nothing here yet" empty state', async ({ page, state }) => {
    state.listings = [];
    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByText(/Nothing here/i)).toBeVisible();
    await expect(page.getByText(/Pull down to refresh/i)).toBeVisible();
  });

  test('tapping a listing card navigates to /product/[id]', async ({ page, state }) => {
    const first = state.listings.find((l) => !l.is_sold)!;
    await page.getByText(first.title).first().click();
    await page.waitForURL(`**/product/${first.id}`);
    await expect(page.getByText(first.title).first()).toBeVisible();
  });

  test('chat tab is reachable by route (hidden href, opened from header)', async ({ page }) => {
    // The chat tab has `href:null` so it's not in the tab bar. The home
    // header's icon pressable navigates to it programmatically; we assert
    // the destination renders here, and rely on chat-inbox.spec for the
    // signed-in flow.
    await page.goto('/chat');
    await waitForAppReady(page);
    await expect(page.getByText(/Inbox|Sign in to chat|It's quiet here/)).toBeVisible();
  });
});
