import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';
import { putCachedListings } from '@/lib/listingCache';
import { getLikedIds, updateLikedCache } from '@/lib/engagementCache';
import { captureError } from '@/lib/sentry';
import { escapeSearchQuery } from '@/lib/search';
import { enqueueOfflineAction, isNetworkError } from '@/lib/offlineSync';
import { queryClient } from '@/lib/queryClient';

const SELECT_WITH_SELLER = '*, seller:profiles!listings_seller_id_fkey(*)';

// Slim feed payload: drop `description` (long, not shown on cards) and pull
// only the seller fields ListingCard actually reads. Cuts wire bytes per row
// by ~60% — the real fix for "feed takes 10s then expires" on cold start, since
// the DB query itself runs in <1ms (verified). Inner join so vacation_mode
// filter applies; every listing has a seller so no rows are lost.
const FEED_LISTING_COLS =
  'id, seller_id, title, brand, size, price, category, subcategory, color, gender, condition, images, thumbnails, is_sold, views, likes, tags, created_at';
const FEED_SELLER_COLS = 'id, username, full_name, avatar_url, is_verified, vacation_mode';
const SELECT_FEED = `${FEED_LISTING_COLS}, seller:profiles!listings_seller_id_fkey!inner(${FEED_SELLER_COLS})`;

export type FeedTab = 'for_you' | 'popular';

// Sort options surfaced in Discover's category browse. When omitted, ordering
// falls back to the tab default (popular → likes, otherwise newest).
export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'popular';

// Discriminated result: ok=false means the network/client wedged, the timeout
// fired, or PostgREST returned an error — caller should preserve whatever
// listings are already on screen rather than commit an empty array. ok=true
// is "trust this" — a genuinely empty rows array is a real "no listings"
// signal worth committing.
export type FetchListingsResult = { ok: true; rows: Listing[] } | { ok: false };

export async function fetchListingsResult(
  opts: {
    tab?: FeedTab;
    limit?: number;
    offset?: number;
    category?: string | null;
    subcategory?: string | null;
    sort?: SortKey | null;
  } = {},
): Promise<FetchListingsResult> {
  const { tab = 'for_you', limit = 60, offset = 0, category = null, subcategory = null, sort = null } = opts;
  let query = supabase
    .from('listings')
    .select(SELECT_FEED)
    .eq('is_sold', false)
    .eq('seller.vacation_mode', false);
  if (category) query = query.eq('category', category);
  if (subcategory) query = query.eq('subcategory', subcategory);

  if (sort === 'price_asc') {
    query = query.order('price', { ascending: true }).order('created_at', { ascending: false });
  } else if (sort === 'price_desc') {
    query = query.order('price', { ascending: false }).order('created_at', { ascending: false });
  } else if (sort === 'popular' || (!sort && tab === 'popular')) {
    query = query
      .order('likes', { ascending: false, nullsFirst: false })
      .order('views', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  } else {
    // 'newest' or the for_you default.
    query = query.order('created_at', { ascending: false });
  }
  if (offset > 0) {
    query = query.range(offset, offset + limit - 1);
  }

  // Belt-and-braces: even with the global fetch ceiling in lib/supabase.ts,
  // race against an explicit timeout AND wrap the await in try/catch so this
  // function can NEVER hang or throw. The home feed depends on this resolving
  // — a hung promise means an eternal skeleton, which is the worst UX.
  const limited = offset > 0 ? query : query.limit(limit);
  let timer: ReturnType<typeof setTimeout>;
  try {
    const result = await Promise.race([
      limited,
      new Promise<{ data: null; error: Error }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              data: null,
              error: new Error('fetchListings hard timeout'),
            }),
          10_000,
        );
      }),
    ]);
    const { data, error } = result as { data: unknown; error: { message: string } | null };
    if (error) {
      console.warn('[listings] fetchListings', error.message);
      return { ok: false };
    }
    const rows = (data ?? []) as unknown as Listing[];
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: any) {
    captureError(e, { fn: 'fetchListings' });
    return { ok: false };
  } finally {
    clearTimeout(timer!);
  }
}

