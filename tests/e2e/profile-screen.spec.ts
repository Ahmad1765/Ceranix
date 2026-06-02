// Own profile tab — RequireAuth gated, then renders avatar, stats, four tabs
// (Selling / Liked / Shop / Saved), and CTAs.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('Profile tab', () => {
  test('redirects unauthenticated users to the auth flow', async ({ page }) => {
    await page.goto('/profile');
    await waitForAppReady(page);
    await expect(
      page.getByText(/Continue as guest|Your story[\s\S]*starts now\.|Sign in/i),
    ).toBeVisible();
  });

  test.describe('Signed-in user', () => {
    test.beforeEach(async ({ page, state }) => {
      await signInAs(page, state, 'alice');
      await page.goto('/profile');
      await waitForAppReady(page);
    });

    test('renders the @handle, bio, location, and follower stats', async ({ page }) => {
      await expect(page.getByText(`@${USERS.alice.username}`).first()).toBeVisible();
      await expect(page.getByText('Sustainable closet, well-loved finds.')).toBeVisible();
      await expect(page.getByText('Karachi')).toBeVisible();
      await expect(page.getByText('Posts', { exact: true })).toBeVisible();
      await expect(page.getByText('Followers', { exact: true })).toBeVisible();
      await expect(page.getByText('Following', { exact: true })).toBeVisible();
    });

    test('Selling tab shows the user\'s own listings', async ({ page, state }) => {
      const mine = state.listings.filter((l) => l.seller_id === USERS.alice.id);
      for (const l of mine) {
        await expect(page.getByText(l.title).first()).toBeVisible();
      }
    });

    test('Liked tab shows the empty state when nothing is liked', async ({ page }) => {
      await page.getByText('Liked', { exact: true }).click();
      await expect(page.getByText('Nothing liked yet')).toBeVisible();
    });

    test('Shop tab lists shop settings rows', async ({ page }) => {
      await page.getByText('Shop', { exact: true }).click();
      await expect(page.getByText('My shop')).toBeVisible();
      await expect(page.getByText('Bundle discount')).toBeVisible();
      await expect(page.getByText('Vacation mode')).toBeVisible();
      await expect(page.getByText('Share your profile')).toBeVisible();
    });

    test('Saved tab shows the "No saved boards" empty state', async ({ page }) => {
      await page.getByText('Saved', { exact: true }).click();
      await expect(page.getByText('No saved boards yet')).toBeVisible();
    });

    test('Edit profile button routes to the edit modal', async ({ page }) => {
      await page.getByText('Edit profile', { exact: true }).click();
      await page.waitForURL(/profile\/edit/);
      await expect(page.getByText(/Edit your[\s\S]*profile\./i)).toBeVisible();
    });
  });
});
