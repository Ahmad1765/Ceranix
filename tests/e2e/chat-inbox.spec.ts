// Inbox tab — signed-out empty state, signed-in conversation list, and
// All / Buying / Selling filter pills.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('Inbox', () => {
  test('signed-out user sees the "Sign in to chat" empty state', async ({ page }) => {
    await page.goto('/chat');
    await waitForAppReady(page);
    await expect(page.getByText('Sign in to chat')).toBeVisible();
    await expect(page.getByText('Sign in', { exact: true })).toBeVisible();
  });

  test.describe('Signed-in user', () => {
    test.beforeEach(async ({ page, state }) => {
      await signInAs(page, state, 'alice');
      await page.goto('/chat');
      await waitForAppReady(page);
    });

    test('shows the Inbox header and pill tabs (All / Buying / Selling)', async ({ page }) => {
      await expect(page.getByText('Inbox', { exact: true })).toBeVisible();
      await expect(page.getByText('All', { exact: true })).toBeVisible();
      await expect(page.getByText('Buying', { exact: true })).toBeVisible();
      await expect(page.getByText('Selling', { exact: true })).toBeVisible();
    });

    test('lists the seeded conversation with its preview, listing title, and timestamp', async ({ page, state }) => {
      const conv = state.conversations[0];
      const listing = state.listings.find((l) => l.id === conv.listing_id)!;
      await expect(page.getByText(listing.title).first()).toBeVisible();
      await expect(page.getByText(conv.last_message!)).toBeVisible();
    });

    test('Buying pill filters to conversations where the user is the buyer', async ({ page, state }) => {
      await page.getByText('Buying', { exact: true }).click();
      const buying = state.conversations.filter((c) => c.buyer_id === USERS.alice.id);
      for (const c of buying) {
        const listing = state.listings.find((l) => l.id === c.listing_id)!;
        await expect(page.getByText(listing.title).first()).toBeVisible();
      }
    });

    test('Selling pill filters to conversations where the user is the seller', async ({ page, state }) => {
      await page.getByText('Selling', { exact: true }).click();
      const selling = state.conversations.filter((c) => c.seller_id === USERS.alice.id);
      if (selling.length === 0) {
        await expect(page.getByText('No buyer chats yet')).toBeVisible();
      } else {
        for (const c of selling) {
          const listing = state.listings.find((l) => l.id === c.listing_id)!;
          await expect(page.getByText(listing.title).first()).toBeVisible();
        }
      }
    });

    test('clicking a conversation row routes to /conversation/[id]', async ({ page, state }) => {
      const conv = state.conversations[0];
      const listing = state.listings.find((l) => l.id === conv.listing_id)!;
      await page.getByText(listing.title).first().click();
      await page.waitForURL(`**/conversation/${conv.id}`);
    });

    test('an empty inbox shows the "It\'s quiet here" empty state', async ({ page, state }) => {
      state.conversations = [];
      state.messages = [];
      await page.reload();
      await waitForAppReady(page);
      await expect(page.getByText("It's quiet here")).toBeVisible();
    });
  });
});
