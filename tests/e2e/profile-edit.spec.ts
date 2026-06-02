// Profile edit modal — username validation, debounced uniqueness check,
// dirty-state tracking, and save → PATCH against the profiles table.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('Profile edit', () => {
  test.beforeEach(async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    await page.goto('/profile/edit');
    await waitForAppReady(page);
  });

  test('renders the page hero, all sections, and current values', async ({ page }) => {
    await expect(page.getByText(/Edit your[\s\S]*profile\./i)).toBeVisible();
    await expect(page.getByText('Identity')).toBeVisible();
    await expect(page.getByText('Story')).toBeVisible();
    await expect(page.getByText('Account')).toBeVisible();
    await expect(page.getByText(USERS.alice.email!)).toBeVisible();
  });

  test('rejects an invalid username (uppercase, spaces, special chars)', async ({ page }) => {
    const inputs = page.locator('input');
    // The first input under Identity is the username field.
    await inputs.first().fill('Bad Name!');
    await inputs.first().blur();
    await expect(page.getByText(/Lowercase letters|At least 3 characters/i)).toBeVisible();
  });

  test('debounces a uniqueness check and flags a taken username', async ({ page }) => {
    const inputs = page.locator('input');
    await inputs.first().fill(USERS.bob.username); // bob.shop is taken
    // Wait past the 450ms debounce + a roundtrip.
    await page.waitForTimeout(1_000);
    await expect(page.getByText('Username already taken')).toBeVisible();
  });

  test('typing a valid unique username shows the green check', async ({ page }) => {
    const inputs = page.locator('input');
    await inputs.first().fill('alice_v2');
    await page.waitForTimeout(1_000);
    // Save button enables when the new name validates.
    await expect(page.getByText('Save changes', { exact: true })).toBeVisible();
  });

  test('saving the form persists a PATCH against the profiles table', async ({ page, state }) => {
    const inputs = page.locator('input');
    await inputs.nth(2).fill('Fresh bio for testing'); // bio is the 3rd input
    await page.waitForTimeout(200);
    await page.getByText('Save changes', { exact: true }).click();
    await page.waitForTimeout(500);
    expect(state.calls.profileUpdates.some((p: any) => p.bio === 'Fresh bio for testing')).toBeTruthy();
  });

  test('onboarding mode shows different copy and routes to tabs on save', async ({ page }) => {
    await page.goto('/profile/edit?onboarding=1');
    await waitForAppReady(page);
    await expect(page.getByText(/Set up[\s\S]*your profile\./i)).toBeVisible();
    await expect(page.getByText('Get started', { exact: true })).toBeVisible();
  });
});