// Back-compat thin wrapper for any caller that doesn't care about the
// failure mode and just wants "whatever rows we got, or []". The home feed
// uses fetchListingsResult directly so it can tell a wedge from an empty feed.
export async function fetchListings(
  opts: {
    tab?: FeedTab;
    limit?: number;
    category?: string | null;
    subcategory?: string | null;
    sort?: SortKey | null;
  } = {},
): Promise<Listing[]> {
  const r = await fetchListingsResult(opts);
  return r.ok ? r.rows : [];
}

// Listings whose seller the current user follows. Two-step query because
// PostgREST doesn't let us join through `user_follows` and back into
// `listings` in one shot. Returns the same discriminated result shape as
// `fetchListingsResult` so the home screen's wedge-vs-empty branch stays
// uniform.
export async function fetchFollowingListingsResult(
  userId: string,
  limit = 60,
): Promise<FetchListingsResult> {
  try {
    const { data: rows, error: followErr } = await supabase
      .from('user_follows')
      .select('followee_id')
      .eq('follower_id', userId);
    if (followErr) {
      console.warn('[listings] fetchFollowingListings follow', followErr.message);
      return { ok: false };
    }
    const followeeIds = (rows ?? []).map((r) => (r as { followee_id: string }).followee_id);
    if (followeeIds.length === 0) return { ok: true, rows: [] };

    const { data, error } = await supabase
      .from('listings')
      .select(SELECT_FEED)
      .in('seller_id', followeeIds)
      .eq('is_sold', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[listings] fetchFollowingListings', error.message);
      return { ok: false };
    }
    const out = (data ?? []) as unknown as Listing[];
    putCachedListings(out);
    return { ok: true, rows: out };
  } catch (e: any) {
    captureError(e, { fn: 'fetchFollowingListings' });
    return { ok: false };
  }
}

// Server-side search across the WHOLE catalog (title, brand, description,
// tags). The Discover screen previously filtered its 60 cached "popular" rows
// client-side, which silently missed anything outside that window. Escapes
// PostgREST `or()` metacharacters and ilike wildcards so user input can't
// break the filter expression.
export async function searchListings(opts: {
  query: string;
  category?: string | null;
  subcategory?: string | null;
  limit?: number;
}): Promise<FetchListingsResult> {
  const { query, category = null, subcategory = null, limit = 60 } = opts;
  const raw = query.trim();
  if (!raw) return { ok: true, rows: [] };
  // Neutralize PostgREST or() delimiters + escape LIKE wildcards (see lib/search).
  const safe = escapeSearchQuery(raw);
  if (!safe) return { ok: true, rows: [] };

  try {
    let q = supabase
      .from('listings')
      .select(SELECT_FEED)
      .eq('is_sold', false)
      .eq('seller.vacation_mode', false)
      .or(`title.ilike.%${safe}%,brand.ilike.%${safe}%,description.ilike.%${safe}%,tags.cs.{${safe}}`);
    if (category) q = q.eq('category', category);
    if (subcategory) q = q.eq('subcategory', subcategory);
    const { data, error } = await q
      .order('likes', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[listings] searchListings', error.message);
      return { ok: false };
    }
    const rows = (data ?? []) as unknown as Listing[];
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: any) {
    captureError(e, { fn: 'searchListings' });
    return { ok: false };
  }
}

// Single-listing reads are NOT exported from here. They live in the queryFn of
// useListingQuery (lib/queries.ts), which is the only way to fetch one — four
// screens each hand-rolled their own load effect around the old
// `fetchListingById`, complete with duplicated abort flags, cache seeding, and a
// 25s Promise.race that could never fire (lib/supabase.ts already aborts every
// request at 12s). The column list they shared is exported instead.
export const SELECT_LISTING_WITH_SELLER = SELECT_WITH_SELLER;

