import { useCallback, useMemo, useState } from 'react';
import { Alert, View, Pressable, ScrollView, RefreshControl } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors, radii } from '@/lib/theme';
import type { RecommendedListing } from '@/lib/recommendations';
import { PriceDropCard } from '@/components/PriceDropCard';
import { type SavedSearch } from '@/lib/savedSearches';
import { ListingCard } from '@/components/ListingCard';
import { DropAlertSheet } from '@/components/DropAlertSheet';
import {
  FeedFilterSheet,
  EMPTY_FEED_FILTERS,
  countActiveFilters,
  type FeedFilters,
} from '@/components/FeedFilterSheet';
import { useWebPullToRefresh, WebPullIndicator } from '@/components/WebRefresh';
import {
  useMyFeedListingsQuery,
  useFeedListingsQuery,
  usePriceDropsQuery,
  useSavedSearchesQuery,
  useSavedListingsQuery,
  useDeleteSavedSearch,
} from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { useGridDimensions, useTabBarClearance, HIT_SLOP_8 } from '@/lib/responsive';
import type { Category, Listing } from '@/types';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const FOR_YOU: 'for-you' = 'for-you';
const TRENDING: 'trending' = 'trending';
const SAVED: 'saved' = 'saved';

// Mirrors the CHECK constraint on listings.category in setup.sql. Saved
// searches may hold arbitrary strings (the UI also stores pseudo-categories
// like "trending"), so any value not in this set is silently ignored when
// filtering the visible grid.
const VALID_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'clothing', 'shoes', 'bags', 'accessories', 'electronics', 'beauty', 'other',
]);
function isValidCategory(v: unknown): v is Category {
  return typeof v === 'string' && VALID_CATEGORIES.has(v as Category);
}

// Stable empty references so query fallbacks don't churn the useMemos below.
const EMPTY_LISTINGS: Listing[] = [];
const EMPTY_SAVED_SEARCHES: SavedSearch[] = [];

