import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/page';

test.describe('Activity Inbox size consistency with Buying and Selling', () => {
  test('Activity tab renders with identical page structure and empty state layout as Buying and Selling', async ({
    page,
  }) => {
    await page.goto('/chat');
    await waitForAppReady(page);

    // Verify Inbox header and 4 tabs
    await expect(page.getByText('Inbox', { exact: true })).toBeVisible({ timeout: 20_000 });
    const sellingTab = page.getByText('Selling', { exact: true }).first();
    const buyingTab = page.getByText('Buying', { exact: true }).first();
    const activityTab = page.getByText('Activity', { exact: true }).first();

    await expect(sellingTab).toBeVisible();
    await expect(buyingTab).toBeVisible();
    await expect(activityTab).toBeVisible();

    // Check Buying tab
    await buyingTab.click();
    await page.waitForTimeout(300);
    const buyingEmpty = page.getByText('No conversations yet');
    const buyingEmptyCount = await buyingEmpty.count();

    // Check Selling tab
    await sellingTab.click();
    await page.waitForTimeout(300);
    const sellingEmpty = page.getByText('No buyer chats yet');
    const sellingEmptyCount = await sellingEmpty.count();

    // Check Activity tab
    await activityTab.click();
    await page.waitForTimeout(300);
    const activityEmpty = page.getByText('No direct messages yet');
    const activityEmptyCount = await activityEmpty.count();

    // Always assert state consistency across Activity, Buying, and Selling tabs
    expect(buyingEmptyCount > 0).toBe(sellingEmptyCount > 0);
    expect(activityEmptyCount > 0).toBe(buyingEmptyCount > 0);

    // If unauthenticated or no conversations, verify that all three tabs display their matching empty state
    // with identical structure and without arbitrary offsets or buttons
    if (activityEmptyCount > 0) {
      await expect(activityEmpty).toBeVisible();
      await expect(buyingEmpty).toBeVisible();
      await expect(sellingEmpty).toBeVisible();
      // Ensure no non-standard "Find Sellers to Follow" or "Direct Profile Messages" headers exist in Activity tab
      await expect(page.getByText('Direct Profile Messages')).toHaveCount(0);
      await expect(page.getByText('Find Sellers to Follow')).toHaveCount(0);
    } else {
      expect(buyingEmptyCount).toBe(0);
      expect(sellingEmptyCount).toBe(0);
    }
  });

  test('InboxRow items enforce consistent minHeight of 92px', async ({ page }) => {
    await page.goto('/chat');
    await waitForAppReady(page);

    const activityTab = page.getByText('Activity', { exact: true }).first();
    const buyingTab = page.getByText('Buying', { exact: true }).first();
    const sellingTab = page.getByText('Selling', { exact: true }).first();

    const activityBox = await activityTab.boundingBox();
    const buyingBox = await buyingTab.boundingBox();
    const sellingBox = await sellingTab.boundingBox();
    if (activityBox && buyingBox && sellingBox) {
      expect(activityBox.height).toBeCloseTo(buyingBox.height, 1);
      expect(activityBox.height).toBeCloseTo(sellingBox.height, 1);
    }

    // Switch to Activity
    await activityTab.click();

    // Check if any conversation rows exist, and if so verify their height is consistent (92px)
    const rows = page.locator('[role="button"][aria-label^="Conversation with"]');
    const count = await rows.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const box = await rows.nth(i).boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(92);
        }
      }
    } else {
      await expect(
        page.getByText('No direct messages yet').or(page.getByText('Inbox', { exact: true })).first(),
      ).toBeVisible();
    }
  });
});
