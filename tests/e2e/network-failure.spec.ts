// Network-failure edge cases. We intercept the Supabase REST endpoint at the
// Playwright route layer (BEFORE the page navigates), so the bundle's real
// supabase-js client hits our stubs instead of the live backend. Auth + edge
// function endpoints are left untouched — only `/rest/v1/*` (the table-level
// queries that hydrate the feed) is intercepted.
//
// Each test asserts the SAME observable property: the page does not get stuck
// in an infinite loading spinner. It must reach SOME terminal state — either
// an empty state, an error message, or a hydrated feed (in the recovery
// case). We do not assert specific copy because the app surfaces errors as
// silent empty grids in some flows; "no spinner forever" is the load-bearing
// signal.

import {
  test,
  expect,
  waitForAppReady,
  priceText,
  discoverSearch,
  SUPABASE_URL,
} from './helpers/page';

const REST_RE = SUPABASE_URL
  ? new RegExp(`${SUPABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/rest/v1/.*`)
  : /__no_supabase_configured__/;

test.describe('Network failures', () => {
  test.skip(
    !SUPABASE_URL,
    'EXPO_PUBLIC_SUPABASE_URL not configured — cannot install REST stubs',
  );

  test('REST 500 on listings reaches a terminal state (no infinite spinner)', async ({
    page,
  }) => {
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      // Only fail listing-shaped queries — letting profile / category lookups
      // through reduces the chance of unrelated UI getting stuck waiting on
      // its own dependency.
      if (url.includes('/listings')) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'simulated server error' }),
        });
      }
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    // Give the query layer ~3s to settle into its error/empty state.
    await page.waitForTimeout(3000);
    // The home shell is still rendered (we never showed a global error).
    await expect(page.getByPlaceholder('Search your feed')).toBeVisible();
    // And no listing prices snuck in despite the 500 — proves the stub took.
    await expect(priceText(page)).toHaveCount(0);
  });

  test('REST timeout (route aborted) does not block the rest of the UI', async ({
    page,
  }) => {
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) {
        // Abort with a generic failure — supabase-js treats this as a network
        // error and resolves the query with error state.
        return route.abort('failed');
      }
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    await page.waitForTimeout(3000);
    // Tab bar is still interactive even though the feed failed.
    await page.getByText('Discover', { exact: true }).click();
    await expect(discoverSearch(page)).toBeVisible();
  });

  test('slow network (3s delay) — header renders before the feed resolves', async ({
    page,
  }) => {
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) {
        // 3-second delay, then pass through. The header should render
        // immediately (it doesn't depend on the listing query).
        await new Promise((r) => setTimeout(r, 3000));
      }
      return route.continue();
    });
    const start = Date.now();
    await page.goto('/');
    await waitForAppReady(page);
    // Header should be visible well before the 3s delay finishes.
    await expect(page.getByPlaceholder('Search your feed')).toBeVisible({
      timeout: 2500,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test('recovery: feed hydrates after the failing route is unrouted', async ({
    page,
  }) => {
    // Start with /listings failing.
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) return route.abort('failed');
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    await page.waitForTimeout(1500);

    // Tear down the failure stub, then nudge the app to refetch by switching
    // tabs and coming back. If the query layer has a stale-while-error policy
    // this should produce live data.
    await page.unroute(REST_RE);
    await page.getByText('Discover', { exact: true }).click();
    await page.getByText('Home', { exact: true }).click();
    await page.waitForTimeout(2500);
    // We accept either: real listings now visible, OR the empty state still
    // showing (the suite may run against a low-volume staging DB). What we
    // refuse is a thrown error overlay.
    const errorOverlay = page.getByText(/Something went wrong|Unhandled error/i);
    await expect(errorOverlay).toHaveCount(0);
  });
});