export async function fetchUserListings(sellerId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_SELLER)
    .eq('seller_id', sellerId)
    .order('is_sold', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[listings] fetchUserListings', error.message);
    return [];
  }
  return (data ?? []) as unknown as Listing[];
}

// Ranked "more from this seller" — calls the find_seller_other_listings RPC
// which orders by likes desc, then freshness, and excludes the current item +
// sold rows server-side. The seller embed is re-fetched in a follow-up so the
// row shape matches the rest of the app (ListingCard etc. expect `seller`).
export async function fetchSellerOtherListings(
  sellerId: string,
  excludeId: string | null,
  limit = 6,
): Promise<Listing[]> {
  let rows: Listing[] = [];
  const { data, error } = await supabase.rpc('find_seller_other_listings', {
    p_seller_id: sellerId,
    p_exclude_id: excludeId,
    p_limit: limit,
  });
  if (error) {
    // Surfaces e.g. PostgREST schema-cache lag or transient 5xx. We fall
    // through to a direct table read so the "more from this seller" grid
    // still renders even when the RPC is briefly unreachable.
    console.warn('[listings] fetchSellerOtherListings rpc', error.message);
  } else {
    rows = (data ?? []) as Listing[];
  }
  // Fallback: if the RPC errored OR returned nothing, query the table
  // directly with the same filters/ordering. This makes the seller items
  // section resilient to schema cache invalidation, brief network blips,
  // and any client/RPC version mismatch.
  if (rows.length === 0) {
    let q = supabase
      .from('listings')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_sold', false)
      .order('likes', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (excludeId) q = q.neq('id', excludeId);
    const { data: fallbackData, error: fallbackErr } = await q;
    if (fallbackErr) {
      console.warn('[listings] fetchSellerOtherListings fallback', fallbackErr.message);
      return [];
    }
    rows = (fallbackData ?? []) as Listing[];
  }
  if (rows.length === 0) return [];
  // Hydrate the seller profile in one round-trip (the RPC returns bare rows).
  const { data: sellerData, error: sellerErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sellerId)
    .maybeSingle();
  if (sellerErr) {
    console.warn('[listings] fetchSellerOtherListings hydrate', sellerErr.message);
  }
  const seller = (sellerData as Listing['seller'] | null) ?? null;
  return rows.map((r) => ({ ...r, seller: seller ?? (r as Listing).seller })) as Listing[];
}

// Ranked "you might also like" — calls find_similar_listings which combines
// brand/gender/size/condition exact matches, price proximity, title trigram
// similarity, likes, and freshness into a single weighted score. The seller
// embed is hydrated per row so the existing card components render normally.
export async function fetchSimilarListings(
  listingId: string,
  limit = 6,
): Promise<Listing[]> {
  let rows: Listing[] = [];
  const { data, error } = await supabase.rpc('find_similar_listings', {
    p_listing_id: listingId,
    p_limit: limit,
  });
  if (error) {
    console.warn('[listings] fetchSimilarListings rpc', error.message);
  } else {
    rows = (data ?? []) as Listing[];
  }
  // Fallback: if the RPC was unavailable or returned nothing, use the source
  // listing's category to drive a plain table read so the Similar tab still
  // shows something — same-category, not-sold, not-itself, newest first.
  if (rows.length === 0) {
    const { data: srcRow, error: srcErr } = await supabase
      .from('listings')
      .select('category, seller_id')
      .eq('id', listingId)
      .maybeSingle();
    if (srcErr || !srcRow) {
      if (srcErr) console.warn('[listings] fetchSimilarListings src', srcErr.message);
      return [];
    }
    const { data: fallbackData, error: fallbackErr } = await supabase
      .from('listings')
      .select('*')
      .eq('category', (srcRow as { category: string }).category)
      .eq('is_sold', false)
      .neq('id', listingId)
      .order('likes', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fallbackErr) {
      console.warn('[listings] fetchSimilarListings fallback', fallbackErr.message);
      return [];
    }
    rows = (fallbackData ?? []) as Listing[];
  }
  if (rows.length === 0) return [];
  const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id).filter(Boolean)));
  if (sellerIds.length === 0) return rows;
  const { data: sellers, error: sellerErr } = await supabase
    .from('profiles')
    .select('*')
    .in('id', sellerIds);
  if (sellerErr) {
    console.warn('[listings] fetchSimilarListings hydrate', sellerErr.message);
    return rows;
  }
  const byId = new Map<string, Listing['seller']>(
    ((sellers ?? []) as Listing['seller'][]).map((s) => [s.id, s]),
  );
  return rows.map((r) => ({ ...r, seller: byId.get(r.seller_id) ?? (r as Listing).seller })) as Listing[];
}

