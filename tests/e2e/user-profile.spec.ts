// Other-user profile (/user/[id]) — shows the seller's listings, follow
// toggle (optimistic + RPC-confirmed), and counts.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('Other user profile', () => {
  test('renders the profile, listings, and Follow CTA for a visitor', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    await page.goto(`/user/${USERS.bob.id}`);
    await waitForAppReady(page);
    await expect(page.getByText(USERS.bob.full_name)).toBeVisible();
    await expect(page.getByText(`@${USERS.bob.username}`).first()).toBeVisible();
    const bobs = state.listings.filter((l) => l.seller_id === USERS.bob.id && !l.is_sold);
    for (const l of bobs) {
      await expect(page.getByText(l.title).first()).toBeVisible();
    }
    await expect(page.getByText('Follow', { exact: true })).toBeVisible();
  });

  test('Follow / Unfollow flips the button and increments the follower count', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    const before = state.profiles.find((p) => p.id === USERS.bob.id)!.followers_count ?? 0;
    await page.goto(`/user/${USERS.bob.id}`);
    await waitForAppReady(page);
    await page.getByText('Follow', { exact: true }).click();
    await expect(page.getByText('Following', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    expect(state.profiles.find((p) => p.id === USERS.bob.id)!.followers_count).toBeGreaterThan(before);
    // Unfollow.
    await page.getByText('Following', { exact: true }).click();
    await expect(page.getByText('Follow', { exact: true })).toBeVisible();
  });

  test('unknown user id shows the "User not found" empty state', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    await page.goto('/user/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('User not found')).toBeVisible();
  });
});
