// Auth modal — welcome step → form step (signin/signup), validation,
// real password sign-in against the mocked /auth/v1/token endpoint, and
// "Continue as guest" exit path.

import { test, expect, waitForAppReady } from './helpers/page';
import { USERS } from './helpers/fixtures';

test.describe('Auth modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await waitForAppReady(page);
  });

  test('welcome step shows brand, hero copy, and three CTAs', async ({ page }) => {
    await expect(page.getByText('Ceranix').first()).toBeVisible();
    await expect(page.getByText(/Your story[\s\S]*starts now\./i)).toBeVisible();
    await expect(page.getByText('Continue as guest')).toBeVisible();
    await expect(page.getByText('Sign up with email')).toBeVisible();
    await expect(page.getByText('Log in', { exact: true })).toBeVisible();
  });

  test('Continue as guest dismisses and lands on the tabs feed', async ({ page }) => {
    await page.getByText('Continue as guest').click();
    await page.waitForURL((u) => !u.pathname.includes('/auth/login'));
    await expect(page.getByText('What are you looking for today?')).toBeVisible();
  });

  test('Log in step renders the form with email + password fields', async ({ page }) => {
    await page.getByText('Log in', { exact: true }).click();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('At least 6 characters')).toBeVisible();
    await expect(page.getByText('Sign in', { exact: true })).toBeVisible();
  });

  test.describe('Sign in', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByText('Log in', { exact: true }).click();
    });

    test('rejects an invalid email shape with an alert', async ({ page }) => {
      page.once('dialog', (d) => {
        expect(d.message()).toMatch(/valid email/i);
        d.accept().catch(() => {});
      });
      await page.getByPlaceholder('you@example.com').fill('not-an-email');
      await page.getByPlaceholder('At least 6 characters').fill('hunter22');
      await page.getByText('Sign in', { exact: true }).click();
    });

    test('rejects a password shorter than 6 characters', async ({ page }) => {
      page.once('dialog', (d) => {
        expect(d.message()).toMatch(/Password must be at least 6 characters/i);
        d.accept().catch(() => {});
      });
      await page.getByPlaceholder('you@example.com').fill('alice@example.test');
      await page.getByPlaceholder('At least 6 characters').fill('123');
      await page.getByText('Sign in', { exact: true }).click();
    });

    test('signs the user in and redirects to the tabs', async ({ page }) => {
      await page.getByPlaceholder('you@example.com').fill(USERS.alice.email);
      await page.getByPlaceholder('At least 6 characters').fill('hunter22');
      await page.getByText('Sign in', { exact: true }).click();
      await page.waitForURL((u) => !u.pathname.includes('/auth/login'));
      await expect(page.getByText('What are you looking for today?')).toBeVisible();
    });

    test('surfaces a backend "Invalid login credentials" error in an alert', async ({ page }) => {
      page.once('dialog', (d) => {
        expect(d.message()).toMatch(/Invalid login credentials/i);
        d.accept().catch(() => {});
      });
      await page.getByPlaceholder('you@example.com').fill('does-not-exist@example.test');
      await page.getByPlaceholder('At least 6 characters').fill('hunter22');
      await page.getByText('Sign in', { exact: true }).click();
    });
  });

  test.describe('Sign up', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByText('Sign up with email').click();
    });

    test('creates a new account and routes to profile onboarding', async ({ page }) => {
      await page.getByPlaceholder('you@example.com').fill('fresh@example.test');
      await page.getByPlaceholder('At least 6 characters').fill('hunter22');
      await page.getByText('Create account', { exact: true }).click();
      await page.waitForURL(/profile\/edit/);
      await expect(page.getByText(/Set up[\s\S]*your profile\./i)).toBeVisible();
    });

    test('shows an alert if the email is already registered', async ({ page }) => {
      page.once('dialog', (d) => {
        expect(d.message()).toMatch(/already registered/i);
        d.accept().catch(() => {});
      });
      await page.getByPlaceholder('you@example.com').fill(USERS.alice.email);
      await page.getByPlaceholder('At least 6 characters').fill('hunter22');
      await page.getByText('Create account', { exact: true }).click();
    });
  });

  test('Back arrow on the form step returns to the welcome step', async ({ page }) => {
    await page.getByText('Log in', { exact: true }).click();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    // The back arrow is the only icon button on the form step's top bar.
    await page.locator('[role="button"]').first().click();
    await expect(page.getByText('Continue as guest')).toBeVisible();
  });
});
