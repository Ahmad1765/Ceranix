import { capture, buildSearchProps } from '@/lib/analytics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated from 'react-native-reanimated';
import { ListingCard } from '@/components/ListingCard';
import { searchListings, type SortKey } from '@/lib/listings';
import { searchUsers } from '@/lib/follows';
import { CATEGORIES, getCategory, subcategoryLabel } from '@/lib/categories';
import { useQueryClient } from '@tanstack/react-query';
import {
  qk,
  useFeedListingsQuery,
  useRecommendationsQuery,
  useRecentlyViewedQuery,
  useBrandIndexQuery,
  useTagIndexQuery,
  useTagListingsQuery,
  useSuggestedFollowsQuery,
} from '@/lib/queries';
import { createSavedSearch, touchSavedSearchSeen } from '@/lib/savedSearches';
import type { TagIndexEntry } from '@/lib/searchIndex';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { colors, radii } from '@/lib/theme';
import { useGridDimensions, useTabBarClearance, HIT_SLOP_8 } from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import type { Category, Listing } from '@/types';
import { EmptyState, SectionHeader } from '@/components/ui';
import { useWebPullToRefresh, WebPullIndicator } from '@/components/WebRefresh';
import {
  WelcomeEyebrow,
  PromoBanner,
  TrendingSearches,
  DigestRail,
  DailyPicks,
  RecentlyViewedList,
  ShopByBrandRail,
} from '@/components/discover/EditorialFeed';
import {
  buildDigest,
  buildCollections,
  buildTrendingSearches,
  buildPromos,
  type DigestCard,
  type PromoTarget,
} from '@/lib/discover';
import {
  DiscoverSegments,
  AestheticsPanel,
  BrandsPanel,
  UsersPanel,
  HubTitle,
  type DiscoverTab,
  type BrandEntry,
} from '@/components/discover/SearchTabs';

type CatTile = {
  id: Category | 'trending';
  label: string;
  icon: keyof typeof Feather.glyphMap;
};

// Derived from the single-source taxonomy so tile icons/labels stay in lockstep
// with upload + the product page. 'Trending' is a Discover-only pseudo-category.
const CATEGORY_TILES: CatTile[] = [
  { id: 'trending', label: 'Trending', icon: 'trending-up' },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon })),
];

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price ↑' },
  { id: 'price_desc', label: 'Price ↓' },
  { id: 'popular', label: 'Popular' },
];

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const RAIL_CARD_WIDTH = 160;
const SEARCH_DEBOUNCE_MS = 300;
// Feature flag: the editorial "digest" rail on the idle feed. Disabled per
// product call; flip to re-enable the Now in demand / Fresh drops / edit cards.
const SHOW_DIGEST_RAIL = false;
// Stable empty reference so the grid's fallback doesn't churn useMemo deps when
// the query has no data yet.
const EMPTY_LISTINGS: Listing[] = [];

type UserResult = Awaited<ReturnType<typeof searchUsers>>[number];

