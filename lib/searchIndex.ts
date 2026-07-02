// Server-backed indexes for the Discover search hub (Brands / Aesthetics
// tabs). Thin RPC wrappers — both functions are STABLE, SECURITY INVOKER
// (listings RLS applies) and escape LIKE wildcards server-side, so the client
// passes raw user text as a parameter and never builds SQL. Errors throw so
// React Query keeps the last good rows instead of blanking the panel.

import { supabase } from '@/lib/supabase';
import { AESTHETICS, type Aesthetic } from '@/lib/aesthetics';
import type { Listing } from '@/types';

export interface BrandIndexEntry {
  name: string;
  count: number;
  image: string | null;
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
  return ((data ?? []) as { brand: string; item_count: number; image: string | null }[]).map(
    (r) => ({ name: r.brand, count: Number(r.item_count), image: r.image ?? null }),
  );
}

export interface AestheticIndexEntry {
  slug: string;
  count: number;
  images: string[];
}

// Catalog-wide match counts + preview images for the curated aesthetics, in
// one round trip. Keyed by slug for O(1) merge with the client catalog.
export async function fetchAestheticIndex(): Promise<Map<string, AestheticIndexEntry>> {
  const defs = AESTHETICS.map((a) => ({ slug: a.slug, keywords: a.keywords }));
  const { data, error } = await supabase.rpc('get_aesthetic_index', { p_defs: defs });
  if (error) {
    console.warn('[searchIndex] fetchAestheticIndex', error.message);
    throw new Error(error.message);
  }
  const map = new Map<string, AestheticIndexEntry>();
  for (const r of (data ?? []) as { slug: string; item_count: number; images: string[] | null }[]) {
    map.set(r.slug, { slug: r.slug, count: Number(r.item_count), images: r.images ?? [] });
  }
  return map;
}

// The tap-through for an aesthetic card: full listing rows matching its
// keywords, same semantics as the index so counts and results always agree.
export async function fetchAestheticListings(aesthetic: Aesthetic, limit = 60): Promise<Listing[]> {
  const { data, error } = await supabase.rpc('get_aesthetic_listings', {
    p_keywords: aesthetic.keywords,
    p_limit: limit,
  });
  if (error) {
    console.warn('[searchIndex] fetchAestheticListings', error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as Listing[];
}
