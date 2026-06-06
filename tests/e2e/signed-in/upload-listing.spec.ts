// /upload — for a signed-in user, the photos step renders fully (not the
// RequireAuth gate). We do NOT continue to the publish step because the
// web image picker isn't testable headlessly and we don't want to insert
// real listings into the account.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Upload listing (signed in)', () => {
  test('photos step renders title, instruction card, and AI prefill toggle', async ({ page }) => {
    await page.goto('/upload');
    await waitForAppReady(page);
    await expect(page.getByText('Upload listing')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('What do you want to add?')).toBeVisible();
    await expect(page.getByText('Start by uploading photos')).toBeVisible();
    await expect(page.getByText('Help me prefill my ad')).toBeVisible();
    await expect(page.getByText('Continue', { exact: true })).toBeVisible();
  });
});