export default function DiscoverScreen() {
  // Query params from /news Saved tab (and external links). When set, the
  // screen boots with the search pre-applied so the user lands on results.
  const params = useLocalSearchParams<{ q?: string; category?: Category; sub?: string; savedId?: string }>();
  const initialQuery = typeof params.q === 'string' ? params.q : '';
  const initialCat = typeof params.category === 'string' ? (params.category as CatTile['id']) : null;
  const initialSub = typeof params.sub === 'string' ? params.sub : null;
  const savedId = typeof params.savedId === 'string' ? params.savedId : null;

  const { user } = useAuth();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  // Search hub tab: Items keeps the classic feed + grid; Aesthetics / Brands /
  // Users are index-style panels. Query state is shared so a typed term
  // carries across tabs (search "zara" → flip between brand hits and sellers).
  const [tab, setTab] = useState<DiscoverTab>('aesthetics');
  // Search-as-hub: focusing the search bar opens a browse landing (categories +
  // trending searches) instead of cluttering the idle feed with them. We toggle
  // an explicit mode (not raw blur) so selecting a tile on web doesn't lose the
  // tap to a blur-driven unmount. The landing shows only while empty; typing
  // swaps to results.
  const [searchActive, setSearchActive] = useState(false);
  const [activeCat, setActiveCat] = useState<CatTile['id'] | null>(initialCat);
  // Subcategory + sort refine the category browse grid (eBay-style facets).
  const [activeSub, setActiveSub] = useState<string | null>(initialSub);
  const [sort, setSort] = useState<SortKey | null>(null);
  // Editorial digest "theme" applied to the trending grid (e.g. Now in demand /
  // Fresh drops). Reorders the idle grid in place; cleared via the grid header.
  const [digestSort, setDigestSort] = useState<'demand' | 'fresh' | null>(null);
  const [savingSearch, setSavingSearch] = useState(false);
  // We disable the Save CTA once the current query has been saved this
  // session to avoid spam — the underlying unique index would reject anyway.
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Server search: null = not searching (no query), array = authoritative
  // results for the current query. While a search is in flight we keep
  // showing the instant client-side filter so typing feels immediate.
  const [serverResults, setServerResults] = useState<Listing[] | null>(null);
  // People matching the query (username / full name). Empty when not searching.
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  // Bottom padding that clears the floating tab bar overlaying the results.
  const tabClear = useTabBarClearance();

  useEffect(() => {
    const nextQ = typeof params.q === 'string' ? params.q : '';
    setQuery(nextQ);

    const hasCat = typeof params.category === 'string';
    if (hasCat) {
      const isValid = CATEGORY_TILES.some(t => t.id === params.category);
      const catId = isValid ? (params.category as CatTile['id']) : null;
      setActiveCat(catId);
      // Only honor a sub param that actually belongs to the linked category.
      const sub = typeof params.sub === 'string' ? params.sub : null;
      setActiveSub(sub && getCategory(catId)?.subs.some((s) => s.id === sub) ? sub : null);
    } else {
      setActiveCat(null);
      setActiveSub(null);
    }

    // A deep-linked search or category (e.g. tapping Category on a product
    // page) must land on the Items grid — that's where results and category
    // filtering live. Without this the screen stays on the default Aesthetics
    // panel and the filter appears to do nothing.
    if (nextQ || hasCat) setTab('items');
  }, [params.q, params.category, params.sub]);

  // When the screen mounts with a savedId param, mark that search seen so
  // the "N new" badge clears once the user actually opens it.
  useEffect(() => {
    if (savedId) touchSavedSearchSeen(savedId).catch(() => {});
  }, [savedId]);

  const fade = useFadeIn(0, 320);

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const browseCat = activeCat && activeCat !== 'trending' ? activeCat : null;
  const browseSub = browseCat ? activeSub : null;
  // Subcategories available for the current browse category (chip row).
  const browseSubs = browseCat ? getCategory(browseCat)?.subs ?? [] : [];

  // React Query owns the grid + personalized rails. staleTime (60s) reproduces
  // the old isFresh() gate; the three reads dedupe and cache independently so
  // the grid skeleton no longer waits on the recommendation pipeline.
  const gridQ = useFeedListingsQuery({
    tab: 'popular',
    category: browseCat,
    subcategory: browseSub,
    sort,
    limit: 60,
  });
  const recQ = useRecommendationsQuery(user?.id ?? null, 12);
  const recentQ = useRecentlyViewedQuery(user?.id ?? null, 10);

  const listings = gridQ.data ?? EMPTY_LISTINGS;
  const recommended = recQ.data ?? EMPTY_LISTINGS;
  const recentlyViewed = recentQ.data ?? EMPTY_LISTINGS;
  const loading = gridQ.isLoading;
  const recLoading = recQ.isLoading;
  const recentLoading = recentQ.isLoading;
  const refreshing = gridQ.isRefetching;

  // Destructure the stable refetch fns + isStale snapshots so the callbacks
  // below depend on primitives, not the per-render query objects.
  const { isStale: gridStale, refetch: gridRefetch } = gridQ;
  const { isStale: recStale, refetch: recRefetch } = recQ;
  const { isStale: recentStale, refetch: recentRefetch } = recentQ;

  // Revalidate on focus, but only queries that have gone stale — fresh data is
  // reused so bouncing between tabs doesn't spam the backend (the old freshness
  // gate, now driven by React Query's staleTime).
  useFocusEffect(
    useCallback(() => {
      if (gridStale) gridRefetch();
      if (recStale) recRefetch();
      if (recentStale) recentRefetch();
    }, [gridStale, gridRefetch, recStale, recRefetch, recentStale, recentRefetch]),
  );

  const qc = useQueryClient();
  const onRefresh = useCallback(async () => {
    // The search-hub indexes are invalidated (not refetched): active tabs
    // refetch immediately, gated tabs pick up fresh data on next open.
    qc.invalidateQueries({ queryKey: qk.brandIndex() });
    qc.invalidateQueries({ queryKey: qk.tagIndex() });
    qc.invalidateQueries({ queryKey: qk.suggestedFollows(user?.id ?? null) });
    await Promise.all([gridRefetch(), recRefetch(), recentRefetch()]);
  }, [gridRefetch, recRefetch, recentRefetch, qc, user?.id]);

  // Web pull-to-refresh — RefreshControl is inert on react-native-web.
  const { scrollRef, pull, nodeTop, threshold, contentStyle } = useWebPullToRefresh({ refreshing, onRefresh });

  // Debounced server-side search across the whole catalog. Client filtering
  // below gives instant feedback; this replaces it with authoritative rows.
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
      // Items + people in parallel — one debounce window covers both.
      const [res, users] = await Promise.all([
        searchListings({ query: q, category: browseCat, limit: 60 }),
        searchUsers(q, 20),
      ]);
      if (seq !== searchSeq.current) return; // a newer keystroke superseded us
      if (res.ok) {
        setServerResults(res.rows);
        capture('search_performed', buildSearchProps(q, browseCat, res.rows.length));
      }
      setUserResults(users);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, browseCat]);

  // Compose a normalised key for "have we already saved this in this session".
  // Lower-cased query + category so case differences don't allow dupes.
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
    try {
      const row = await createSavedSearch({
        userId: user.id,
        query: query.trim() || null,
        category: browseCat as Category | null,
        gender: null,
      });
      if (!row) {
        toast.show("Couldn't save the search", { variant: 'default', icon: 'alert-triangle' });
        return;
      }
      setSavedKey(currentSaveKey);
      toast.show('Search saved', { variant: 'success', icon: 'bookmark' });
    } catch {
      toast.show("Couldn't save the search", { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setSavingSearch(false);
    }
  }, [user, currentSaveKey, savingSearch, query, browseCat, toast]);

  const canSaveSearch = !!currentSaveKey && currentSaveKey !== savedKey;

  const hasQuery = query.trim().length > 0;

  // Instant local filter over loaded rows; superseded by serverResults when
  // the debounced search lands.
  const clientFiltered = useMemo(() => {
    let rows = listings;
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      rows = rows.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.brand?.toLowerCase().includes(q) ?? false) ||
          (l.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  }, [listings, query]);

  const results = hasQuery && serverResults !== null ? serverResults : clientFiltered;
  // Idle = browsing, not searching: the editorial feed (welcome, digest, picks,
  // collections) is shown only here so search results stay focused on the query.
  const idle = !hasQuery && !browseCat;

  // Editorial blocks derived from the already-loaded trending grid — no extra
  // fetches. Recomputed only when the listing set changes.
  const digest = useMemo(() => buildDigest(listings), [listings]);
  const collections = useMemo(() => buildCollections(listings), [listings]);
  const trendingSearches = useMemo(() => buildTrendingSearches(listings), [listings]);
  const promos = useMemo(() => buildPromos(listings), [listings]);
  // Personalized picks rail: recommendations when we have them, otherwise the
  // top of the trending grid so the rail is never empty (logged-out / cold).
  const picks = recommended.length > 0 ? recommended : listings.slice(0, 10);

  // ── Search-hub indexes ── fetched from the server the first time their tab
  // opens (enabled gate), then cached by React Query. Each panel falls back to
  // rows derived from the already-loaded grid until the authoritative index
  // lands, so switching tabs never shows a blank screen.
  const tagIdxQ = useTagIndexQuery(tab === 'aesthetics');
  const brandIdxQ = useBrandIndexQuery(tab === 'brands');
  const suggestedQ = useSuggestedFollowsQuery(user?.id ?? null, tab === 'users' && !hasQuery);

  // ── Aesthetics tab ── the catalog-wide tag index (every hashtag actually in
  // use), grid-derived rows filling in while it loads, same fallback story as
  // the Brands tab below. No curated list: a tag exists here exactly as long
  // as a live listing carries it. Sorted alphabetically — a browsable index
  // to skim, not a trending rail (the RPC's own count ranking is discarded).
  const tagResults = useMemo<TagIndexEntry[]>(() => {
    let rows: TagIndexEntry[];
    if (tagIdxQ.data) {
      rows = tagIdxQ.data;
    } else {
      const counts = new Map<string, TagIndexEntry>();
      for (const l of listings) {
        if (l.is_sold) continue;
        for (const raw of l.tags ?? []) {
          const tag = raw.trim().toLowerCase();
          if (!tag) continue;
          const cur = counts.get(tag);
          if (cur) cur.count += 1;
          else counts.set(tag, { tag, count: 1, image: l.images?.[0] ?? null });
        }
      }
      rows = [...counts.values()];
    }
    rows = [...rows].sort((a, b) => a.tag.localeCompare(b.tag));
    const q = query.trim().toLowerCase();
    return q ? rows.filter((t) => t.tag.includes(q)) : rows;
  }, [tagIdxQ.data, listings, query]);

  // ── Brands tab ── the catalog-wide index (every live brand, ranked by stock
  // depth), filtered client-side per keystroke so typing is zero-latency.
  // Until the index arrives, brands seen in the loaded grid stand in.
  const brandResults = useMemo<BrandEntry[]>(() => {
    let rows: BrandEntry[];
    if (brandIdxQ.data) {
      rows = brandIdxQ.data;
    } else {
      const counts = new Map<string, BrandEntry>();
      for (const l of listings) {
        const name = l.brand?.trim();
        if (!name || l.is_sold) continue;
        const key = name.toLowerCase();
        const cur = counts.get(key);
        if (cur) cur.count += 1;
        else counts.set(key, { name, count: 1, image: l.images?.[0] ?? null });
      }
      rows = [...counts.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
      );
    }
    const q = query.trim().toLowerCase();
    return q ? rows.filter((b) => b.name.toLowerCase().includes(q)) : rows;
  }, [brandIdxQ.data, listings, query]);

  const suggested = suggestedQ.data ?? null;

  // Tapping a tag opens an in-tab detail: the listings carrying it (same
  // membership test as the index), so the number shown is the number
  // delivered. Typing exits the detail back to the filtered index.
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const tagListingsQ = useTagListingsQuery(activeTag);
  useEffect(() => {
    if (hasQuery) setActiveTag(null);
  }, [hasQuery]);

  const openTag = useCallback(
    (tag: string) => {
      setActiveTag(tag);
      setSearchActive(false);
      Keyboard.dismiss();
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    },
    [scrollRef],
  );

  // A brand tap converts into a regular item search so results reuse the whole
  // existing pipeline (server search, save-search, grid).
  const openBrand = useCallback((brand: string) => {
    setTab('items');
    setQuery(brand);
    setSearchActive(false);
    Keyboard.dismiss();
  }, []);

  // Apply the active digest theme to the idle grid in place.
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

  // Y offset of the grid section so a digest theme tap can scroll the user to
  // the reordered results.
  const gridY = useRef(0);
  const handleDigestPress = useCallback(
    (card: DigestCard) => {
      if (card.target.kind === 'category') {
        setActiveCat(card.target.category);
        return;
      }
      setDigestSort(card.target.theme);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo?.({ y: Math.max(0, gridY.current - 8), animated: true }),
      );
    },
    [scrollRef],
  );

  // Promo banner taps: open a product, jump into a category, or apply a theme
  // sort and scroll the user to the reordered grid (mirrors the digest cards).
  const handlePromoPress = useCallback(
    (target: PromoTarget) => {
      if (target.kind === 'listing') {
        router.push(`/product/${target.id}`);
        return;
      }
      if (target.kind === 'category') {
        setActiveCat(target.category);
        return;
      }
      setDigestSort(target.theme);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo?.({ y: Math.max(0, gridY.current - 8), animated: true }),
      );
    },
    [scrollRef],
  );

  const idleGridTitle =
    digestSort === 'demand' ? 'Now in demand' : digestSort === 'fresh' ? 'Fresh drops' : 'Trending';

  // The browse landing only makes sense for item search, so other tabs skip it.
  const showSearchLanding = searchActive && !hasQuery && tab === 'items';

  const selectSearchTerm = useCallback((term: string) => {
    setQuery(term);
    setSearchActive(false);
    Keyboard.dismiss();
  }, []);

  // Clear category browse entirely (category + subcategory + sort).
  const clearCategory = useCallback(() => {
    setActiveCat(null);
    setActiveSub(null);
    setSort(null);
  }, []);

  const shopAll = useCallback(() => {
    setQuery('');
    clearCategory();
    setDigestSort(null);
    setSearchActive(false);
    Keyboard.dismiss();
  }, [clearCategory]);

  const pickCategory = useCallback((id: CatTile['id']) => {
    setActiveCat((cur) => (cur === id ? null : id));
    // Switching category invalidates any subcategory/sort chosen under the old one.
    setActiveSub(null);
    setSort(null);
    setSearchActive(false);
    Keyboard.dismiss();
  }, []);

  const cancelSearch = useCallback(() => {
    setQuery('');
    setSearchActive(false);
    Keyboard.dismiss();
  }, []);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
        contentContainerStyle={[{ paddingBottom: tabClear }, contentStyle]}
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: 4,
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
            Discover
          </Text>
          <Pressable
            hitSlop={HIT_SLOP_8}
            onPress={() => router.push('/news' as any)}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.panel,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="bell" size={16} color={colors.ink} />
          </Pressable>
        </View>

        {/* Search — focusing it opens the browse landing below. */}
        <Animated.View
          style={[
            {
              marginHorizontal: 16,
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            },
            fade,
          ]}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.panel,
              borderRadius: radii.pill,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 6,
              height: 46,
            }}
          >
            <Feather name="search" size={18} color={colors.muteSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearchActive(true)}
              placeholder={
                tab === 'aesthetics'
                  ? 'Search aesthetics'
                  : tab === 'brands'
                    ? 'Search brands'
                    : tab === 'users'
                      ? 'Search people'
                      : 'Search items, brands, sellers'
              }
              placeholderTextColor={colors.muteSoft}
              style={{
                flex: 1,
                marginLeft: 10,
                fontSize: 14.5,
                color: colors.ink,
                padding: 0,
                // RN-Web only: kill the browser's default input focus ring.
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching ? (
              <ActivityIndicator size="small" color={colors.purple} style={{ marginRight: 4 }} />
            ) : null}
            {query.length > 0 && (
              <Pressable hitSlop={HIT_SLOP_8} onPress={() => setQuery('')}>
                <Feather name="x" size={16} color={colors.muteSoft} />
              </Pressable>
            )}
          </View>
          {searchActive ? (
            <Pressable hitSlop={HIT_SLOP_8} onPress={cancelSearch} accessibilityRole="button">
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.purple }}>Cancel</Text>
            </Pressable>
          ) : null}
        </Animated.View>

        {/* Search hub tabs — Items keeps the classic feed; the rest are
            index-style panels over the same shared query. */}
        <DiscoverSegments tab={tab} onChange={setTab} />

        {/* ── Aesthetics ── live tag index; tapping a tile opens the listings
            carrying that tag in place. */}
        {tab === 'aesthetics' ? (
          activeTag ? (
            <View style={{ marginTop: 16 }}>
              <SectionHeader
                title={`#${activeTag}`}
                count={tagListingsQ.data?.length ?? undefined}
                action={{ label: 'All aesthetics', onPress: () => setActiveTag(null) }}
              />
              {tagListingsQ.isLoading ? (
                <GridSkeleton columns={columns} cardW={cardW} />
              ) : (tagListingsQ.data ?? []).length === 0 ? (
                <EmptyState
                  icon="hash"
                  title={`No #${activeTag} items yet`}
                  description="Nothing in the catalog carries this tag right now — check back soon."
                />
              ) : (
                <GridSection
                  listings={tagListingsQ.data ?? []}
                  columns={columns}
                  cardW={cardW}
                />
              )}
            </View>
          ) : (loading || tagIdxQ.isLoading) && tagResults.length === 0 ? (
            <AestheticsSkeleton />
          ) : tagResults.length === 0 ? (
            <EmptyState
              icon="hash"
              title={hasQuery ? 'No tag matched' : 'No aesthetics yet'}
              description={
                hasQuery
                  ? 'Try a different word or a shorter spelling.'
                  : 'Aesthetics appear here as sellers tag their listings.'
              }
            />
          ) : (
            <>
              {!hasQuery ? (
                <HubTitle title={`Browse all ${tagResults.length} Aesthetics`} />
              ) : (
                <View style={{ height: 18 }} />
              )}
              <AestheticsPanel tags={tagResults} onOpen={openTag} />
            </>
          )
        ) : null}

        {/* ── Brands ── every brand in the live catalog, filtered by the query. */}
        {tab === 'brands' ? (
          (loading || brandIdxQ.isLoading) && brandResults.length === 0 ? (
            <BrandsSkeleton />
          ) : brandResults.length === 0 ? (
            <EmptyState
              icon="tag"
              title={hasQuery ? 'No brand matched' : 'No brands yet'}
              description={
                hasQuery
                  ? 'Try a different spelling or a shorter name.'
                  : 'Brands appear here as items are listed.'
              }
            />
          ) : (
            <>
              {!hasQuery ? (
                <HubTitle eyebrow="Ranked by live stock" title="Trending brands" />
              ) : (
                <View style={{ height: 10 }} />
              )}
              <BrandsPanel brands={brandResults} onSelect={openBrand} />
            </>
          )
        ) : null}

        {/* ── Users ── seller search with inline follow; suggestions when idle. */}
        {tab === 'users' ? (
          hasQuery ? (
            searching && userResults.length === 0 ? (
              <PeopleSkeleton />
            ) : userResults.length === 0 ? (
              <EmptyState
                icon="users"
                title="No one matched"
                description="Try a username or full name."
              />
            ) : (
              <View style={{ marginTop: 10 }}>
                <UsersPanel users={userResults} viewerId={user?.id ?? null} />
              </View>
            )
          ) : suggested === null ? (
            <PeopleSkeleton />
          ) : suggested.length === 0 ? (
            <EmptyState
              icon="users"
              title="No sellers yet"
              description="Sellers show up here as the community grows."
            />
          ) : (
            <View>
              <HubTitle eyebrow="People to follow" title="Suggested sellers" />
              <UsersPanel users={suggested} viewerId={user?.id ?? null} />
            </View>
          )
        ) : null}

        {/* Search-focus landing — browse tools (categories + trending searches)
            live here instead of the idle feed, so Discover stays editorial. */}
        {showSearchLanding ? (
        <View style={{ marginTop: 20 }}>
          <View
            style={{
              paddingHorizontal: 16,
              marginBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
              Browse by category
            </Text>
            {activeCat && (
              <Pressable hitSlop={HIT_SLOP_8} onPress={clearCategory}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.purple }}>Clear</Text>
              </Pressable>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
          >
            {CATEGORY_TILES.map((cat) => {
              const active = activeCat === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => pickCategory(cat.id)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    width: 64,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: active ? colors.purple : colors.purpleSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather
                      name={cat.icon}
                      size={20}
                      color={active ? 'white' : colors.purple}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: active ? colors.purple : colors.ink,
                      marginTop: 6,
                    }}
                    numberOfLines={1}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <TrendingSearches
            terms={trendingSearches}
            onSelect={selectSearchTerm}
            onShopAll={shopAll}
          />
        </View>
        ) : null}

        {/* Everything below the landing — Items tab only, hidden while the
            browse landing is open. */}
        {tab === 'items' && !showSearchLanding ? (
        <>
        {/* Save-search CTA — only shown when the current query + category
            represent a real filter the user could meaningfully come back to. */}
        {currentSaveKey ? (
          <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
            <Pressable
              onPress={handleSaveSearch}
              disabled={!canSaveSearch || savingSearch}
              testID="discover-save-search"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: radii.pill,
                backgroundColor: canSaveSearch ? colors.purpleSoft : colors.panel,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {savingSearch ? (
                <ActivityIndicator size="small" color={colors.purple} />
              ) : (
                <Feather
                  name={canSaveSearch ? 'bookmark' : 'check'}
                  size={14}
                  color={colors.purple}
                />
              )}
              <Text
                style={{
                  marginLeft: 8,
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.purple,
                }}
              >
                {savingSearch
                  ? 'Saving…'
                  : canSaveSearch
                    ? 'Save this search'
                    : 'Saved — find it under Activity'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Editorial feed — welcome, digest, picks, recently viewed, shop by brand.
            Idle browse only; search / category states render results instead. */}
        {idle ? (
          <>
            <PromoBanner slides={promos} onPress={handlePromoPress} />

            {/* "Today's edit" heading + digest rail ("Now in demand" / "Fresh
                drops" / edits) disabled together — the heading titles the rail. */}
            {SHOW_DIGEST_RAIL ? (
              <>
                <WelcomeEyebrow />
                {loading && digest.length === 0 ? (
                  <View style={{ marginTop: 16 }}>
                    <RailSkeleton />
                  </View>
                ) : (
                  <DigestRail cards={digest} onPress={handleDigestPress} />
                )}
              </>
            ) : null}

            {recLoading ? (
              <View style={{ marginTop: 26 }}>
                <SectionHeader title="Daily picks for you" />
                <RailSkeleton />
              </View>
            ) : (
              <DailyPicks
                listings={picks}
                onSeeMore={() => router.push('/(tabs)' as any)}
                testID="discover-daily-picks"
              />
            )}

            {user && recentlyViewed.length > 0 && !recentLoading ? (
              <RecentlyViewedList listings={recentlyViewed} testID="discover-recently-viewed" />
            ) : null}

            <ShopByBrandRail collections={collections} onPress={(brand) => setQuery(brand)} />
          </>
        ) : null}

        {/* People matching the query moved to the Users tab — surface a one-tap
            pointer so a seller search typed here still lands. */}
        {hasQuery && userResults.length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
            <Pressable
              onPress={() => setTab('users')}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.hair,
                backgroundColor: pressed ? colors.panel : colors.white,
              })}
            >
              <Feather name="users" size={14} color={colors.purple} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink }}>
                {userResults.length === 1
                  ? '1 person matches'
                  : `${userResults.length} people match`}{' '}
                “{query.trim()}”
              </Text>
              <Feather name="chevron-right" size={16} color={colors.muteSoft} />
            </Pressable>
          </View>
        ) : null}

        {/* Results — also the idle "Trending" grid (reorderable via digest). */}
        <View
          style={{ marginTop: 22 }}
          onLayout={(e) => {
            gridY.current = e.nativeEvent.layout.y;
          }}
        >
          {browseCat && !hasQuery ? (
            // Category browse — subcategory chips + sort refine the grid; the
            // header owns the Clear back out to the full catalog.
            <>
              <SectionHeader
                title={
                  activeSub
                    ? subcategoryLabel(browseCat, activeSub)
                    : `In ${CATEGORY_TILES.find((c) => c.id === browseCat)?.label}`
                }
                count={results.length}
                action={{ label: 'Clear', onPress: clearCategory }}
              />

              {/* Subcategory chips */}
              {browseSubs.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 4, paddingBottom: 8 }}
                >
                  {[{ id: null as string | null, label: 'All' }, ...browseSubs].map((s) => {
                    const on = activeSub === s.id;
                    return (
                      <Pressable
                        key={s.id ?? '__all'}
                        onPress={() => setActiveSub(on ? null : s.id)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 999,
                          backgroundColor: on ? colors.purple : colors.panel,
                          transform: [{ scale: pressed ? 0.96 : 1 }],
                        })}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? colors.white : colors.ink }}>
                          {s.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              {/* Sort */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12, alignItems: 'center' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 2 }}>
                  <Feather name="sliders" size={12} color={colors.muteSoft} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muteSoft, letterSpacing: 0.4 }}>
                    SORT
                  </Text>
                </View>
                {SORT_OPTIONS.map((o) => {
                  const on = (sort ?? 'popular') === o.id;
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => setSort(o.id)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: on ? colors.purple : colors.hair,
                        backgroundColor: on ? colors.purpleSoft : colors.white,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? colors.purple : colors.ink }}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : idle && digestSort ? (
            <SectionHeader
              title={idleGridTitle}
              count={gridResults.length}
              action={{ label: 'Clear', onPress: () => setDigestSort(null) }}
            />
          ) : (
            <SectionHeader
              title={hasQuery ? 'Items' : idleGridTitle}
              count={(idle ? gridResults : results).length}
              rightText={(idle ? gridResults : results).length === 1 ? 'item' : 'items'}
            />
          )}

          {loading ? (
            <GridSkeleton columns={columns} cardW={cardW} />
          ) : (idle ? gridResults : results).length === 0 ? (
            searching ? (
              <GridSkeleton columns={columns} cardW={cardW} />
            ) : hasQuery && userResults.length > 0 ? (
              // People matched even though no items did — don't contradict that
              // with a "nothing matched" panel.
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <Text style={{ fontSize: 13, color: colors.muteSoft }}>
                  No items matched “{query.trim()}”.
                </Text>
              </View>
            ) : (
              <EmptyState
                icon="search"
                title="Nothing matched"
                description="Try a different word, brand, or category."
              />
            )
          ) : (
            <GridSection listings={idle ? gridResults : results} columns={columns} cardW={cardW} />
          )}
        </View>
        </>
        ) : null}
      </ScrollView>
      <WebPullIndicator pull={pull} refreshing={refreshing} nodeTop={nodeTop} threshold={threshold} />
    </SafeAreaView>
  );
}

