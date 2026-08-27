import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';
import { putCachedListings } from '@/lib/listingCache';
import { captureError } from '@/lib/sentry';

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
  'id, seller_id, title, brand, size, price, category, gender, condition, images, thumbnails, is_sold, likes, created_at';

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
    captureError(e, { fn: 'fetchPriceDrops' });
    return { ok: false };
  }
}

// Listings posted in the last `sinceDays` days by sellers the user follows.
// Bounded to 8 rows for the horizontal strip. Two-step query so we can use
// the existing user_follows table (PostgREST can't join through it inline).
export async function fetchNewFromFollowed(
  userId: string,
  sinceDays = 14,
): Promise<MyFeedResult<Listing>> {
  try {
    const followsRes = await withTimeout(
      supabase.from('user_follows').select('followee_id').eq('follower_id', userId).order('created_at', { ascending: false }).limit(200),
      'followed:follows',
    );
    if ('__wedge' in followsRes) return { ok: false };
    const { data: followRows, error: followErr } = followsRes as {
      data: { followee_id: string }[] | null;
      error: { message: string } | null;
    };
    if (followErr) {
      console.warn('[myFeed] fetchNewFromFollowed follows', followErr.message);
      return { ok: false };
    }
    const followeeIds = (followRows ?? []).map((r) => r.followee_id);
    if (followeeIds.length === 0) return { ok: true, rows: [] };

    const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const listingsRes = await withTimeout(
      supabase
        .from('listings')
        .select(`${LISTING_COLS}, seller:profiles!listings_seller_id_fkey!inner(${SELLER_COLS})`)
        .in('seller_id', followeeIds)
        .eq('is_sold', false)
        .eq('seller.vacation_mode', false)
        .gt('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(8),
      'followed:listings',
    );
    if ('__wedge' in listingsRes) return { ok: false };
    const { data: listings, error: listingsErr } = listingsRes as {
      data: Listing[] | null;
      error: { message: string } | null;
    };
    if (listingsErr) {
      console.warn('[myFeed] fetchNewFromFollowed listings', listingsErr.message);
      return { ok: false };
    }
    const rows = (listings ?? []) as Listing[];
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: unknown) {
    captureError(e, { fn: 'fetchNewFromFollowed' });
    return { ok: false };
  }
}

// "Picked for you" — calls the existing find_similar_listings RPC against the
// user's 5 most-recently-liked listings, merges, de-duplicates, excludes
// liked + own + sold items. `limit` is the target visible count after
// dedupe; we ask the RPC for roughly 2× that per seed since duplicates and
// excluded rows trim the set.
export async function fetchSimilarToLiked(
  userId: string,
  limit = 30,
): Promise<MyFeedResult<Listing>> {
  try {
    // Step A — top 5 most-recent likes (the "seeds" for similarity).
    const likedRes = await withTimeout(
      supabase
        .from('listing_likes')
        .select('listing_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
      'similar:likes',
    );
    if ('__wedge' in likedRes) return { ok: false };
    const { data: likedRows, error: likedErr } = likedRes as {
      data: { listing_id: string }[] | null;
      error: { message: string } | null;
    };
    if (likedErr) {
      console.warn('[myFeed] fetchSimilarToLiked likes', likedErr.message);
      return { ok: false };
    }
    const seedIds = (likedRows ?? []).map((r) => r.listing_id);
    // No likes → caller falls back to popular. We DON'T fall back here so
    // the screen can render a different section header ("Popular right now"
    // vs "Picked for you") based on which branch ran.
    if (seedIds.length === 0) return { ok: true, rows: [] };

    // Step B — also pull the full liked set so we can exclude them from
    // the recommendations (you don't want to be told "you might like X" when
    // X is already in your liked list).
    const allLikedRes = await withTimeout(
      supabase
        .from('listing_likes')
        .select('listing_id')
        .eq('user_id', userId)
        .limit(1000),
      'similar:exclude',
    );
    if ('__wedge' in allLikedRes) return { ok: false };
    const { data: allLikedRows, error: allLikedErr } = allLikedRes as {
      data: { listing_id: string }[] | null;
      error: { message: string } | null;
    };
    if (allLikedErr) {
      console.warn('[myFeed] fetchSimilarToLiked exclude', allLikedErr.message);
      return { ok: false };
    }
    const likedSet = new Set((allLikedRows ?? []).map((r) => r.listing_id));

    // Step C — call find_similar_listings per seed, in parallel.
    const perSeed = Math.max(6, Math.ceil((limit * 2) / seedIds.length));
    const responses = await Promise.all(
      seedIds.map(async (id) => {
        const res = await withTimeout(
          supabase.rpc('find_similar_listings', {
            p_listing_id: id,
            p_limit: perSeed,
          }),
          `similar:rpc:${id}`,
        );
        if ('__wedge' in res) return [];
        const { data, error } = res as {
          data: Listing[] | null;
          error: { message: string } | null;
        };
        if (error) {
          console.warn('[myFeed] fetchSimilarToLiked rpc', error.message);
          return [];
        }
        return (data ?? []) as Listing[];
      }),
    );

    // Merge + dedupe by id, exclude liked, exclude own listings, exclude sold.
    const seen = new Set<string>();
    const merged: Listing[] = [];
    for (const batch of responses) {
      for (const row of batch) {
        if (seen.has(row.id)) continue;
        if (likedSet.has(row.id)) continue;
        if (row.seller_id === userId) continue;
        if (row.is_sold) continue;
        seen.add(row.id);
        merged.push(row);
        if (merged.length >= limit) break;
      }
      if (merged.length >= limit) break;
    }
    if (merged.length === 0) return { ok: true, rows: [] };

    // Hydrate sellers in one round-trip (RPC returns bare rows).
    const sellerIds = Array.from(new Set(merged.map((r) => r.seller_id).filter(Boolean)));
    const sellersRes = await withTimeout(
      supabase.from('profiles').select(SELLER_COLS).in('id', sellerIds),
      'similar:sellers',
    );
    if ('__wedge' in sellersRes) return { ok: true, rows: merged };
    const { data: sellers, error: sellersErr } = sellersRes as {
      data: Listing['seller'][] | null;
      error: { message: string } | null;
    };
    if (sellersErr) {
      console.warn('[myFeed] fetchSimilarToLiked sellers', sellersErr.message);
      return { ok: true, rows: merged };
    }
    const byId = new Map<string, Listing['seller']>(
      ((sellers ?? []) as Listing['seller'][]).map((s) => [s.id, s]),
    );
    const rows = merged.map((r) => ({
      ...r,
      seller: byId.get(r.seller_id) ?? r.seller,
    })) as Listing[];
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: unknown) {
    captureError(e, { fn: 'fetchSimilarToLiked' });
    return { ok: false };
  }
}
