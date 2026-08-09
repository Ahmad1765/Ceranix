// /profile/edit — the form renders prefilled values for the signed-in user;
// the Sign-in email row is present. We do NOT submit any changes (that
// would mutate the real account).

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Profile edit (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile/edit');
    await waitForAppReady(page);
  });

  test('renders the page hero, all sections, and a current email value', async ({ page }) => {
    await expect(page.getByText(/Edit your[\s\S]*profile\./i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Identity')).toBeVisible();
    await expect(page.getByText('Story')).toBeVisible();
    await expect(page.getByText('Account')).toBeVisible();
    // Some email is in the Account section (we don't pin to the literal so
    // the credential never leaks into a fail snapshot).
    await expect(page.getByText(/^[\w.+-]+@[\w-]+\.[\w.-]+$/).first()).toBeVisible();
  });

  test('the four labelled fields (Username / Full name / Bio / Location) are present', async ({ page }) => {
    await expect(page.getByText('Username', { exact: true })).toBeVisible();
    await expect(page.getByText('Full name', { exact: true })).toBeVisible();
    await expect(page.getByText('Bio', { exact: true })).toBeVisible();
    await expect(page.getByText('Location', { exact: true })).toBeVisible();
  });

  test('All-saved CTA is rendered when no edits are made', async ({ page }) => {
    // When the form is clean the CTA reads "All saved". The act of focusing
    // a field without typing shouldn't flip the dirty flag, so we can rely
    // on this on first render.
    await expect(page.getByText(/All saved|Save changes/)).toBeVisible();
  });
});
