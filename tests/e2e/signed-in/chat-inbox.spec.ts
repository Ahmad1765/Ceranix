// /(tabs)/chat — inbox renders the Inbox header, the three pill tabs, and
// either a conversation list or the "It's quiet here" empty state. We do
// NOT send any messages.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Inbox (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForAppReady(page);
  });

  // The inbox is Selling / Buying / Activity / Support (see INBOX_TABS in
  // app/(tabs)/chat.tsx). There is no "All" tab — this spec was written against
  // an older three-pill layout. "Activity" replaced a dead "Social" placeholder
  // and is now the only entry point to the activity feed, so its presence here
  // is load-bearing, not cosmetic.
  test('renders the Inbox header and the four pill tabs', async ({ page }) => {
    await expect(page.getByText('Inbox', { exact: true })).toBeVisible({ timeout: 20_000 });
    for (const label of ['Selling', 'Buying', 'Activity', 'Support']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('the Activity tab reaches the saved-search feed', async ({ page }) => {
    await page.getByText('Activity', { exact: true }).click();
    // The feed's own pill tabs are the stable landmark — the panes underneath
    // are either empty states or live saved searches depending on the account.
    await expect(page.getByText('Following', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('For you', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  });

  test('the default tab hydrates its content area', async ({ page }) => {
    // Either at least one timestamp ("now", "5m", "1h", "3d" …) for a real
    // conversation OR the empty state. Both confirm the FlatList hydrated.
    await expect(
      page.locator('text=/^now$|^\\d+[mhd]$|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{1,2}$|It\'s quiet here/').first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('Buying tab is reachable', async ({ page }) => {
    await page.getByText('Buying', { exact: true }).click();
    await expect(
      page.locator('text=/^now$|^\\d+[mhd]$|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{1,2}$|No conversations yet|It\'s quiet here/').first(),
    ).toBeVisible();
  });

  test('Selling tab is reachable', async ({ page }) => {
    await page.getByText('Selling', { exact: true }).click();
    await expect(
      page.locator('text=/^now$|^\\d+[mhd]$|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{1,2}$|No buyer chats yet|It\'s quiet here/').first(),
    ).toBeVisible();
  });
});
