// Owner-only actions on /product/<id> — "Mark as sold" / "Mark available" +
// "Delete". We need to hit an own-listing page; we ask Supabase REST for one
// scoped to the signed-in user's id, derived from the saved storage state.
// If the account has no listings the test skips.

import { test, expect } from '@playwright/test';
import { waitForAppReady, SUPABASE_URL, SUPABASE_ANON_KEY } from '../helpers/page';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readUserIdFromStorage(): string | null {
  const storagePath = path.resolve(process.cwd(), 'playwright/.auth/user.json');
  if (!fs.existsSync(storagePath)) return null;
  const raw = JSON.parse(fs.readFileSync(storagePath, 'utf8')) as {
    origins?: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of raw.origins ?? []) {
    for (const kv of origin.localStorage ?? []) {
      if (!kv.name.startsWith('sb-') || !kv.name.endsWith('-auth-token')) continue;
      try {
        const parsed = JSON.parse(kv.value) as { user?: { id?: string } };
        if (parsed.user?.id) return parsed.user.id;
      } catch {}
    }
  }
  return null;
}

async function fetchAnyOwnedListing(
  userId: string,
): Promise<{ id: string; is_sold: boolean } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?select=id,is_sold&seller_id=eq.${userId}&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string; is_sold: boolean }>;
  return rows[0] ?? null;
}

test.describe('Product owner actions (signed in)', () => {
  test('owner sees the Mark-as-sold and Delete CTAs (no destructive click)', async ({ page }) => {
    const userId = readUserIdFromStorage();
    test.skip(!userId, 'no user id in storage state — auth setup did not save a session');
    const listing = await fetchAnyOwnedListing(userId!);
    test.skip(!listing, 'signed-in user has no listings on this account');

    await page.goto(`/product/${listing!.id}`);
    await waitForAppReady(page);
    // The button copy depends on the current sold status.
    if (listing!.is_sold) {
      await expect(page.getByText('Mark available')).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(page.getByText('Mark as sold')).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.getByText('Delete', { exact: true })).toBeVisible();
    // Confirm the legacy "Follow / Message" CTAs are NOT shown for the owner.
    await expect(page.getByText('Message', { exact: true })).toHaveCount(0);
  });
});
