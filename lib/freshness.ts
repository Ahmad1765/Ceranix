// Lightweight "stale-while-fresh" gate shared by the feed screens.
//
// Every tab refetches its full payload on focus (home = 60 listings, My Feed =
// recommender + rails + saved, Discover = grid + recommendations). Navigating
// between tabs and back therefore re-hit the network every single time. This
// records when a key was last loaded so a focus within the freshness window can
// reuse what's already on screen instead of refetching.
//
// Pull-to-refresh and explicit mutations bypass this entirely (they call the
// loader directly and re-stamp on success), so users can always force fresh
// data with the pull gesture.

const stamps = new Map<string, number>();

// Default reuse window. Short enough that data never feels stale, long enough
// that bouncing between tabs doesn't spam the backend.
export const FEED_TTL_MS = 60_000;

export function isFresh(key: string, ttlMs: number = FEED_TTL_MS): boolean {
  const t = stamps.get(key);
  return t !== undefined && Date.now() - t < ttlMs;
}

export function markFresh(key: string): void {
  stamps.set(key, Date.now());
}

// Call after a mutation that should force the next focus to refetch (e.g. a new
// listing published, profile edited). Omit the key to clear everything.
export function invalidateFresh(key?: string): void {
  if (key === undefined) stamps.clear();
  else stamps.delete(key);
}