export default function HomeScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [activeChip, setActiveChip] = useState<string>(FOR_YOU);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  // In-feed filter. Searches within the current view (For you / Saved / a saved
  // search) by title or brand — Discover owns catalog-wide server search, so
  // this stays an instant client-side refine over already-loaded rows.
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  // Structured filters (category / condition / price / sort) applied on top of
  // the text query, over the already-loaded rows. Opened from the filter button
  // beside the search field; the red badge shows how many constraints are on.
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_FEED_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilterCount = countActiveFilters(filters);

  const { columns, cardWidth } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });
  // Bottom padding that clears the floating tab bar overlaying the feed.
  const tabClear = useTabBarClearance();

  // React Query owns all four reads (primary grid, two rails, saved searches,
  // saved listings). staleTime reproduces the single old 'myfeed' freshness
  // gate; each query now caches and revalidates independently.
  const userId = user?.id ?? null;
  const feedQ = useMyFeedListingsQuery(userId);
  // Trending chip — likes-sorted, same source Discover's "popular" sort uses.
  // Not gated on the chip being active so switching to it is instant.
  const trendingQ = useFeedListingsQuery({ tab: 'popular', limit: 60 });
  const priceDropsQ = usePriceDropsQuery(userId);
  const savedSearchesQ = useSavedSearchesQuery(userId);
  const savedListingsQ = useSavedListingsQuery(userId);
  const deleteSavedSearchM = useDeleteSavedSearch(userId);

  const listings = feedQ.data ?? EMPTY_LISTINGS;
  const loading = feedQ.isLoading;
  // "Fallback" = nothing ranked for personal reasons (cold start). Anonymous
  // users always get the trending fallback.
  const isFallback =
    !user ||
    (listings as RecommendedListing[]).every(
      (r) => !r.rec_reason || r.rec_reason === 'trending',
    );
  const trendingListings = trendingQ.data ?? EMPTY_LISTINGS;
  const trendingLoading = trendingQ.isLoading;
  const priceDrops = priceDropsQ.data ?? [];
  const savedSearches = savedSearchesQ.data ?? EMPTY_SAVED_SEARCHES;
  const savedListings = savedListingsQ.data ?? EMPTY_LISTINGS;
  const loadingSaved = savedListingsQ.isLoading;
  const refreshing =
    feedQ.isRefetching ||
    trendingQ.isRefetching ||
    priceDropsQ.isRefetching ||
    savedSearchesQ.isRefetching ||
    savedListingsQ.isRefetching;

  // Stable refetch fns + isStale snapshots for the focus gate (see discover).
  const { isStale: feedStale, refetch: feedRefetch } = feedQ;
  const { isStale: trendingStale, refetch: trendingRefetch } = trendingQ;
  const { isStale: dropsStale, refetch: dropsRefetch } = priceDropsQ;
  const { isStale: searchesStale, refetch: searchesRefetch } = savedSearchesQ;
  const { isStale: savedStale, refetch: savedRefetch } = savedListingsQ;

  // Revalidate stale queries on focus — reuses fresh data so returning to this
  // 5-fetch tab doesn't re-hit the network every time.
  useFocusEffect(
    useCallback(() => {
      if (feedStale) feedRefetch();
      if (trendingStale) trendingRefetch();
      if (dropsStale) dropsRefetch();
      if (searchesStale) searchesRefetch();
      if (savedStale) savedRefetch();
    }, [
      feedStale, feedRefetch,
      trendingStale, trendingRefetch,
      dropsStale, dropsRefetch,
      searchesStale, searchesRefetch,
      savedStale, savedRefetch,
    ]),
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([
      feedRefetch(),
      trendingRefetch(),
      dropsRefetch(),
      searchesRefetch(),
      savedRefetch(),
    ]);
  }, [feedRefetch, trendingRefetch, dropsRefetch, searchesRefetch, savedRefetch]);

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
              // The mutation drops the chip from cache optimistically and rolls
              // back on failure.
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

  // Client-side filter when a saved search chip is selected. Mirrors the
  // discover screen's filter logic so the chip's params actually narrow the
  // grid in-place rather than navigating away. When the "Saved" chip is
  // active we swap the dataset entirely to the user's bookmarks; "Trending"
  // swaps it to the likes-sorted grid.
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

  // Instant local filter layered on top of the active view. Matches title and
  // brand, the two fields a shopper scans for.
  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;
  const searchedListings = useMemo(() => {
    if (!isSearching) return visibleListings;
    return visibleListings.filter(
      (l) =>
        l.title.toLowerCase().includes(trimmedQuery) ||
        (l.brand?.toLowerCase().includes(trimmedQuery) ?? false),
    );
  }, [visibleListings, isSearching, trimmedQuery]);

  // Structured filters + sort, layered on top of the text search. Sorting
  // copies before mutating so the source query cache is never reordered.
  const filteredListings = useMemo(() => {
    let rows = searchedListings;
    if (filters.category) rows = rows.filter((l) => l.category === filters.category);
    if (filters.conditions.length > 0)
      rows = rows.filter((l) => filters.conditions.includes(l.condition));
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
        rows = [...rows].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
        break;
    }
    return rows;
  }, [searchedListings, filters]);

  const showColdStartBanner = !user;
  const showFollowCta =
    !!user && savedSearches.length === 0 && isFallback;

  // Rails are browsing aids; while filtering we hide them so results stay the
  // sole focus.
  const showRails =
    activeChip === FOR_YOU && !showingSaved && !isSearching && activeFilterCount === 0;

  const gridEmptyText = isSearching
    ? `Nothing in ${showingSaved ? 'your saved items' : 'this feed'} matches “${query.trim()}”.`
    : activeFilterCount > 0
      ? 'No items match these filters. Try loosening them.'
      : showingSaved
        ? 'No saved items yet. Tap the bookmark on any listing to save it.'
        : showingTrending
          ? 'Nothing trending right now.'
          : 'Nothing matches this feed yet.';

  // Web pull-to-refresh — RefreshControl is inert on react-native-web.
  const { scrollRef, pull, nodeTop, threshold, contentStyle } = useWebPullToRefresh({ refreshing, onRefresh });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
        contentContainerStyle={[{ paddingBottom: tabClear }, contentStyle]}
      >
        {/* In-feed search — filters the active view (For you / Saved / a saved
            search) by title or brand. Focus lifts the hairline to purple; the
            border is always present so focusing never shifts layout. */}
        <FeedSearch
          value={query}
          onChangeText={setQuery}
          focused={searchFocused}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          resultCount={isSearching || activeFilterCount > 0 ? filteredListings.length : null}
          filterCount={activeFilterCount}
          onOpenFilter={() => setFilterOpen(true)}
          savedActive={showingSaved}
          onToggleSaved={() => setActiveChip(showingSaved ? FOR_YOU : SAVED)}
        />

        {showColdStartBanner ? (
          <Pressable
            onPress={() => router.push('/auth/login')}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.purpleSoft,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Feather name="user-plus" size={16} color={colors.purple} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontWeight: '600' }}>
              Sign in and like a few items to see this feed personalize itself.
            </Text>
          </Pressable>
        ) : null}

        {showFollowCta ? (
          <Pressable
            onPress={() => router.push('/(tabs)/discover')}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.purpleSoft,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Feather name="compass" size={16} color={colors.purple} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontWeight: '600' }}>
              Follow some sellers or like a few items to start personalizing your feed.
            </Text>
          </Pressable>
        ) : null}

        {/* Chip row: For you + Trending + Saved + saved searches + add */}
        <ChipRow
          savedSearches={savedSearches}
          activeChip={activeChip}
          onSelectChip={setActiveChip}
          onDeleteChip={onDeleteChip}
          onAdd={() => {
            if (!user?.id) {
              toast.show('Sign in to create drop alerts', { variant: 'info', icon: 'log-in' });
              router.push('/auth/login');
              return;
            }
            setAlertSheetOpen(true);
          }}
        />

        {/* Price drops on items the user liked — a marketplace-only signal.
            Strip renders only when there's at least one real drop. */}
        {showRails && priceDrops.length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            <RailHeader icon="trending-down" title="Price drops on your likes" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}
            >
              {priceDrops.map((drop) => (
                <PriceDropCard key={drop.id} listing={drop} width={130} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Grid
          rows={filteredListings}
          loading={showingSaved ? loadingSaved : showingTrending ? trendingLoading : loading}
          columns={columns}
          cardWidth={cardWidth}
          emptyText={gridEmptyText}
        />
      </ScrollView>

      <FeedFilterSheet
        visible={filterOpen}
        initial={filters}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />

      {user?.id ? (
        <DropAlertSheet
          visible={alertSheetOpen}
          userId={user.id}
          onClose={() => setAlertSheetOpen(false)}
          onCreated={() => searchesRefetch()}
        />
      ) : null}
      <WebPullIndicator pull={pull} refreshing={refreshing} nodeTop={nodeTop} threshold={threshold} />
    </SafeAreaView>
  );
}

// Compact section header for the personal rails: icon chip + label, quieter
// than the page title so the grid below stays the focal point.
function RailHeader({ icon, title }: { icon: keyof typeof Feather.glyphMap; title: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        marginBottom: 10,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={12} color={colors.purple} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
        {title}
      </Text>
    </View>
  );
}

// In-feed search field. Pill-shaped to match Discover's search vocabulary, but
// scoped to an instant local filter rather than a server query. The hairline
// border is always rendered (transparent → purple on focus) so the field never
// reflows when focused, and a live result count reassures the user the filter
// is working before they scan the grid.
function FeedSearch({
  value,
  onChangeText,
  focused,
  onFocus,
  onBlur,
  resultCount,
  filterCount,
  onOpenFilter,
  savedActive,
  onToggleSaved,
}: {
  value: string;
  onChangeText: (t: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  resultCount: number | null;
  filterCount: number;
  onOpenFilter: () => void;
  savedActive: boolean;
  onToggleSaved: () => void;
}) {
  const searching = value.trim().length > 0;
  const hasFilters = filterCount > 0;
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.panel,
            borderRadius: radii.pill,
            paddingHorizontal: 14,
            height: 44,
            borderWidth: 1,
            borderColor: focused ? colors.purple : 'transparent',
          }}
        >
          <Feather name="search" size={17} color={focused ? colors.purple : colors.muteSoft} />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Search your feed"
            placeholderTextColor={colors.muteSoft}
            style={
              {
                flex: 1,
                marginLeft: 9,
                fontSize: 14.5,
                color: colors.ink,
                padding: 0,
                // RN-Web only: drop the browser's default focus ring — the purple
                // border is our focus affordance.
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any
            }
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search your feed"
          />
          {searching ? (
            <Pressable
              hitSlop={HIT_SLOP_8}
              onPress={() => onChangeText('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color={colors.muteSoft} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter button — a count badge appears once constraints are applied. */}
        <Pressable
          onPress={onOpenFilter}
          accessibilityRole="button"
          accessibilityLabel={
            hasFilters ? `Filters, ${filterCount} active` : 'Open filters'
          }
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: hasFilters ? colors.purple : colors.hairline,
            backgroundColor: hasFilters ? colors.purpleSoft : colors.white,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <Feather name="sliders" size={18} color={hasFilters ? colors.purple : colors.ink} />
          {hasFilters ? (
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 19,
                height: 19,
                borderRadius: 10,
                paddingHorizontal: 5,
                backgroundColor: colors.purple,
                borderWidth: 2,
                borderColor: colors.white,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: colors.white }}>
                {filterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        {/* Saved toggle — icon-only, beside the filter button (Polymarket
            reference). Replaces the old "Saved" text chip. */}
        <Pressable
          onPress={onToggleSaved}
          accessibilityRole="button"
          accessibilityLabel={savedActive ? 'Showing saved items' : 'Show saved items'}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: savedActive ? colors.purple : colors.hairline,
            backgroundColor: savedActive ? colors.purpleSoft : colors.white,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <Feather
            name="bookmark"
            size={18}
            color={savedActive ? colors.purple : colors.ink}
          />
        </Pressable>
      </View>
      {searching && resultCount !== null && resultCount > 0 ? (
        <Text
          style={{
            marginTop: 8,
            marginLeft: 2,
            fontSize: 12,
            color: colors.muteSoft,
            letterSpacing: -0.1,
          }}
        >
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </Text>
      ) : null}
    </View>
  );
}

function ChipRow({
  savedSearches,
  activeChip,
  onSelectChip,
  onDeleteChip,
  onAdd,
}: {
  savedSearches: SavedSearch[];
  activeChip: string;
  onSelectChip: (id: string) => void;
  onDeleteChip: (search: SavedSearch) => void;
  onAdd: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 14, paddingBottom: 10 }}
    >
      <Chip
        label="For you"
        active={activeChip === FOR_YOU}
        onPress={() => onSelectChip(FOR_YOU)}
      />
      <Chip
        label="Trending"
        active={activeChip === TRENDING}
        onPress={() => onSelectChip(TRENDING)}
      />
      <AddChip onPress={onAdd} />
      {savedSearches.map((s) => (
        <Chip
          key={s.id}
          label={s.label ?? 'Saved'}
          active={activeChip === s.id}
          onPress={() => onSelectChip(s.id)}
          onLongPress={() => onDeleteChip(s)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  onLongPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  // Same selected-fill / unselected-outline structure as Instagram's
  // custom-feed tabs, tuned to Carrinex's whisper-border language: the
  // outline is a soft hairline (not a hard black stroke), and hierarchy
  // comes from ink vs. muted text + weight rather than a loud border.
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: radii.pill,
        borderWidth: active ? 0 : 1,
        borderColor: colors.hairline,
        backgroundColor: active ? colors.hairline : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: active ? '700' : '600',
          color: active ? colors.ink : colors.mute,
          letterSpacing: -0.1,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AddChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a new feed"
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name="plus" size={14} color={colors.ink} />
    </Pressable>
  );
}

function Grid({
  rows,
  loading,
  columns,
  cardWidth,
  emptyText,
}: {
  rows: Listing[];
  loading: boolean;
  columns: number;
  cardWidth: number;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <View style={{ paddingHorizontal: HORIZONTAL_PAD, flexDirection: 'row', gap: GRID_GAP }}>
        {Array.from({ length: columns }).map((_, i) => (
          <View
            key={i}
            style={{
              width: cardWidth,
              aspectRatio: 1,
              borderRadius: 12,
              backgroundColor: 'rgba(15,15,15,0.06)',
            }}
          />
        ))}
      </View>
    );
  }
  if (rows.length === 0) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: colors.muteSoft, textAlign: 'center' }}>
          {emptyText ?? 'Nothing matches this feed yet.'}
        </Text>
      </View>
    );
  }
  const grid: Listing[][] = [];
  for (let i = 0; i < rows.length; i += columns) grid.push(rows.slice(i, i + columns));
  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}>
      {grid.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: GRID_GAP }}>
          {row.map((listing) => (
            <View key={listing.id} style={{ width: cardWidth }}>
              <ListingCard listing={listing} />
            </View>
          ))}
          {row.length < columns &&
            Array.from({ length: columns - row.length }).map((_, i) => (
              <View key={`pad-${i}`} style={{ width: cardWidth }} />
            ))}
        </View>
      ))}
    </View>
  );
}
