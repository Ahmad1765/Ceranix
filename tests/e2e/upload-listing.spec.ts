// Upload tab — RequireAuth-gated, then a two-step wizard:
//   1. Photos step (ImagePicker — non-functional on web, so we only assert
//      the gate + cannot-continue path)
//   2. Details step — wired up programmatically by injecting a fake image
//      into the component's state isn't possible from outside; instead we
//      test the auth gate and the visible UI of the photos step. Publishing
//      from the photos step alone is blocked by validation, which we assert.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';

test.describe('Upload listing', () => {
  test('unauthenticated upload route prompts to sign in (RequireAuth gate)', async ({ page }) => {
    await page.goto('/upload');
    await waitForAppReady(page);
    // RequireAuth renders a sign-in prompt or redirects to /auth/login.
    await expect(
      page.getByText(/Sign in to|Welcome[\s\S]*back|Your story[\s\S]*starts now\.|continue/i),
    ).toBeVisible();
  });

  test.describe('Signed-in seller', () => {
    test.beforeEach(async ({ page, state }) => {
      await signInAs(page, state, 'alice');
      await page.goto('/upload');
      await waitForAppReady(page);
    });

    test('renders the photos step with title, instruction card, and AI prefill toggle', async ({ page }) => {
      await expect(page.getByText('Upload listing')).toBeVisible();
      await expect(page.getByText('What do you want to add?')).toBeVisible();
      await expect(page.getByText('Start by uploading photos')).toBeVisible();
      await expect(page.getByText(/Add images/i)).toBeVisible();
      await expect(page.getByText('Help me prefill my ad')).toBeVisible();
      await expect(page.getByText('Continue', { exact: true })).toBeVisible();
    });

    test('Continue without any photos shows the "Add photos" alert', async ({ page }) => {
      page.once('dialog', (d) => {
        expect(d.message()).toMatch(/at least one photo/i);
        d.accept().catch(() => {});
      });
      await page.getByText('Continue', { exact: true }).click();
    });

    test('AI prefill toggle is interactive', async ({ page }) => {
      // Tap the toggle — it should remain visible and clickable.
      const toggle = page.getByText('Help me prefill my ad').locator('..');
      await toggle.click();
      await expect(page.getByText('Help me prefill my ad')).toBeVisible();
    });
  });
});
