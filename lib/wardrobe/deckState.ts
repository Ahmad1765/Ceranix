// Pure helpers for the swipe deck — no React, no Supabase, unit-tested.

export function filterUnseen<T extends { id: string }>(posts: T[], seenIds: Set<string>): T[] {
  return posts.filter((p) => !seenIds.has(p.id));
}

export function dedupeById<T extends { id: string }>(posts: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of posts) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// When the remaining card count drops to/below the threshold, the deck should
// prefetch the next page.
export function needsMore(remaining: number, threshold = 3): boolean {
  return remaining <= threshold;
}
