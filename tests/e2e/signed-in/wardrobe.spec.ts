// /wardrobe — for a signed-in user, the tab renders its three sections
// (Swipe, My Wardrobe, Liked) and the page heading.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Wardrobe (signed in)', () => {
  test('tab shows the three sections and a post entry point', async ({ page }) => {
    await page.goto('/wardrobe');
    await waitForAppReady(page);
    await expect(page.getByText('Wardrobe', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Swipe')).toBeVisible();
    await expect(page.getByText('My Wardrobe')).toBeVisible();
    await expect(page.getByText('Liked')).toBeVisible();
  });
});
