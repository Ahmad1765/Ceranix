// Web pull-to-refresh gesture. react-native-web's RefreshControl is inert, so
// we drive the gesture ourselves (components/WebRefresh.tsx) via DOM touch +
// wheel listeners on the real scroll node.
//
// Both the touch and wheel paths are AXIS-LOCKED: a horizontal-dominant gesture
// is left to nested horizontal scrollers (the image carousels in ListingCard),
// so the refresh never hijacks a carousel swipe. We assert that here on the
// wheel path (reliable to synthesize in headless desktop Chromium); the touch
// path shares the same direction-lock logic.

import { test, expect, waitForAppReady } from './helpers/page';

// Dispatches a wheel on the page's vertical scroller and reports whether the
// pull indicator is mounted. Re-dispatched on each poll tick so the feed has
// time to hydrate and the indicator (from the prior tick) is caught in its
// ~240ms decay window.
async function wheelProbe(page: import('@playwright/test').Page, deltaX: number, deltaY: number) {
  return page.evaluate(
    ({ deltaX, deltaY }) => {
      const scrollables = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => {
        const s = getComputedStyle(el);
        return s.overflowY === 'auto' || s.overflowY === 'scroll';
      });
      const el = scrollables.find((e) => e.scrollHeight > e.clientHeight) ?? scrollables[0];
      if (!el) return false;
      el.scrollTop = 0; // gesture only arms at the very top
      el.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true }));
      return document.querySelector('[data-testid="web-pull-indicator"]') != null;
    },
    { deltaX, deltaY },
  );
}

test.describe('Web pull-to-refresh', () => {
  test('vertical wheel-up at the top surfaces the pull indicator', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await expect
      .poll(() => wheelProbe(page, 0, -220), { timeout: 6000, intervals: [120, 120, 120, 120] })
      .toBeTruthy();
  });

  test('a horizontal-dominant wheel (carousel swipe) does NOT trigger refresh', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Warm the feed first: confirm the vertical gesture is wired on this scroller.
    await expect
      .poll(() => wheelProbe(page, 0, -220), { timeout: 6000, intervals: [120, 120, 120, 120] })
      .toBeTruthy();
    // Let the indicator decay, then drive a horizontal-dominant wheel repeatedly.
    await page.waitForTimeout(400);
    for (let i = 0; i < 5; i++) {
      await wheelProbe(page, -240, 0);
      await page.waitForTimeout(60);
    }
    await expect(page.getByTestId('web-pull-indicator')).toHaveCount(0);
  });
});
