import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';

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

  const { data, error } = await query.limit(limit);
  if (error) {
    console.warn('[listings] fetchListings', error.message);
    return [];
  }
  return (data ?? []) as unknown as Listing[];
}

export async function fetchListingById(id: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_SELLER)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('[listings] fetchListingById', error.message);
    return null;
  }
  return (data as unknown as Listing) ?? null;
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
