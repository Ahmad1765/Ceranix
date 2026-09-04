// ─────────────────────────────────────────────────────────────────────────────
// USE DISCOVER SEARCH HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Orchestrating Unified Multi-Tab Search & Facets
//
// 1. Debounced Server Search with Sequence Guard:
//    Keystrokes trigger an instant client-side filter over loaded rows, then fire
//    a debounced server-side query across the full catalog. The `searchSeq` counter
//    protects against out-of-order race conditions when network responses return
//    asynchronously.
//
// 2. Cross-Tab Shared Query State:
//    Typing a term like "vintage" carries across tabs (Items, Aesthetics, Brands,
//    Users) so the shopper can seamlessly switch paradigms without re-typing.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { FlashListRef } from '@shopify/flash-list';
import { searchListings, type SortKey } from '@/lib/listings';
import { searchUsers } from '@/lib/follows';
import { CATEGORIES, getCategory } from '@/lib/categories';
import { createSavedSearch, touchSavedSearchSeen } from '@/lib/savedSearches';
import { capture, buildSearchProps } from '@/lib/analytics';
import { useToast } from '@/lib/toast';
import type { Category, Listing } from '@/types';
import type {
  BrowseAction,
  TopicAction,
} from '@/components/discover/SearchLanding';
import type {
  DigestCard,
  GridTheme,
  PromoTarget,
} from '@/lib/discover';
import type { DiscoverTab } from '@/components/discover/SearchTabs';

import {
  type SearchFilterState,
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
} from './SearchFilterChips';

export type CatTile = {
  id: Category | 'trending';
  label: string;
  icon: string;
};

export const CATEGORY_TILES: CatTile[] = [
  { id: 'trending', label: 'Trending', icon: 'trending-up' },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon })),
];

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price ↑' },
  { id: 'price_desc', label: 'Price ↓' },
  { id: 'popular', label: 'Popular' },
];

const HUB_TABS: DiscoverTab[] = ['items', 'aesthetics', 'brands', 'users'];
const SORT_KEYS: SortKey[] = SORT_OPTIONS.map((o) => o.id);
const SEARCH_DEBOUNCE_MS = 300;

export const GRID_THEME_TITLE: Record<GridTheme, string> = {
  demand: 'Now in demand',
  fresh: 'Fresh drops',
};

export const SORT_TITLE: Record<SortKey, string> = {
  newest: 'New in',
  popular: 'Trending',
  price_asc: 'Lowest price',
  price_desc: 'Highest price',
};

type UseDiscoverSearchProps = {
  user: AuthUser | null;
  listings: Listing[];
  scrollRef: React.RefObject<FlashListRef<Listing[]> | null>;
  gridYRef: React.RefObject<number>;
};

