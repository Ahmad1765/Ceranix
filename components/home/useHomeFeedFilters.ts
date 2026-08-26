// ─────────────────────────────────────────────────────────────────────────────
// USE HOME FEED FILTERS HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: High-Performance Multi-Tier Client Filtering
//
// 1. Deferred Value Optimization (`useDeferredValue`):
//    Typing into the feed search field updates `query` synchronously so the caret
//    and character paint with zero lag. However, filtering hundreds of rows and
//    sorting arrays happens through `deferredQuery`, preventing UI thread stutter
//    and coalescing fast keystrokes.
//
// 2. 2D FlashList Grid Virtualization:
//    FlashList achieves maximum performance when virtualizing row arrays (`Listing[][]`)
//    instead of individual cells, preserving flex layouts while mounting only
//    visible rows.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useToast } from '@/lib/toast';
import {
  type FeedFilters,
  type FeedSort,
  EMPTY_FEED_FILTERS,
  countActiveFilters,
} from '@/components/navigation/FeedFilterSheet';
import type { useDeleteSavedSearch } from '@/lib/queries';
import type { Category, Listing } from '@/types';
import type { SavedSearch } from '@/lib/savedSearches';

export const FOR_YOU: 'for-you' = 'for-you';
export const TRENDING: 'trending' = 'trending';
export const SAVED: 'saved' = 'saved';

const VALID_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'clothing', 'shoes', 'bags', 'accessories', 'electronics', 'beauty', 'other',
]);

export function isValidCategory(v: unknown): v is Category {
  return typeof v === 'string' && VALID_CATEGORIES.has(v as Category);
}

const FEED_SORTS: FeedSort[] = ['relevance', 'newest', 'price_asc', 'price_desc', 'popular'];

type UseHomeFeedFiltersProps = {
  listings: Listing[];
  trendingListings: Listing[];
  savedListings: Listing[];
  savedSearches: SavedSearch[];
  deleteSavedSearchM: ReturnType<typeof useDeleteSavedSearch>;
  feedRefetch: () => void;
  trendingRefetch: () => void;
  scrollToTop: () => void;
  columns: number;
};