export async function fetchLikedListings(userId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listing_likes')
    .select(`listing:listings(${SELECT_WITH_SELLER})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[listings] fetchLikedListings', error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as { listing: Listing | Listing[] | null }[];
  return rows
    .map((row) => (Array.isArray(row.listing) ? row.listing[0] : row.listing))
    .filter((l): l is Listing => l != null);
}

// Answered from the batched engagement cache: one query per user per 30s
// instead of one query per card mount (the heart icons on a 60-card grid
// used to cost 60 round-trips).
export async function isLiked(listingId: string, userId: string): Promise<boolean> {
  const ids = await getLikedIds(userId);
  return ids.has(listingId);
}

// Owner action: flip `is_sold`. Caller is the seller; RLS enforces that.
// Returns the new value on success, the previous value on failure (so the
// UI's optimistic flip can roll back).
export async function setListingSold(
  listingId: string,
  nextSold: boolean,
): Promise<boolean> {
  const { error } = await supabase
    .from('listings')
    .update({ is_sold: nextSold })
    .eq('id', listingId);
  if (error) {
    console.warn('[listings] setListingSold', error.message);
    return !nextSold;
  }
  return nextSold;
}

// Owner action: hard-delete the row. RLS only lets the seller delete their
// own listing. We return a bool so the UI can show a toast instead of
// throwing.
export async function deleteListing(listingId: string): Promise<boolean> {
  const { error } = await supabase.from('listings').delete().eq('id', listingId);
  if (error) {
    console.warn('[listings] deleteListing', error.message);
    return false;
  }
  return true;
}

export async function toggleLike(
  listingId: string,
  userId: string,
  currentlyLiked: boolean,
): Promise<boolean> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('listing_likes')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);
    if (error) {
      if (isNetworkError(error)) {
        await enqueueOfflineAction({
          type: 'like_toggle',
          userId,
          listingId,
          targetLiked: false,
        });
        return false;
      }
      console.warn('[listings] unlike', error.message);
      return currentlyLiked;
    }
    updateLikedCache(userId, listingId, false);
    queryClient.invalidateQueries({ queryKey: ['feedListings'] });
    queryClient.invalidateQueries({ queryKey: ['myFeedListings'] });
    queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    return false;
  }
  const { error } = await supabase
    .from('listing_likes')
    .insert({ user_id: userId, listing_id: listingId });
  if (error && error.code !== '23505') {
    if (isNetworkError(error)) {
      await enqueueOfflineAction({
        type: 'like_toggle',
        userId,
        listingId,
        targetLiked: true,
      });
      return true;
    }
    console.warn('[listings] like', error.message);
    return currentlyLiked;
  }
  updateLikedCache(userId, listingId, true);
  queryClient.invalidateQueries({ queryKey: ['feedListings'] });
  queryClient.invalidateQueries({ queryKey: ['myFeedListings'] });
  queryClient.invalidateQueries({ queryKey: ['recommendations'] });
  return true;
}
