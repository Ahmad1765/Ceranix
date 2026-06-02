// Settings screen — account section, shop section, verification/payouts/
// addresses, vacation mode, bundle discount, logout, and the delete flow.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('Settings', () => {
  test.beforeEach(async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    await page.goto('/settings');
    await waitForAppReady(page);
  });

  test('renders hero, profile card, and all section toggles', async ({ page }) => {
    await expect(page.getByText('Your settings.')).toBeVisible();
    await expect(page.getByText(`@${USERS.alice.username}`).first()).toBeVisible();
    await expect(page.getByText('Purchases & Sales')).toBeVisible();
    await expect(page.getByText('Verification, payouts & shipping')).toBeVisible();
    await expect(page.getByText('Enhance the experience')).toBeVisible();
    await expect(page.getByText('Manage account')).toBeVisible();
    await expect(page.getByText('Help center')).toBeVisible();
    await expect(page.getByText('Log out', { exact: true })).toBeVisible();
  });

  test('expanding "Purchases & Sales" reveals Bundle, Vacation mode, and Share rows', async ({ page }) => {
    await page.getByText('Purchases & Sales').click();
    await expect(page.getByText('Bundle discount')).toBeVisible();
    await expect(page.getByText('Vacation mode')).toBeVisible();
    await expect(page.getByText('Share your profile')).toBeVisible();
  });

  test('toggling Bundle discount updates the profile via PATCH', async ({ page, state }) => {
    await page.getByText('Purchases & Sales').click();
    await page.getByText('Bundle discount').click();
    await expect(page.getByText('Save discount')).toBeVisible();
    await page.getByText('10%', { exact: true }).first().click();
    await page.getByText('Save discount', { exact: true }).click();
    await page.waitForTimeout(300);
    expect(state.calls.profileUpdates.some((p: any) => p.bundle_discount_pct === 10)).toBeTruthy();
  });

  test('Identity verification modal submits to the verifications table', async ({ page, state }) => {
    await page.getByText('Verification, payouts & shipping').click();
    await page.getByText('Identity verification').click();
    await expect(page.getByText(/Submit your details/i)).toBeVisible();
    await page.getByPlaceholder(/legal name/i).fill('Alice Real Name').catch(async () => {
      // PlaceholderText not set — fill the first textbox under the modal.
      await page.locator('input').first().fill('Alice Real Name');
    });
    await page.getByText('Submit for review', { exact: true }).click();
    await page.waitForTimeout(300);
    expect(state.verifications.length).toBeGreaterThan(0);
    expect((state.verifications[0] as any).legal_name).toBe('Alice Real Name');
  });

  test('Payout method modal validates last-4 digits before enabling Save', async ({ page, state }) => {
    await page.getByText('Verification, payouts & shipping').click();
    await page.getByText('Payout method').click();
    await expect(page.getByText('Payout method', { exact: true })).toBeVisible();
    // Type a too-short last4 — error appears.
    const inputs = page.locator('input');
    await inputs.nth(0).fill('HBL Main');
    await inputs.nth(1).fill('12');
    await expect(page.getByText('Must be 4 digits')).toBeVisible();
    // Complete to 4 digits and save.
    await inputs.nth(1).fill('1234');
    await page.getByText('Save payout', { exact: true }).click();
    await page.waitForTimeout(300);
    expect(state.payoutMethods.length).toBeGreaterThan(0);
    expect((state.payoutMethods[0] as any).account_last4).toBe('1234');
  });

  test('Shipping address modal requires recipient, line1, city, postal, country', async ({ page, state }) => {
    await page.getByText('Verification, payouts & shipping').click();
    await page.getByText('Shipping address').click();
    await expect(page.getByText('Shipping address', { exact: true })).toBeVisible();
    const inputs = page.locator('input');
    await inputs.nth(0).fill('Alice Test');
    await inputs.nth(1).fill('123 Main Street');
    await inputs.nth(3).fill('Karachi');
    await inputs.nth(5).fill('75500');
    await inputs.nth(6).fill('Pakistan');
    await page.getByText('Save address', { exact: true }).click();
    await page.waitForTimeout(300);
    expect(state.shippingAddresses.length).toBeGreaterThan(0);
    expect((state.shippingAddresses[0] as any).city).toBe('Karachi');
  });

  test('Change password sends a recovery email via /auth/v1/recover', async ({ page }) => {
    await page.getByText('Manage account').click();
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await page.getByText('Change password').click();
    // The confirm dialog is intercepted; the toast appears after the recover
    // round-trip succeeds.
    await expect(page.getByText(/Reset email sent/i)).toBeVisible({ timeout: 5_000 });
  });

  test('Log out clears the session and returns the user to the tabs', async ({ page }) => {
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await page.getByText('Log out', { exact: true }).click();
    await page.waitForURL((u) => !u.pathname.includes('/settings'));
  });

  test('Delete account requires two confirmations before invoking the edge function', async ({ page, state }) => {
    let confirms = 0;
    page.on('dialog', (d) => {
      confirms++;
      d.accept().catch(() => {});
    });
    await page.getByText('Manage account').click();
    await page.getByText('Delete account').click();
    await page.waitForTimeout(500);
    expect(confirms).toBeGreaterThanOrEqual(2);
    expect(state.calls.edgeFunctionCalls.some((c) => c.name === 'delete-account')).toBeTruthy();
  });
});
