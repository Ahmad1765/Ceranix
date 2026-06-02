// Common boot helpers. Every spec starts from a fresh mocked state and a
// blank storage so tests are independent and idempotent.

import { test as base, expect, type Page } from '@playwright/test';
import { freshState, installSupabaseMock, type MockState } from './supabase-mock';

type Fixtures = {
  state: MockState;
};

export const test = base.extend<Fixtures>({
  state: async ({ page }, use) => {
    const state = freshState();
    await installSupabaseMock(page, state);
    // Silence noisy expected console warnings from the app's wedge guards
    // — they fire when our mocks intentionally return errors during a
    // negative test, but are harmless.
    page.on('pageerror', (e) => console.warn('[pageerror]', e.message));
    await use(state);
  },
});

export { expect };

// Wait for the Expo Router app to mount. The font loader can take a moment
// before `setReady(true)` flips and the tree renders; we wait for any of the
// well-known top-level texts so each spec can rely on the UI being live
// before driving it.
export async function waitForAppReady(page: Page, options: { timeout?: number } = {}) {
  const timeout = options.timeout ?? 20_000;
  // Splash hides once fonts/assets load. We assert on any of the headline
  // strings rendered by the root tabs or auth modal.
  const anyMounted = page.locator(
    'text=/What are you looking for today\\?|Your story|Ceranix|Discover|My Feed|Inbox/i',
  );
  await anyMounted.first().waitFor({ timeout });
}

export async function gotoRoute(page: Page, route: string) {
  await page.goto(route);
  await waitForAppReady(page);
}

// Click an element by accessible text. Works across both `<div role="button">`
// (react-native-web Pressable) and plain native buttons.
export async function tapText(page: Page, text: string | RegExp) {
  const target = page.getByText(text, { exact: false }).first();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
}
