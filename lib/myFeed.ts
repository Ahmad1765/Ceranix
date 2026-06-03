import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';
import { putCachedListings } from '@/lib/listingCache';

// Discriminated result: ok=false means the fetch wedged or PostgREST errored.
// Callers should preserve whatever is on screen rather than commit []. This
// mirrors `FetchListingsResult` in lib/listings.ts so the My Feed screen can
// reuse the same wedge-vs-empty branching.
export type MyFeedResult<T> = { ok: true; rows: T[] } | { ok: false };

export type PriceDropListing = Listing & {
  old_price: number;
  new_price: number;
  changed_at: string;
};

const FETCH_TIMEOUT_MS = 10_000;

// Race any supabase-js query against a hard timeout so a wedged client can
// never freeze the My Feed screen. Mirrors the pattern used in lib/listings.ts.
async function withTimeout<T>(p: PromiseLike<T>, label: string): Promise<T | { __wedge: true }> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return (await Promise.race([
      p,
      new Promise<{ __wedge: true }>((resolve) => {
        timer = setTimeout(() => resolve({ __wedge: true }), FETCH_TIMEOUT_MS);
      }),
    ])) as T | { __wedge: true };
  } finally {
    clearTimeout(timer!);
  }
}

const SELLER_COLS = 'id, username, full_name, avatar_url, is_verified, vacation_mode';
const LISTING_COLS =
  'id, seller_id, title, brand, size, price, category, gender, condition, images, is_sold, likes, created_at';

// Price drops on listings the user has liked, within the last 30 days,
// still active, seller not on vacation. Two-step query: first fetch the
// user's liked listing ids, then for each find the most recent price-drop
// row and hydrate listing + seller. Bounded to 8 rows for the strip.
export async function fetchPriceDrops(userId: string): Promise<MyFeedResult<PriceDropListing>> {
  try {
    // Step A — which listings has the user liked? Bounded; users with
    // thousands of likes still only need the last few hundred to find drops.
    const likedRes = await withTimeout(
      supabase
        .from('listing_likes')
        .select('listing_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      'price-drops:likes',
    );
    if ('__wedge' in likedRes) return { ok: false };
    const { data: likedRows, error: likedErr } = likedRes as {
      data: { listing_id: string }[] | null;
      error: { message: string } | null;
    };
    if (likedErr) {
      console.warn('[myFeed] fetchPriceDrops likes', likedErr.message);
      return { ok: false };
    }
    const likedIds = (likedRows ?? []).map((r) => r.listing_id);
    if (likedIds.length === 0) return { ok: true, rows: [] };

    // Step B — most recent drop per listing within window.
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dropsRes = await withTimeout(
      supabase
        .from('listing_price_history')
        .select('listing_id, old_price, new_price, changed_at')
        .in('listing_id', likedIds)
        .gt('changed_at', sinceIso)
        .order('changed_at', { ascending: false })
        .limit(64),
      'price-drops:history',
    );
    if ('__wedge' in dropsRes) return { ok: false };
    const { data: dropRows, error: dropErr } = dropsRes as {
      data:
        | { listing_id: string; old_price: number; new_price: number; changed_at: string }[]
        | null;
      error: { message: string } | null;
    };
    if (dropErr) {
      console.warn('[myFeed] fetchPriceDrops history', dropErr.message);
      return { ok: false };
    }
    // Keep only the latest drop per listing, and only if price went DOWN.
    const latestPerListing = new Map<
      string,
      { old_price: number; new_price: number; changed_at: string }
    >();
    for (const row of dropRows ?? []) {
      if (row.new_price >= row.old_price) continue;
      if (!latestPerListing.has(row.listing_id)) {
        latestPerListing.set(row.listing_id, {
          old_price: row.old_price,
          new_price: row.new_price,
          changed_at: row.changed_at,
        });
      }
    }
    const droppedIds = Array.from(latestPerListing.keys()).slice(0, 8);
    if (droppedIds.length === 0) return { ok: true, rows: [] };

    // Step C — hydrate listings + sellers.
    const hydrateRes = await withTimeout(
      supabase
        .from('listings')
        .select(`${LISTING_COLS}, seller:profiles!listings_seller_id_fkey!inner(${SELLER_COLS})`)
        .in('id', droppedIds)
        .eq('is_sold', false)
        .eq('seller.vacation_mode', false),
      'price-drops:hydrate',
    );
    if ('__wedge' in hydrateRes) return { ok: false };
    const { data: listings, error: hydrateErr } = hydrateRes as {
      data: Listing[] | null;
      error: { message: string } | null;
    };
    if (hydrateErr) {
      console.warn('[myFeed] fetchPriceDrops hydrate', hydrateErr.message);
      return { ok: false };
    }
    const rows: PriceDropListing[] = (listings ?? [])
      .map((l) => {
        const drop = latestPerListing.get(l.id);
        if (!drop) return null;
        return { ...l, ...drop };
      })
      .filter((r): r is PriceDropListing => r !== null)
      .sort((a, b) => b.changed_at.localeCompare(a.changed_at));
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[myFeed] fetchPriceDrops threw', msg);
    return { ok: false };
  }
}
