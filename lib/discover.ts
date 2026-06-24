// Editorial-feed derivation for the Discover screen.
//
// Pure functions that turn the already-fetched `popular` listings into the
// "digest" edit cards and brand "collections" rendered in Discover's idle
// state. No fetching, no side effects — the screen owns the data; this module
// only shapes it. Thin/empty catalogs collapse gracefully (callers hide empty
// sections), and the underlying grid guarantees the screen is never blank.

import type { Category, Listing } from '@/types';

// ── Category labels ────────────────────────────────────────────────────────
// Mirrors the tiles in discover.tsx so an "edit" reads as a real section name.
const CATEGORY_LABEL: Record<Category, string> = {
  clothing: 'Clothing',
  shoes: 'Shoes',
  bags: 'Bags',
  accessories: 'Accessories',
  electronics: 'Tech',
  beauty: 'Beauty',
  other: 'Other',
};

// Minimum listings before a category/brand is "real" enough to feature. Below
// this a section would look like filler, so we drop it.
const MIN_PER_GROUP = 3;

export type DigestTarget =
  | { kind: 'theme'; theme: 'demand' | 'fresh' }
  | { kind: 'category'; category: Category };

export interface DigestCard {
  id: string;
  /** Brands present in the group, e.g. "Nike, Stüssy + more". Small mute line. */
  subtitle: string;
  /** The edit name, set in serif. e.g. "Now in demand". */
  title: string;
  image: string | null;
  target: DigestTarget;
}

export interface Collection {
  id: string;
  brand: string;
  /** Uppercase eyebrow of the categories this brand spans. */
  eyebrow: string;
  /** Up to 3 thumbnails forming the collage. */
  images: string[];
}

const firstImage = (l: Listing | undefined): string | null =>
  l && l.images.length > 0 ? l.images[0] : null;

// "Nike, Stüssy + more" from a group of listings — the most common brands first.
function brandLine(listings: Listing[], max = 2): string {
  const counts = new Map<string, number>();
  for (const l of listings) {
    const b = l.brand?.trim();
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b);
  if (ranked.length === 0) return 'Curated picks';
  const head = ranked.slice(0, max);
  const rest = ranked.length - head.length;
  return rest > 0 ? `${head.join(', ')} + more` : head.join(', ');
}

/**
 * Up to ~5 wide "edit" cards: two derived themes (demand / fresh) plus the
 * strongest categories. Each card targets a filter the idle screen can apply.
 */
export function buildDigest(listings: Listing[]): DigestCard[] {
  const live = listings.filter((l) => !l.is_sold && l.images.length > 0);
  if (live.length < MIN_PER_GROUP) return [];

  const cards: DigestCard[] = [];

  // Now in demand — most liked.
  const byLikes = [...live].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  cards.push({
    id: 'digest-demand',
    subtitle: brandLine(byLikes.slice(0, 12)),
    title: 'Now in demand',
    image: firstImage(byLikes[0]),
    target: { kind: 'theme', theme: 'demand' },
  });

  // Fresh drops — newest first.
  const byNew = [...live].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  cards.push({
    id: 'digest-fresh',
    subtitle: brandLine(byNew.slice(0, 12)),
    title: 'Fresh drops',
    image: firstImage(byNew[0]),
    target: { kind: 'theme', theme: 'fresh' },
  });

  // Strongest categories — those with enough stock, by count.
  const byCat = new Map<Category, Listing[]>();
  for (const l of live) {
    const arr = byCat.get(l.category) ?? [];
    arr.push(l);
    byCat.set(l.category, arr);
  }
  const catCards = [...byCat.entries()]
    .filter(([, arr]) => arr.length >= MIN_PER_GROUP)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([category, arr]): DigestCard => ({
      id: `digest-cat-${category}`,
      subtitle: brandLine(arr),
      title: `The ${CATEGORY_LABEL[category]} edit`,
      image: firstImage(arr[0]),
      target: { kind: 'category', category },
    }));

  return [...cards, ...catCards];
}

/**
 * Trending searches — the most common brands in the catalog, surfaced as quick
 * search shortcuts. Unlike collections this has no depth threshold (a single
 * listing is a valid shortcut), so the row is populated even on thin catalogs.
 */
export function buildTrendingSearches(listings: Listing[], max = 8): string[] {
  const counts = new Map<string, number>();
  for (const l of listings) {
    if (l.is_sold) continue;
    const b = l.brand?.trim();
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([brand]) => brand);
}

/**
 * Brand collections — the brands with the deepest stock, each rendered as a
 * collage. Returns top 3; empty when no brand clears the threshold.
 */
export function buildCollections(listings: Listing[]): Collection[] {
  const live = listings.filter((l) => !l.is_sold && l.images.length > 0);

  const byBrand = new Map<string, Listing[]>();
  for (const l of live) {
    const b = l.brand?.trim();
    if (!b) continue;
    const arr = byBrand.get(b) ?? [];
    arr.push(l);
    byBrand.set(b, arr);
  }

  return [...byBrand.entries()]
    .filter(([, arr]) => arr.length >= MIN_PER_GROUP)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([brand, arr]): Collection => {
      const cats = [...new Set(arr.map((l) => CATEGORY_LABEL[l.category]))];
      const eyebrow =
        cats.length > 2 ? `${cats.slice(0, 2).join(', ')} + more` : cats.join(', ');
      const images = arr
        .map((l) => l.images[0])
        .filter((u): u is string => !!u)
        .slice(0, 3);
      return { id: `collection-${brand}`, brand, eyebrow, images };
    });
}
