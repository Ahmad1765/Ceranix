// Pure analytics helpers — no SDK, no React Native, so they unit-test in Node.
// The SDK wrapper (lib/analytics.ts) composes these.

/** Tracking is on only when configured AND the user has not opted out. */
export function shouldTrack(state: { hasKey: boolean; optedOut: boolean }): boolean {
  return state.hasKey && !state.optedOut;
}

/**
 * Replace dynamic id segments in an Expo Router pathname with `:id` so that
 * high-cardinality entity ids never pollute the screen taxonomy in PostHog.
 *
 * A segment is considered an "id" when it matches:
 *   - A UUID (8-4-4-4-12 hex with dashes), OR
 *   - Any segment of 12 or more lowercase hex / alphanumeric characters
 *     (catches Supabase-style UUIDs stripped of dashes, Mongo ObjectIds, etc.)
 *
 * Short human-readable segments like "new", "discover", "settings", or Expo
 * Router group notation like "(tabs)" are left unchanged.
 */
export function normalizeScreenName(pathname: string): string {
  // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Long opaque id: 12+ alphanumeric chars that contain at least one digit.
  // Pure-word segments (e.g. "conversation", "discover") are excluded because
  // they have no digits; human-readable route names never look like hex ids.
  const OPAQUE_ID_RE = /^(?=[a-z0-9]*[0-9])[a-z0-9]{12,}$/i;

  return pathname
    .split('/')
    .map((segment) => {
      if (segment === '' || segment.startsWith('(')) return segment;
      if (UUID_RE.test(segment) || OPAQUE_ID_RE.test(segment)) return ':id';
      return segment;
    })
    .join('/');
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
