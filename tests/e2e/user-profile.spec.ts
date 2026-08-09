// Unknown user profile renders the not-found empty state.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('Other user profile', () => {
  test('unknown user id shows the "User not found" empty state', async ({ page }) => {
    await page.goto('/user/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('User not found')).toBeVisible({ timeout: 20_000 });
  });
});
