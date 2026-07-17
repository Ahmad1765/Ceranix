// Saved searches: signed-in flow only (the feature is gated on auth).
//
// Each test creates a real row in the user's saved_searches table via the
// UI, exercises the read path on /news Saved, then deletes the row to keep
// the account clean. If the saved_searches migration hasn't been applied,
// the writes will return null and the test skips gracefully.

import { test, expect, type Page } from '@playwright/test';
import { waitForAppReady, discoverSearch, SUPABASE_URL, SUPABASE_ANON_KEY } from '../helpers/page';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Discover lands on the Aesthetics tab and the Items chip is hidden, so the
// item search box — the one that owns the save-search pill — isn't reachable
// from a bare /discover. Deep-link a category to land on Items, then clear it,
// which leaves the Items tab active with no query and no filter: the clean
// state these tests assume.
async function openItemSearch(page: Page) {
  await page.goto('/discover?category=clothing');
  await waitForAppReady(page);
  await page.getByText('Clear', { exact: true }).first().click();
  await expect(page.getByText('Clear', { exact: true })).toHaveCount(0);
  return discoverSearch(page);
}

function readAuthToken(): { token: string; userId: string } | null {
  const storagePath = path.resolve(process.cwd(), 'playwright/.auth/user.json');
  if (!fs.existsSync(storagePath)) return null;
  const raw = JSON.parse(fs.readFileSync(storagePath, 'utf8')) as {
    origins?: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of raw.origins ?? []) {
    for (const kv of origin.localStorage ?? []) {
      if (!kv.name.startsWith('sb-') || !kv.name.endsWith('-auth-token')) continue;
      try {
        const parsed = JSON.parse(kv.value) as {
          access_token?: string;
          user?: { id?: string };
        };
        if (parsed.access_token && parsed.user?.id) {
          return { token: parsed.access_token, userId: parsed.user.id };
        }
      } catch (e) {
        console.warn(`[saved-searches] Ignored invalid token at ${origin.origin} -> ${kv.name}:`, (e as Error)?.message);
      }
    }
  }
  return null;
}

// Direct REST cleanup so we don't depend on the UI delete path.
async function cleanupSavedSearches(token: string, userId: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  await fetch(
    `${SUPABASE_URL}/rest/v1/saved_searches?user_id=eq.${userId}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  ).catch(() => {});
}

async function migrationApplied(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saved_searches?select=id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.ok;
}

test.describe.configure({ mode: 'serial' });

test.describe('Saved searches (signed in)', () => {
  test.beforeEach(async () => {
    const auth = readAuthToken();
    if (auth) await cleanupSavedSearches(auth.token, auth.userId);
  });

  test.afterEach(async () => {
    const auth = readAuthToken();
    if (auth) await cleanupSavedSearches(auth.token, auth.userId);
  });

  test('Discover screen shows the Save CTA only when a query / filter is active', async ({
    page,
  }) => {
    const search = await openItemSearch(page);
    // Clean state: no query, no category → no Save chip.
    await expect(page.getByText('Save this search')).toHaveCount(0);
    await search.fill('nike');
    // Pill should now appear (testID guarantees stable lookup).
    await expect(page.getByTestId('discover-save-search')).toBeVisible();
  });

  test('saving a search makes it appear on /news Saved and tap-to-apply restores it', async ({
    page,
  }) => {
    const auth = readAuthToken();
    test.skip(!auth, 'no user id in storage state');
    const applied = await migrationApplied(auth!.token);
    test.skip(
      !applied,
      'supabase/saved_searches.sql migration not applied yet — apply it via the SQL editor',
    );

    const search = await openItemSearch(page);
    const term = `e2e-saved-${Date.now().toString(36)}`;
    await search.fill(term);
    await page.getByTestId('discover-save-search').click();
    // The "Saved — find it under Activity" copy on the pill is the stable
    // post-save state (the toast itself is animated out after ~2s).
    await expect(page.getByText(/find it under Activity/i)).toBeVisible();

    // /news Saved tab now lists the row.
    await page.goto('/news');
    await waitForAppReady(page);
    await page.getByText('Saved', { exact: true }).click();
    await expect(page.getByText(term).first()).toBeVisible({ timeout: 15_000 });

    // Tapping the row re-opens Discover with the query pre-filled.
    await page.getByText(term).first().click();
    await page.waitForURL(/discover\?.*q=/);
    await expect(discoverSearch(page)).toHaveValue(term);
  });

  test('saving the same search twice is idempotent (no error, single row)', async ({ page }) => {
    const auth = readAuthToken();
    test.skip(!auth, 'no user id in storage state');
    const applied = await migrationApplied(auth!.token);
    test.skip(!applied, 'supabase/saved_searches.sql migration not applied yet');

    const search = await openItemSearch(page);
    const term = `e2e-dupe-${Date.now().toString(36)}`;
    await search.fill(term);
    await page.getByTestId('discover-save-search').click();
    // The "Saved — find it under Activity" copy on the pill is the stable
    // post-save state (the toast itself is animated out after ~2s).
    await expect(page.getByText(/find it under Activity/i)).toBeVisible();
    // CTA flips to the "already saved" state. Clicking again is a no-op.
    await page.getByTestId('discover-save-search').click().catch(() => {});

    await page.goto('/news');
    await waitForAppReady(page);
    await page.getByText('Saved', { exact: true }).click();
    // Exactly one row in the list with that query.
    await expect(page.getByText(term)).toHaveCount(1, { timeout: 15_000 });
  });

  test('signed-out Saved tab shows the sign-in CTA', async ({ browser }) => {
    // Spin up a fresh context with no storage state so we're guaranteed
    // signed out for this assertion only.
    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    await fresh.goto('/news');
    await waitForAppReady(fresh);
    await fresh.getByText('Saved', { exact: true }).click();
    // Signed out, /news renders the sign-in empty state — which is what this
    // test's name says. It asserted "No saved searches", the *signed-in*
    // empty state, and never caught it: this describe is serial, so the
    // earlier failing test skipped this one before it could run.
    await expect(fresh.getByText('Sign in to save searches')).toBeVisible();
    await expect(fresh.getByText('Sign in', { exact: true })).toBeVisible();
    await ctx.close();
  });
});
