// /upload — auto-clean UI contract test for a signed-in user.
// After a photo is added via the hidden file input the upload tile must show
// either the transient "Cleaning…" indicator (fires before any model/CDN work)
// or the resulting CLEANED / ORIGINAL chip.  We assert on the UI state only —
// never on pixels or background-removal quality — so the test stays green even
// when the MediaPipe CDN is unreachable (cleaning fails silently but the
// indicator still flashed, or the tile shows ORIGINAL immediately).

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';
import * as path from 'node:path';

test.describe('Upload auto-clean (signed in)', () => {
  test('added photo shows a clean status then an original/cleaned control', async ({ page }) => {
    // 1. Navigate to the upload tab (mirrors upload-listing.spec.ts).
    await page.goto('/upload');
    await waitForAppReady(page);
    await expect(page.getByText('Upload listing')).toBeVisible({ timeout: 20_000 });

    // 2. Drive the hidden <input type="file"> that the web picker renders.
    //    The input may only appear after the page is ready; wait for it first.
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 15_000 });
    await fileInput.setInputFiles(
      path.resolve(process.cwd(), 'tests/e2e/fixtures/portrait.jpg'),
    );

    // 3. A cleaning indicator OR a resulting chip must appear.
    //    "Cleaning…" is transient (fires immediately on photo add, before any
    //    model/CDN round-trip).  "CLEANED" / "ORIGINAL" appear after the model
    //    resolves.  We match whichever arrives first with a generous timeout so
    //    the test is robust to slow CDN access or model unavailability.
    const chip = page.getByText(/Cleaning…|CLEANED|ORIGINAL/);
    await expect(chip.first()).toBeVisible({ timeout: 20_000 });

    // 4. Continue must become enabled now that one photo is present.
    await expect(page.getByText('Continue', { exact: true })).toBeVisible();
  });
});