export function useDiscoverSearch({
  user,
  listings,
  scrollRef,
  gridYRef,
}: UseDiscoverSearchProps) {
  const toast = useToast();
  const qc = useQueryClient();

  const params = useLocalSearchParams<{
    q?: string;
    category?: Category;
    sub?: string;
    savedId?: string;
    tab?: string;
    sort?: string;
    n?: string;
  }>();

  const initialQuery = typeof params.q === 'string' ? params.q : '';
  const initialCat = typeof params.category === 'string' ? (params.category as CatTile['id']) : null;
  const initialSub = typeof params.sub === 'string' ? params.sub : null;
  const savedId = typeof params.savedId === 'string' ? params.savedId : null;

  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<DiscoverTab>('aesthetics');
  const [searchActive, setSearchActive] = useState(false);
  const [activeCat, setActiveCat] = useState<CatTile['id'] | null>(initialCat);
  const [activeSub, setActiveSub] = useState<string | null>(initialSub);
  const [sort, setSort] = useState<SortKey | null>(null);
  const [digestSort, setDigestSort] = useState<GridTheme | null>(null);
  const [savingSearch, setSavingSearch] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const [searchFilters, setSearchFilters] = useState<SearchFilterState>(() => ({
    ...EMPTY_SEARCH_FILTERS,
    category: (initialCat && initialCat !== 'trending' ? initialCat : null) as Category | null,
    subcategory: initialSub,
    sort: null,
  }));

  const [serverResults, setServerResults] = useState<Listing[] | null>(null);
  const [userResults, setUserResults] = useState<Awaited<ReturnType<typeof searchUsers>>[number][]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  const [activeTag, setActiveTag] = useState<string | null>(null);

  // ── URL Params Synchronization ───────────────────────────────────────────
  useEffect(() => {
    const nextQ = typeof params.q === 'string' ? params.q : '';
    setQuery(nextQ);

    const hasCat = typeof params.category === 'string';
    let catId: CatTile['id'] | null = null;
    let subId: string | null = null;
    if (hasCat) {
      const isValid = CATEGORY_TILES.some((t) => t.id === params.category);
      catId = isValid ? (params.category as CatTile['id']) : null;
      setActiveCat(catId);
      const sub = typeof params.sub === 'string' ? params.sub : null;
      subId = sub && getCategory(catId)?.subs.some((s) => s.id === sub) ? sub : null;
      setActiveSub(subId);
    } else {
      setActiveCat(null);
      setActiveSub(null);
    }

    const wantSort = SORT_KEYS.find((s) => s === params.sort) ?? null;
    if (wantSort) setSort(wantSort);
    else if (hasCat) setSort(null);

    const wantTab = HUB_TABS.find((t) => t === params.tab) ?? null;
    if (wantTab) setTab(wantTab);
    else if (nextQ || hasCat || wantSort) setTab('items');

    setSearchFilters((prev) => ({
      ...prev,
      category: (catId && catId !== 'trending' ? catId : null) as Category | null,
      subcategory: subId,
      sort: wantSort,
    }));
  }, [params.q, params.category, params.sub, params.tab, params.sort, params.n]);

  // ── Touch Saved Search Seen ──────────────────────────────────────────────
  useEffect(() => {
    if (!savedId) return;
    touchSavedSearchSeen(savedId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['savedSearchMatches'] });
      })
      .catch(() => {});
  }, [savedId, qc]);

  const browseCat = (searchFilters.category || (activeCat && activeCat !== 'trending' ? activeCat : null)) as Category | null;
  const browseSub = searchFilters.subcategory || (browseCat ? activeSub : null);
  const browseSubs = browseCat ? getCategory(browseCat)?.subs ?? [] : [];

  // ── Debounced Server Search ──────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setServerResults(null);
      setUserResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      const [res, users] = await Promise.all([
        searchListings({ query: q, category: browseCat, limit: 60 }),
        searchUsers(q, 20),
      ]);
      if (seq !== searchSeq.current) return;
      if (res.ok) {
        setServerResults(res.rows);
        capture('search_performed', buildSearchProps(q, browseCat, res.rows.length));
      }
      setUserResults(users);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, browseCat]);

  // ── Save Search ──────────────────────────────────────────────────────────
  const currentSaveKey = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cat = browseCat ?? '';
    if (!q && !cat) return null;
    return `${q}|${cat}`;
  }, [query, browseCat]);

  const handleSaveSearch = useCallback(async () => {
    if (!user) {
      toast.show('Sign in to save searches', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (!currentSaveKey || savingSearch) return;
    setSavingSearch(true);

    const queryValue = query.trim() || null;
    let row: Awaited<ReturnType<typeof createSavedSearch>> | null = null;
    try {
      row = await createSavedSearch({
        userId: user.id,
        query: queryValue,
        category: browseCat as Category | null,
        gender: null,
      });
    } catch {
      row = null;
    }

    if (!row) {
      toast.show("Couldn't save the search", { variant: 'default', icon: 'alert-triangle' });
    } else {
      setSavedKey(currentSaveKey);
      toast.show('Search saved', { variant: 'success', icon: 'bookmark' });
    }
    setSavingSearch(false);
  }, [user, currentSaveKey, savingSearch, query, browseCat, toast]);

  const canSaveSearch = !!currentSaveKey && currentSaveKey !== savedKey;
  const hasQuery = query.trim().length > 0;

  // ── Derived Results ──────────────────────────────────────────────────────
  const clientFiltered = useMemo(() => {
    let rows = Array.isArray(listings) ? listings : [];
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      rows = rows.filter(
        (l) =>
          l &&
          ((l.title && l.title.toLowerCase().includes(q)) ||
            (l.brand && l.brand.toLowerCase().includes(q)) ||
            (l.description && l.description.toLowerCase().includes(q))),
      );
    }
    return rows;
  }, [listings, query]);

  const rawResults = hasQuery && serverResults !== null ? serverResults : clientFiltered;

  // ── Multi-criteria Post-Search Filtering ────────────────────────────────
  const results = useMemo(() => {
    let list = rawResults;

    // Filter by category
    if (searchFilters.category) {
      list = list.filter((l) => l && l.category === searchFilters.category);
    }

    // Filter by subcategory
    if (searchFilters.subcategory) {
      list = list.filter((l) => l && l.subcategory === searchFilters.subcategory);
    }

    // Filter by brand
    if (searchFilters.brand) {
      const bLower = searchFilters.brand.toLowerCase();
      list = list.filter((l) => l && l.brand && l.brand.toLowerCase().includes(bLower));
    }

    // Filter by sizes
    if (searchFilters.sizes.length > 0) {
      list = list.filter((l) => l && l.size && searchFilters.sizes.includes(l.size));
    }

    // Filter by conditions
    if (searchFilters.conditions.length > 0) {
      list = list.filter((l) => l && l.condition && searchFilters.conditions.includes(l.condition));
    }

    // Filter by price min / max
    if (searchFilters.priceMin != null) {
      list = list.filter((l) => l && l.price >= searchFilters.priceMin!);
    }
    if (searchFilters.priceMax != null) {
      list = list.filter((l) => l && l.price <= searchFilters.priceMax!);
    }

    // Filter by color
    if (searchFilters.color) {
      const colLower = searchFilters.color.toLowerCase();
      list = list.filter((l) => l && l.color && l.color.toLowerCase() === colLower);
    }

    // Filter by material
    if (searchFilters.material) {
      const matLower = searchFilters.material.toLowerCase();
      list = list.filter(
        (l) =>
          l &&
          ((l.description && l.description.toLowerCase().includes(matLower)) ||
            (Array.isArray(l.tags) &&
              l.tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(matLower)))),
      );
    }

    // Sorting
    const activeSort = searchFilters.sort || sort;
    if (activeSort) {
      list = [...list];
      if (activeSort === 'price_asc') {
        list.sort((a, b) => a.price - b.price);
      } else if (activeSort === 'price_desc') {
        list.sort((a, b) => b.price - a.price);
      } else if (activeSort === 'newest') {
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (activeSort === 'popular') {
        list.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
      }
    }

    return list;
  }, [rawResults, searchFilters, sort]);

  const activeFilterCount = useMemo(() => countActiveSearchFilters(searchFilters), [searchFilters]);

  const updateFilter = useCallback(
    (updater: (prev: SearchFilterState) => SearchFilterState) => {
      const next = updater(searchFilters);
      if (next.category !== activeCat) {
        setActiveCat(next.category);
      }
      if (next.subcategory !== activeSub) {
        setActiveSub(next.subcategory);
      }
      if (next.sort !== sort) {
        setSort(next.sort);
      }
      setSearchFilters(next);
    },
    [searchFilters, activeCat, activeSub, sort],
  );


  const resetFilters = useCallback(() => {
    setSearchFilters(EMPTY_SEARCH_FILTERS);
    setActiveCat(null);
    setActiveSub(null);
    setSort(null);
  }, []);

  const sortOnly = !hasQuery && !browseCat && !!sort;
  const idle = !hasQuery && !browseCat && !sortOnly;

  // In-place theme sorting for the idle grid
  const gridResults = useMemo(() => {
    if (!idle || !digestSort) return results;
    const arr = [...results];
    if (digestSort === 'demand') {
      arr.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    } else {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return arr;
  }, [results, idle, digestSort]);

  // Reset tag selection when search term changes
  useEffect(() => {
    if (hasQuery) setActiveTag(null);
  }, [hasQuery]);

  const openTag = useCallback(
    (tag: string) => {
      setActiveTag(tag);
      setSearchActive(false);
      Keyboard.dismiss();
      scrollRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [scrollRef],
  );

  const openBrand = useCallback((brand: string) => {
    setTab('items');
    setQuery(brand);
    setSearchActive(false);
    Keyboard.dismiss();
  }, []);

  const handleDigestPress = useCallback(
    (card: DigestCard) => {
      const target = card.target;
      if (target.kind === 'category') {
        setActiveCat(target.category);
        setSearchFilters((prev) => ({ ...prev, category: target.category }));
        return;
      }
      setDigestSort(target.theme);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToOffset({
          offset: Math.max(0, (gridYRef.current ?? 0) - 8),
          animated: true,
        }),
      );
    },
    [scrollRef, gridYRef],
  );


  const handlePromoPress = useCallback(
    (target: PromoTarget) => {
      if (target.kind === 'listing') {
        router.push(`/product/${target.id}`);
        return;
      }
      if (target.kind === 'category') {
        setActiveCat(target.category);
        setSearchFilters((prev) => ({ ...prev, category: target.category }));
        return;
      }
      setDigestSort(target.theme);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToOffset({
          offset: Math.max(0, (gridYRef.current ?? 0) - 8),
          animated: true,
        }),
      );
    },
    [scrollRef, gridYRef],
  );

  const idleGridTitle = digestSort ? GRID_THEME_TITLE[digestSort] : 'Trending';
  const showSearchLanding = searchActive && !hasQuery;

  const selectSearchTerm = useCallback((term: string) => {
    setQuery(term);
    setSearchActive(false);
    Keyboard.dismiss();
  }, []);

  const clearCategory = useCallback(() => {
    setActiveCat(null);
    setActiveSub(null);
    setSort(null);
    setSearchFilters((prev) => ({
      ...prev,
      category: null,
      subcategory: null,
      sort: null,
    }));
  }, []);

  const shopAll = useCallback(() => {
    setQuery('');
    clearCategory();
    resetFilters();
    setDigestSort(null);
    setSearchActive(false);
    Keyboard.dismiss();
  }, [clearCategory, resetFilters]);

  const handleBrowse = useCallback(
    (action: BrowseAction) => {
      setSearchActive(false);
      Keyboard.dismiss();
      if (action.kind === 'saved') {
        router.push('/news' as any);
        return;
      }
      if (action.kind === 'tab') {
        setTab(action.tab);
        return;
      }
      setTab('items');
      clearCategory();
      setDigestSort(null);
      setSort(action.sort);
      setSearchFilters((prev) => ({ ...prev, sort: action.sort }));
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToOffset({
          offset: 0,
          animated: true,
        }),
      );
    },
    [clearCategory, scrollRef],
  );

  const handleTopic = useCallback(
    (action: TopicAction) => {
      setTab('items');
      setDigestSort(null);
      if (action.kind === 'all') {
        shopAll();
        return;
      }
      setActiveCat(action.category);
      setActiveSub(null);
      setSort(null);
      setSearchFilters((prev) => ({
        ...prev,
        category: action.category,
        subcategory: null,
        sort: null,
      }));
      setSearchActive(false);
      Keyboard.dismiss();
    },
    [shopAll],
  );

  const cancelSearch = useCallback(() => {
    setQuery('');
    setSearchActive(false);
    Keyboard.dismiss();
  }, []);

  return {
    query,
    setQuery,
    tab,
    setTab,
    searchActive,
    setSearchActive,
    activeCat,
    setActiveCat,
    activeSub,
    setActiveSub,
    sort,
    setSort,
    digestSort,
    setDigestSort,
    savingSearch,
    savedKey,
    canSaveSearch,
    handleSaveSearch,
    currentSaveKey,
    serverResults,
    userResults,
    searching,
    activeTag,
    setActiveTag,
    browseCat,
    browseSub,
    browseSubs,
    results,
    gridResults,
    hasQuery,
    sortOnly,
    idle,
    showSearchLanding,
    idleGridTitle,
    openTag,
    openBrand,
    handleDigestPress,
    handlePromoPress,
    selectSearchTerm,
    clearCategory,
    shopAll,
    handleBrowse,
    handleTopic,
    cancelSearch,
    searchFilters,
    updateFilter,
    resetFilters,
    activeFilterCount,
  };
}

