// Tapping the search tab must leave focus in a text field straight away.
//
// This is a soft-keyboard guard. Mobile browsers only raise the on-screen
// keyboard for a focus() that runs inside the tap's own task, while the page
// still holds user activation. The sheet's search field previously took focus
// ~450ms later (useSheetSearchFocus's backstop), by which point the activation
// was spent — the caret appeared but the keyboard never did.
//
// A headless browser has no soft keyboard to assert on, so what's pinned here
// is the mechanism that governs it: focus is in an <input> immediately after
// the press, never parked on the tab button.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/page';

test.describe('Discover search focus', () => {
  test('the search field is focused immediately after tapping the tab', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /discover|search/i }).first().click();

    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? 'none');
    expect(activeTag).toBe('INPUT');
  });

  // The sheet's three sort chips (New / Trending / Lowest price) apply to the
  // feed underneath. They used to push /discover — a screen the tab bar can't
  // reach, since the Discover tab opens this sheet instead — so the guard is
  // that picking one leaves us on the feed with the sort applied.
  test('a Browse sort chip sorts the feed instead of opening Discover', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /discover|search/i }).first().click();
    await page.getByRole('button', { name: 'Browse lowest price' }).click();

    await expect(page).toHaveURL(/[?&]sort=price_asc/);
    // Discover's own search field would be on screen if we'd navigated there.
    await expect(page.getByPlaceholder('Search aesthetics')).toHaveCount(0);
  });

  // Same contract for the Topics grid — a tile is a filter on the feed, not a
  // trip to Discover.
  test('a Topics tile filters the feed instead of opening Discover', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /discover|search/i }).first().click();
    await page.getByRole('button', { name: 'Browse Shoes' }).click();

    await expect(page).toHaveURL(/[?&]category=shoes/);
    await expect(page.getByPlaceholder('Search aesthetics')).toHaveCount(0);
  });
});
