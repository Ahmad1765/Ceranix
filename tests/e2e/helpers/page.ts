// Real-Supabase mode helpers. The web bundle is built with .env.local (real
// project URL + anon key); requests flow through unmocked. We don't seed or
// reset the DB between tests, so every assertion has to be data-agnostic —
// either structural (headers, controls, URL changes) or based on data the
// test fetched at runtime.

import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Surface app-level runtime errors in the Playwright trace so silent
    // hangs are easier to diagnose.
    page.on('pageerror', (e) => console.warn('[pageerror]', e.message));
    await use(page);
  },
});

export { expect };

// Wait for the Expo Router app to mount. The root component blocks render
// until icon fonts load; we poll the document body for non-empty text content
// instead of pinning to a specific string (the auth form step, "not found"
// screens, etc. all show different copy).
export async function waitForAppReady(page: Page, options: { timeout?: number } = {}) {
  const timeout = options.timeout ?? 25_000;
  await page.waitForFunction(
    () => {
      const text = (document.body.innerText ?? '').trim();
      return text.length > 0;
    },
    undefined,
    { timeout },
  );
}

export async function gotoRoute(page: Page, route: string) {
  await page.goto(route);
  await waitForAppReady(page);
}

// RN-Web FlatList virtualizes off-screen rows; on web the outer `body`
// doesn't scroll — the FlatList has its own div with overflow:auto. We sweep
// every scrollable container on the page and pin its scrollTop to scrollHeight
// so every row mounts into the DOM. Idempotent and safe to re-run.
export async function scrollFeedToBottom(page: Page) {
  await waitForAppReady(page);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const scrollables = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
        (el) => {
          const s = getComputedStyle(el);
          return (
            (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight
          );
        },
      );
      scrollables.forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(150);
}

// Read EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY from .env.local at module load.
// The Playwright runner is a long-lived Node process, so the file is parsed
// exactly once per worker — cheap and avoids leaking secrets into a stage-3
// browser global.
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadEnvLocal(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const ENV = loadEnvLocal();
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || ENV.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ENV.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Hit the real Supabase REST endpoint to grab a sample listing for tests that
// need a real listing id (product detail, payment, invoice). Uses the URL +
// anon key from .env.local — the same values the bundle was built with.
export async function fetchAnyLiveListing(
  _page: Page,
): Promise<{ id: string; title: string; price: number; brand: string | null; seller_id: string | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?select=id,title,price,brand,seller_id&is_sold=eq.false&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    id: string;
    title: string;
    price: number;
    brand: string | null;
    seller_id: string | null;
  }>;
  return rows[0] ?? null;
}

// Generate a fresh, unique email so signup tests don't collide between runs.
export function freshTestEmail(): string {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `e2e-${stamp}@example.test`;
}
