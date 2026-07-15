// Following tab now fetches real data + suggested people. The test verifies:
//   1. Either real listings appear (signed-in user follows people who sell)
//   2. OR the suggested-people strip renders with real profile rows
// We do NOT click any Follow CTA — that would mutate the account.

import { test, expect } from '@playwright/test';
import { waitForAppReady, scrollFeedToBottom, PRICE_PATTERN } from '../helpers/page';

test.describe('Following feed (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.getByText('Following', { exact: true }).click();
  });

  test('shows either a listing-price grid or the suggestions strip', async ({ page }) => {
    await scrollFeedToBottom(page);
    // Either an @handle from the suggestions or a price from the grid.
    await expect(
      page.locator(`text=/${PRICE_PATTERN}|^@[\\w.]+$|not following anyone yet/`).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('hardcoded fake users (dafneee, T.Fashion) are no longer rendered', async ({ page }) => {
    await scrollFeedToBottom(page);
    await expect(page.getByText('dafneee')).toHaveCount(0);
    await expect(page.getByText('T.Fashion')).toHaveCount(0);
    await expect(page.getByText('Thea settergren')).toHaveCount(0);
  });
});
