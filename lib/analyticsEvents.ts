// Pure analytics helpers — no SDK, no React Native, so they unit-test in Node.
// The SDK wrapper (lib/analytics.ts) composes these.

/** Tracking is on only when configured AND the user has not opted out. */
export function shouldTrack(state: { hasKey: boolean; optedOut: boolean }): boolean {
  return state.hasKey && !state.optedOut;
}

export function buildListingViewedProps(
  listing: { id: string; seller_id: string; price: number; category: string },
  source: string,
): Record<string, unknown> {
  return {
    listing_id: listing.id,
    seller_id: listing.seller_id,
    price: listing.price,
    category: listing.category,
    source,
  };
}

// Privacy: capture the LENGTH of the query, never the raw text (it can carry
// sensitive free-text). category/resultsCount are safe structured values.
export function buildSearchProps(
  query: string,
  category: string | null,
  resultsCount: number,
): Record<string, unknown> {
  return {
    query_length: query.length,
    category,
    results_count: resultsCount,
  };
}
