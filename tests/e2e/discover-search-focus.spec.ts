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
});
