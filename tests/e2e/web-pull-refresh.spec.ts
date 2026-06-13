// Web pull-to-refresh gesture. react-native-web's RefreshControl is inert, so
// we drive the gesture ourselves (components/WebRefresh.tsx) via DOM touch +
// wheel listeners on the real scroll node. This proves the gesture is wired:
// a wheel-up at the top of the feed surfaces the pull indicator.
//
// Why polling: the wheel handler sets pull state (async React render) and the
// indicator decays ~240ms after the last wheel. We re-dispatch a wheel each
// poll tick (every 100ms) and check for the indicator from the prior tick,
// which is still mounted inside that 240ms window.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('Web pull-to-refresh', () => {
  test('wheel-up at the top of the home feed surfaces the pull indicator', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const scrollables = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
              (el) => {
                const s = getComputedStyle(el);
                return s.overflowY === 'auto' || s.overflowY === 'scroll';
              },
            );
            // Prefer a vertical scroller that actually has content; fall back to
            // the first vertical scroller (an empty feed still renders one).
            const el =
              scrollables.find((e) => e.scrollHeight > e.clientHeight) ?? scrollables[0];
            if (!el) return false;
            el.scrollTop = 0; // gesture only arms at the very top
            el.dispatchEvent(
              new WheelEvent('wheel', { deltaY: -220, bubbles: true, cancelable: true }),
            );
            return document.querySelector('[data-testid="web-pull-indicator"]') != null;
          }),
        { timeout: 6000, intervals: [120, 120, 120, 120] },
      )
      .toBeTruthy();
  });
});
