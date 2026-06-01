import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';
import { putCachedListing, putCachedListings } from '@/lib/listingCache';

const SELECT_WITH_SELLER = '*, seller:profiles!listings_seller_id_fkey(*)';
// Inner join so vacation_mode filter applies. Existing listings always have a seller, so no rows are lost.
const SELECT_WITH_SELLER_INNER = '*, seller:profiles!listings_seller_id_fkey!inner(*)';

export type FeedTab = 'for_you' | 'popular';

export async function fetchListings(opts: { tab?: FeedTab; limit?: number } = {}): Promise<Listing[]> {
  const { tab = 'for_you', limit = 60 } = opts;
  let query = supabase
    .from('listings')
    .select(SELECT_WITH_SELLER_INNER)
    .eq('is_sold', false)
    .eq('seller.vacation_mode', false);

  if (tab === 'popular') {
    query = query.order('likes', { ascending: false }).order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // Belt-and-braces: even with the global fetch ceiling in lib/supabase.ts,
  // race against an explicit timeout AND wrap the await in try/catch so this
  // function can NEVER hang or throw. The home feed depends on this resolving
  // — a hung promise means an eternal skeleton, which is the worst UX.
  try {
    const result = await Promise.race([
      query.limit(limit),
      new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              data: null,
              error: new Error('fetchListings hard timeout'),
            }),
          10_000,
        ),
      ),
    ]);
    const { data, error } = result as { data: unknown; error: { message: string } | null };
    if (error) {
      console.warn('[listings] fetchListings', error.message);
      return [];
    }
    const rows = (data ?? []) as unknown as Listing[];
    putCachedListings(rows);
    return rows;
  } catch (e: any) {
    console.warn('[listings] fetchListings threw', e?.message ?? e);
    return [];
  }
}

export async function fetchListingById(
  id: string,
  signal?: AbortSignal,
): Promise<Listing | null> {
  // abortSignal() lives on the filter builder — must be chained before the
  // terminal modifier (.maybeSingle), otherwise it's missing from the type.
  const filter = supabase
    .from('listings')
    .select(SELECT_WITH_SELLER)
    .eq('id', id);
  const query = signal ? filter.abortSignal(signal) : filter;
  const { data, error } = await query.maybeSingle();
  if (error) {
    // Throw so callers can distinguish "genuinely not found" (returns null)
    // from "request failed" (throws — usually transient, worth retrying).
    // Caller decides whether to log; cancellations should be silent.
    throw new Error(error.message);
  }
  const row = (data as unknown as Listing) ?? null;
  if (row) putCachedListing(row);
  return row;
}

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

export async function isLiked(listingId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('listing_likes')
    .select('listing_id')
    .eq('listing_id', listingId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
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
      console.warn('[listings] unlike', error.message);
      return currentlyLiked;
    }
    return false;
  }
  const { error } = await supabase
    .from('listing_likes')
    .insert({ user_id: userId, listing_id: listingId });
  if (error && error.code !== '23505') {
    console.warn('[listings] like', error.message);
    return currentlyLiked;
  }
  return true;
}
