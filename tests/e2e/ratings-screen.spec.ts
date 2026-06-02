// Ratings screen (/ratings) — overall score card, achievement tiles, and
// the "No sales yet" callout when total_sales is 0.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('Ratings', () => {
  test('signed-in seller with sales sees the score and unlocked achievement', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    await page.goto('/ratings');
    await waitForAppReady(page);
    await expect(page.getByText('OVERALL RATING')).toBeVisible();
    await expect(page.getByText(USERS.alice.rating.toFixed(1))).toBeVisible();
    // Alice has 12 sales — Verified buyer unlocks at 4.5 rating (she has 4.7).
    await expect(page.getByText('Verified by buyers')).toBeVisible();
    await expect(page.getByText('UNLOCKED').first()).toBeVisible();
    // "Featured seller" requires 25 sales — she has 12, so it stays locked.
    await expect(page.getByText('Featured seller')).toBeVisible();
  });

  test('seller with zero sales sees the empty-sales callout', async ({ page, state }) => {
    state.profiles.find((p) => p.id === USERS.alice.id)!.total_sales = 0;
    state.profiles.find((p) => p.id === USERS.alice.id)!.rating = 0;
    await signInAs(page, state, 'alice');
    await page.goto('/ratings');
    await waitForAppReady(page);
    await expect(page.getByText('No sales yet — ratings appear after your first completed transaction.')).toBeVisible();
  });
});