// Loading rows for the Users tab — avatar disc + two text bars, matching the
// real row's footprint so the loaded list doesn't jump.
function PeopleSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 18 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.divider }} />
          <View style={{ flex: 1, gap: 7 }}>
            <View style={{ width: '45%', height: 12, borderRadius: 6, backgroundColor: colors.divider }} />
            <View style={{ width: '30%', height: 10, borderRadius: 5, backgroundColor: colors.divider }} />
          </View>
          <View style={{ width: 76, height: 32, borderRadius: radii.pill, backgroundColor: colors.divider }} />
        </View>
      ))}
    </View>
  );
}

// Loading blocks for the Brands tab — same ink hero-card silhouette as the
// real cards so the loaded state doesn't jump.
function BrandsSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 14, marginTop: 10 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ height: 200, borderRadius: radii['3xl'], backgroundColor: colors.divider }} />
      ))}
    </View>
  );
}

// Loading tiles for the Aesthetics tab — same panel-row tile shape as the
// real grid so the loaded state doesn't jump.
function AestheticsSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{ width: '48%', height: 78, borderRadius: radii.xl, backgroundColor: colors.divider }} />
      ))}
    </View>
  );
}

function RailSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: GRID_GAP, paddingHorizontal: HORIZONTAL_PAD }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonTile key={i} width={RAIL_CARD_WIDTH} />
      ))}
    </View>
  );
}

