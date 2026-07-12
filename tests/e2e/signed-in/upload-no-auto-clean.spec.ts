// /upload — background removal (auto-clean) is a Wardrobe-only feature and must
// NOT run on the listing upload flow. This guards against it regressing back:
// after a photo is added the tile shows no Cleaning…/CLEANED/ORIGINAL control,
// and the picked photo is used exactly as-is.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';
import * as path from 'node:path';

test.describe('Upload has no auto-clean (signed in)', () => {
  test('added photo is used as-is with no cleaning UI', async ({ page }) => {
    // 1. Navigate to the upload tab (mirrors upload-listing.spec.ts).
    await page.goto('/upload');
    await waitForAppReady(page);
    await expect(page.getByText('Add photos')).toBeVisible({ timeout: 20_000 });

    // 2. Drive the hidden <input type="file"> that the web picker renders.
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 15_000 });
    await fileInput.setInputFiles(
      path.resolve(process.cwd(), 'tests/e2e/fixtures/portrait.jpg'),
    );

    // 3. The photo lands — the first tile gets the COVER badge — and Continue
    //    becomes available.
    await expect(page.getByText('COVER', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Continue', { exact: true })).toBeVisible();

    // 4. No background-removal control should ever surface on the upload flow.
    await expect(page.getByText(/Cleaning…|CLEANED|ORIGINAL/)).toHaveCount(0);
  });
});
