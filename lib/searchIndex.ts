// Server-backed indexes for the Discover search hub (Brands / Aesthetics
// tabs). Thin RPC wrappers — every function here is STABLE, SECURITY INVOKER
// (listings RLS applies) and escapes LIKE wildcards server-side, so the
// client passes raw user text as a parameter and never builds SQL. Errors
// throw so React Query keeps the last good rows instead of blanking the
// panel.

import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';

export interface BrandIndexEntry {
  name: string;
  count: number;
  /** Up to 3 recent cover shots from that brand's live listings. */
  images: string[];
}

// Every live brand in the catalog with stock depth, ranked by depth. The RPC
// caps at 100 rows; on an early-stage catalog that is the whole index, so the
// screen filters it client-side for zero-latency typing.
export async function fetchBrandIndex(query: string | null, limit = 100): Promise<BrandIndexEntry[]> {
  const { data, error } = await supabase.rpc('get_brand_index', {
    p_query: query?.trim() || null,
    p_limit: limit,
  });
  if (error) {
    console.warn('[searchIndex] fetchBrandIndex', error.message);
    throw new Error(error.message);
  }
  return ((data ?? []) as { brand: string; item_count: number; images: string[] | null }[]).map(
    (r) => ({ name: r.brand, count: Number(r.item_count), images: r.images ?? [] }),
  );
}

export interface TagIndexEntry {
  tag: string;
  count: number;
  image: string | null;
}

// Every hashtag actually live on the catalog (public.listings.tags), ranked
// by how many items carry it — this *is* the Aesthetics tab's catalog. No
// curated list: a tag shows up the moment a seller uses it and disappears
// once the last listing carrying it is gone or sold.
export async function fetchTagIndex(query: string | null, limit = 100): Promise<TagIndexEntry[]> {
  const { data, error } = await supabase.rpc('get_tag_index', {
    p_query: query?.trim() || null,
    p_limit: limit,
  });
  if (error) {
    console.warn('[searchIndex] fetchTagIndex', error.message);
    throw new Error(error.message);
  }
  return ((data ?? []) as { tag: string; item_count: number; image: string | null }[]).map(
    (r) => ({ tag: r.tag, count: Number(r.item_count), image: r.image ?? null }),
  );
}

// The tap-through for a tag tile: full listing rows carrying that exact tag,
// same membership test as the index so counts and results always agree.
export async function fetchTagListings(tag: string, limit = 60): Promise<Listing[]> {
  const { data, error } = await supabase.rpc('get_tag_listings', {
    p_tag: tag,
    p_limit: limit,
  });
  if (error) {
    console.warn('[searchIndex] fetchTagListings', error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as Listing[];
}