export function useHomeFeedFilters({
  listings,
  trendingListings,
  savedListings,
  savedSearches,
  deleteSavedSearchM,
  feedRefetch,
  trendingRefetch,
  scrollToTop,
  columns,
}: UseHomeFeedFiltersProps) {
  const toast = useToast();
  const [activeChip, setActiveChip] = useState<string>(FOR_YOU);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_FEED_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilterCount = countActiveFilters(filters);

  // ── Discover Deep Link Synchronization ───────────────────────────────────
  const params = useLocalSearchParams<{ sort?: string; category?: string; n?: string }>();
  useEffect(() => {
    const sort = FEED_SORTS.find((s) => s === params.sort);
    const category = isValidCategory(params.category) ? params.category : null;
    if (!sort && !category && !params.n) return;

    setQuery('');
    const trending = sort === 'popular';
    setActiveChip(trending ? TRENDING : FOR_YOU);
    setFilters({
      ...EMPTY_FEED_FILTERS,
      category,
      sort: !sort || trending ? 'relevance' : sort,
    });
    scrollToTop();
  }, [params.sort, params.category, params.n, scrollToTop]);

  // ── Chip Selection & Target Refetch ──────────────────────────────────────
  const selectChip = useCallback(
    (chip: string) => {
      setActiveChip(chip);
      if (chip === TRENDING) {
        trendingRefetch();
      } else if (chip === FOR_YOU) {
        feedRefetch();
      }
      scrollToTop();
      requestAnimationFrame(() => {
        scrollToTop();
      });
    },
    [scrollToTop, trendingRefetch, feedRefetch],
  );

  // Guarantee list resets to top whenever activeChip changes, including after
  // FlashList layout settles for the new dataset.
  useEffect(() => {
    scrollToTop();
    const frame = requestAnimationFrame(() => {
      scrollToTop();
    });
    const timer = setTimeout(() => {
      scrollToTop();
    }, 50);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [activeChip, scrollToTop]);

  const onDeleteChip = useCallback(
    (search: SavedSearch) => {
      const label = search.label ?? 'Saved';
      Alert.alert(
        `Remove "${label}"?`,
        'This feed will be removed from your list.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              if (activeChip === search.id) setActiveChip(FOR_YOU);
              deleteSavedSearchM.mutate(search.id, {
                onError: () =>
                  toast.show('Could not remove that feed', {
                    variant: 'info',
                    icon: 'alert-circle',
                  }),
              });
            },
          },
        ],
      );
    },
    [activeChip, deleteSavedSearchM, toast],
  );

  const activeSavedSearch = useMemo(
    () => savedSearches.find((s) => s.id === activeChip) ?? null,
    [savedSearches, activeChip],
  );

  const showingSaved = activeChip === SAVED;
  const showingTrending = activeChip === TRENDING;

  // ── Tier 1: View Selection (For You, Saved, Trending, Saved Search) ───────
  const visibleListings = useMemo(() => {
    if (showingSaved) return savedListings;
    if (showingTrending) return trendingListings;
    if (!activeSavedSearch) return listings;
    let rows = listings;
    if (isValidCategory(activeSavedSearch.category)) {
      const cat = activeSavedSearch.category;
      rows = rows.filter((l) => l.category === cat);
    }
    const q = activeSavedSearch.query?.trim().toLowerCase() ?? '';
    if (q.length > 0) {
      rows = rows.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.brand?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  }, [listings, savedListings, trendingListings, showingTrending, activeSavedSearch, showingSaved]);

  // ── Tier 2: Deferred Search Query Refinement ─────────────────────────────
  const deferredQuery = useDeferredValue(query);
  const trimmedQuery = deferredQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const searchedListings = useMemo(() => {
    if (!isSearching) return visibleListings;
    return visibleListings.filter(
      (l) =>
        l.title.toLowerCase().includes(trimmedQuery) ||
        (l.brand?.toLowerCase().includes(trimmedQuery) ?? false),
    );
  }, [visibleListings, isSearching, trimmedQuery]);

  // ── Tier 3: Structured Filters & Sorters ─────────────────────────────────
  const filteredListings = useMemo(() => {
    let rows = searchedListings;
    if (filters.category) rows = rows.filter((l) => l.category === filters.category);
    if (filters.conditions.length > 0)
      rows = rows.filter((l) => filters.conditions.includes(l.condition));
    if (filters.sizes.length > 0)
      rows = rows.filter((l) => !!l.size && filters.sizes.includes(l.size));
    if (filters.priceMin != null) rows = rows.filter((l) => l.price >= filters.priceMin!);
    if (filters.priceMax != null) rows = rows.filter((l) => l.price <= filters.priceMax!);
    switch (filters.sort) {
      case 'newest':
        rows = [...rows].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
      case 'price_asc':
        rows = [...rows].sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        rows = [...rows].sort((a, b) => b.price - a.price);
        break;
      case 'popular':
        rows = [...rows].sort(
          (a, b) => (b.likes ?? 0) - (a.likes ?? 0) || (b.views ?? 0) - (a.views ?? 0),
        );
        break;
    }
    return rows;
  }, [searchedListings, filters]);

  // ── Tier 4: 2D Grid Row Chunking for FlashList ───────────────────────────
  const gridRows = useMemo(() => {
    const out: Listing[][] = [];
    for (let i = 0; i < filteredListings.length; i += columns) {
      out.push(filteredListings.slice(i, i + columns));
    }
    return out;
  }, [filteredListings, columns]);

  const gridEmptyText = isSearching
    ? `Nothing in ${showingSaved ? 'your saved items' : 'this feed'} matches “${deferredQuery.trim()}”.`
    : activeFilterCount > 0
      ? 'No items match these filters. Try loosening them.'
      : showingSaved
        ? 'No saved items yet. Tap the bookmark on any listing to save it.'
        : showingTrending
          ? 'Nothing trending right now.'
          : 'Nothing matches this feed yet.';

  return {
    activeChip,
    setActiveChip,
    selectChip,
    onDeleteChip,
    query,
    setQuery,
    searchFocused,
    setSearchFocused,
    deferredQuery,
    isSearching,
    filters,
    setFilters,
    filterOpen,
    setFilterOpen,
    activeFilterCount,
    visibleListings,
    searchedListings,
    filteredListings,
    gridRows,
    gridEmptyText,
    showingSaved,
    showingTrending,
    activeSavedSearch,
  };
}
