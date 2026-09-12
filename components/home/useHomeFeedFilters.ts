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
import Feather from '@expo/vector-icons/Feather';
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

export type DynamicFilterChip = {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  category?: Category | null;
  sort?: FeedSort | null;
  tab?: string | null;
  isDefaultTrending: boolean;
};

export const DEFAULT_TRENDING_CHIP: DynamicFilterChip = {
  id: 'trending',
  label: 'Trending',
  icon: 'trending-up',
  sort: 'popular',
  isDefaultTrending: true,
};

const VALID_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'clothing', 'shoes', 'bags', 'accessories', 'electronics', 'beauty', 'other',
]);

export function isValidCategory(v: unknown): v is Category {
  return typeof v === 'string' && VALID_CATEGORIES.has(v as Category);
}

export function getValidChipIcon(
  icon: unknown,
  fallback: keyof typeof Feather.glyphMap = 'box',
): keyof typeof Feather.glyphMap {
  return typeof icon === 'string' && icon in Feather.glyphMap
    ? (icon as keyof typeof Feather.glyphMap)
    : fallback;
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
  const [dynamicChip, setDynamicChip] = useState<DynamicFilterChip>(DEFAULT_TRENDING_CHIP);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_FEED_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilterCount = countActiveFilters(filters);

  // ── Deep Link & Search Query Synchronization ────────────────────────────
  const params = useLocalSearchParams<{
    sort?: string;
    category?: string;
    q?: string;
    sub?: string;
    n?: string;
    tab?: string;
    chipLabel?: string;
    chipIcon?: string;
    resetTrending?: string;
  }>();

  useEffect(() => {
    if (params.resetTrending) {
      setDynamicChip(DEFAULT_TRENDING_CHIP);
      setFilters(EMPTY_FEED_FILTERS);
      setActiveChip(FOR_YOU);
      scrollToTop();
      return;
    }

    const sort = FEED_SORTS.find((s) => s === params.sort);
    const category = isValidCategory(params.category) ? params.category : null;
    const q = params.q?.trim();
    if (!sort && !category && !q && !params.n && !params.tab) return;

    if (q) {
      setQuery(q);
      setActiveChip(FOR_YOU);
    } else {
      setQuery('');
      if (category) {
        const label = params.chipLabel
          ? params.chipLabel
          : category.charAt(0).toUpperCase() + category.slice(1);
        const icon = getValidChipIcon(params.chipIcon, 'box');
        const newChip: DynamicFilterChip = {
          id: `category:${category}`,
          label,
          icon,
          category,
          isDefaultTrending: false,
        };
        setDynamicChip(newChip);
        setActiveChip(newChip.id);
        setFilters({
          ...EMPTY_FEED_FILTERS,
          category,
          sort: 'relevance',
        });
      } else if (sort) {
        if (sort === 'popular') {
          setDynamicChip(DEFAULT_TRENDING_CHIP);
          setActiveChip(TRENDING);
          setFilters({
            ...EMPTY_FEED_FILTERS,
            sort: 'popular',
          });
        } else {
          const label = params.chipLabel
            ? params.chipLabel
            : sort === 'newest'
            ? 'New'
            : 'Lowest price';
          const icon = getValidChipIcon(params.chipIcon, 'box');
          const newChip: DynamicFilterChip = {
            id: `sort:${sort}`,
            label,
            icon,
            sort,
            isDefaultTrending: false,
          };
          setDynamicChip(newChip);
          setActiveChip(newChip.id);
          setFilters({
            ...EMPTY_FEED_FILTERS,
            sort,
          });
        }
      } else if (params.tab) {
        if (params.tab === 'saved') {
          const newChip: DynamicFilterChip = {
            id: 'tab:saved',
            label: 'Saved',
            icon: 'bookmark',
            tab: 'saved',
            isDefaultTrending: false,
          };
          setDynamicChip(newChip);
          setActiveChip(newChip.id);
        } else {
          const label = params.chipLabel
            ? params.chipLabel
            : params.tab.charAt(0).toUpperCase() + params.tab.slice(1);
          const icon = getValidChipIcon(params.chipIcon, 'box');
          const newChip: DynamicFilterChip = {
            id: `tab:${params.tab}`,
            label,
            icon,
            tab: params.tab,
            isDefaultTrending: false,
          };
          setDynamicChip(newChip);
          setActiveChip(newChip.id);
        }
      }
    }
    scrollToTop();
  }, [
    params.sort,
    params.category,
    params.q,
    params.n,
    params.tab,
    params.chipLabel,
    params.chipIcon,
    params.resetTrending,
    scrollToTop,
  ]);

  // ── Chip Selection & Target Refetch ──────────────────────────────────────
  const selectChip = useCallback(
    (chip: string) => {
      setActiveChip(chip);
      if (chip === TRENDING || (dynamicChip.isDefaultTrending && chip === dynamicChip.id)) {
        trendingRefetch();
      } else if (chip === FOR_YOU || chip === dynamicChip.id) {
        feedRefetch();
      }
      scrollToTop();
      requestAnimationFrame(() => {
        scrollToTop();
      });
    },
    [scrollToTop, trendingRefetch, feedRefetch, dynamicChip.id, dynamicChip.isDefaultTrending],
  );

  const resetDynamicChip = useCallback(() => {
    setDynamicChip(DEFAULT_TRENDING_CHIP);
    setActiveChip((current) => (current === dynamicChip.id ? TRENDING : current));
    scrollToTop();
  }, [dynamicChip.id, scrollToTop]);

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

  const showingSaved =
    activeChip === SAVED || (dynamicChip.tab === 'saved' && activeChip === dynamicChip.id);
  const showingTrending =
    activeChip === TRENDING || (dynamicChip.isDefaultTrending && activeChip === dynamicChip.id);
  const showingDynamic = !dynamicChip.isDefaultTrending && activeChip === dynamicChip.id;

  // ── Tier 1: View Selection (For You, Saved, Trending, Dynamic, Saved Search) ───────
  const visibleListings = useMemo(() => {
    if (showingSaved) return savedListings;
    if (showingTrending) return trendingListings;
    if (showingDynamic) {
      let rows = listings;
      if (dynamicChip.category) {
        rows = rows.filter((l) => l.category === dynamicChip.category);
      } else if (dynamicChip.tab === 'saved') {
        return savedListings;
      } else if (dynamicChip.tab === 'brands') {
        rows = rows.filter((l) => Boolean(l.brand && l.brand.trim().length > 0));
      } else if (dynamicChip.tab === 'aesthetics') {
        rows = rows.filter((l) => Boolean(l.tags && l.tags.length > 0));
      }
      return rows;
    }
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
  }, [
    listings,
    savedListings,
    trendingListings,
    showingTrending,
    showingDynamic,
    dynamicChip,
    activeSavedSearch,
    showingSaved,
  ]);

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

    const effectiveSort =
      filters.sort !== 'relevance'
        ? filters.sort
        : showingDynamic && dynamicChip.sort
          ? dynamicChip.sort
          : filters.sort;

    switch (effectiveSort) {
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
  }, [searchedListings, filters, showingDynamic, dynamicChip.sort]);

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
          : showingDynamic
            ? `No items found in ${dynamicChip.label}.`
            : 'Nothing matches this feed yet.';

  return {
    activeChip,
    setActiveChip,
    dynamicChip,
    resetDynamicChip,
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
    showingDynamic,
    activeSavedSearch,
  };
}