// Two skeleton rows instead of one: matches the density of the real grid so
// the loaded state doesn't cause a layout jump.
function GridSkeleton({ columns, cardW }: { columns: number; cardW: number }) {
  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}>
      {Array.from({ length: 2 }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: GRID_GAP }}>
          {Array.from({ length: columns }).map((_, i) => (
            <SkeletonTile key={i} width={cardW} />
          ))}
        </View>
      ))}
    </View>
  );
}

function GridSection({ listings, columns, cardW }: { listings: Listing[]; columns: number; cardW: number }) {
  const rows: Listing[][] = [];
  for (let i = 0; i < listings.length; i += columns) {
    rows.push(listings.slice(i, i + columns));
  }
  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: GRID_GAP }}>
          {row.map((listing, ci) => (
            <GridCard key={listing.id} index={ri * columns + ci} width={cardW}>
              <ListingCard listing={listing} />
            </GridCard>
          ))}
          {row.length < columns &&
            Array.from({ length: columns - row.length }).map((_, i) => (
              <View key={`pad-${i}`} style={{ width: cardW }} />
            ))}
        </View>
      ))}
    </View>
  );
}

function GridCard({ index, width, children }: { index: number; width: number; children: React.ReactNode }) {
  return <View style={{ width }}>{children}</View>;
}

function SkeletonTile({ width }: { width: number }) {
  return (
    <View style={{ width }}>
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: radii.md,
          backgroundColor: colors.divider,
        }}
      />
    </View>
  );
}
