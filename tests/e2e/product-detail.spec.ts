// Product detail — hero carousel, price, seller card, follow/like/message,
// "from this seller" + "similar items" RPC-driven sections, and error states.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('Product detail', () => {
  test('renders title, price, and seller for a valid listing', async ({ page, state }) => {
    const listing = state.listings.find((l) => !l.is_sold)!;
    await page.goto(`/product/${listing.id}`);
    await waitForAppReady(page);
    await expect(page.getByText(listing.title).first()).toBeVisible();
    await expect(page.getByText(`$${listing.price}`).first()).toBeVisible();
    await expect(page.getByText(`@${listing.seller?.username}`)).toBeVisible();
  });

  test('renders the description and Item description eyebrow', async ({ page, state }) => {
    const listing = state.listings.find((l) => !l.is_sold)!;
    await page.goto(`/product/${listing.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('Item description')).toBeVisible();
    await expect(page.getByText(listing.description)).toBeVisible();
  });

  test('unknown listing id shows the "Listing not available" empty state', async ({ page }) => {
    await page.goto('/product/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Listing not available')).toBeVisible();
  });

  test('signed-out user visiting the auth flow lands on welcome', async ({ page }) => {
    // From the product page, every CTA that requires auth (like, follow,
    // message, offer) toasts then routes to /auth/login. We assert the
    // landing page here; per-CTA flows are exercised in auth-flow.spec.
    await page.goto('/auth/login');
    await waitForAppReady(page);
    await expect(page.getByText(/Your story[\s\S]*starts now\./i)).toBeVisible();
  });

  test('signed-in user can toggle like — state persists to the likes table', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    const listing = state.listings.find((l) => l.seller_id !== USERS.alice.id && !l.is_sold)!;
    await page.goto(`/product/${listing.id}`);
    await waitForAppReady(page);
    // The like button is rendered as a pressable around a heart icon and a
    // count; click the count text container which is reliably present.
    const count = page.getByText(String(listing.likes ?? 0)).first();
    await count.click().catch(() => {});
    // After the optimistic flip + roundtrip, the like row should be inserted.
    await page.waitForTimeout(500);
    expect(state.likes.some((l) => l.listing_id === listing.id && l.user_id === USERS.alice.id)).toBeTruthy();
  });

  test('signed-in user can follow the seller — get_follow_state / toggle_follow RPCs fire', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    const listing = state.listings.find((l) => l.seller_id === USERS.bob.id && !l.is_sold)!;
    await page.goto(`/product/${listing.id}`);
    await waitForAppReady(page);
    const followBtn = page.getByText('Follow', { exact: true }).first();
    await followBtn.click();
    await expect(page.getByText('Following', { exact: true })).toBeVisible();
    expect(
      state.follows.some((f) => f.follower_id === USERS.alice.id && f.followee_id === USERS.bob.id),
    ).toBeTruthy();
  });

  test('owner viewing their own listing sees the "This is your listing" card instead of Follow/Message', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    const listing = state.listings.find((l) => l.seller_id === USERS.alice.id && !l.is_sold)!;
    await page.goto(`/product/${listing.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('This is your listing')).toBeVisible();
    await expect(page.getByText('Follow', { exact: true })).toHaveCount(0);
  });

  test('Message CTA on a non-owned listing routes to /conversation/new', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    const listing = state.listings.find((l) => l.seller_id === USERS.bob.id && !l.is_sold)!;
    await page.goto(`/product/${listing.id}`);
    await waitForAppReady(page);
    await page.getByText('Message', { exact: true }).click();
    await page.waitForURL(/conversation\/new/);
    await expect(page.getByText(/New message|Make an offer/i)).toBeVisible();
  });
});
