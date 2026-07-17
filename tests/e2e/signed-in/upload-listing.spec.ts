// /upload — for a signed-in user, the photos step renders fully (not the
// RequireAuth gate). We do NOT continue to the publish step because the
// web image picker isn't testable headlessly and we don't want to insert
// real listings into the account.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Upload listing (signed in)', () => {
  // The photos step was rewritten: it's headed "Add photos" (not "Upload
  // listing"), and the "Help me prefill my ad" AI toggle no longer exists on
  // this step. This spec asserted all of that old copy and had been red since.
  test('photos step renders the heading, tips card, and step affordances', async ({ page }) => {
    await page.goto('/upload');
    await waitForAppReady(page);
    await expect(page.getByText('Add photos')).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/Clear, well-lit photos sell faster/i),
    ).toBeVisible();
    await expect(page.getByText('TIPS FOR FAST SALES')).toBeVisible();
    // Empty state: the picker offers a cover slot and Continue is gated.
    await expect(page.getByText('Add cover', { exact: true })).toBeVisible();
    await expect(page.getByText('STEP 1 OF 2')).toBeVisible();
    await expect(page.getByText('Add at least one photo')).toBeVisible();
    await expect(page.getByText('Continue', { exact: true })).toBeVisible();
  });
});
