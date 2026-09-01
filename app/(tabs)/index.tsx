// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN (FEED CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Coordinator Component for Multi-Source Feeds
//
// 1. Data Orchestration:
//    Coordinates 5 distinct server state queries (`useMyFeedListingsQuery`,
//    `useFeedListingsQuery`, `usePriceDropsQuery`, `useSavedSearchesQuery`,
//    `useSavedListingsQuery`) with automatic stale-while-revalidate caching.
//
// 2. Performance Isolation:
//    Search and structured filter mutations are delegated to `useHomeFeedFilters`.
//    UI presentation is split between `HomeHeader`, `PriceDropRail`, and `GridRow`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, BackHandler, StyleSheet, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/lib/toast';
import { cardImageUrl, getOptimizedImageUrl, prefetchImages } from '@/lib/images';
import { DropAlertSheet } from '@/components/DropAlertSheet';
import { FeedFilterSheet } from '@/components/navigation/FeedFilterSheet';
import {
  useMyFeedListingsQuery,
  useFeedListingsQuery,
  usePriceDropsQuery,
  useSavedSearchesQuery,
  useSavedListingsQuery,
  useDeleteSavedSearch,
} from '@/lib/queries';
import {
  useGridDimensions,
  useTabBarClearance,
  GRID_DRAW_DISTANCE,
} from '@/lib/responsive';
import type { Listing } from '@/types';
import type { RecommendedListing } from '@/lib/recommendations';
import type { PriceDropListing } from '@/lib/myFeed';
import type { SavedSearch } from '@/lib/savedSearches';
import {
  FOR_YOU,
  GridPlaceholder,
  GridRow,
  HomeHeader,
  HomeSearchView,
  PriceDropRail,
  SAVED,
  useHomeFeedFilters,
} from '@/components/home';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const EMPTY_LISTINGS: Listing[] = [];
const EMPTY_SAVED_SEARCHES: SavedSearch[] = [];
const EMPTY_PRICE_DROPS: PriceDropListing[] = [];

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const [searchModeOpen, setSearchModeOpen] = useState(false);

  const listRef = useRef<FlashListRef<Listing[]>>(null);
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const { columns, cardWidth } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });
  const tabClear = useTabBarClearance();

  // ── Queries ──────────────────────────────────────────────────────────────
  const userId = user?.id ?? null;
  const feedQ = useMyFeedListingsQuery(userId);
  const trendingQ = useFeedListingsQuery({ tab: 'popular', limit: 60 });
  const priceDropsQ = usePriceDropsQuery(userId);
  const savedSearchesQ = useSavedSearchesQuery(userId);
  const savedListingsQ = useSavedListingsQuery(userId);
  const deleteSavedSearchM = useDeleteSavedSearch(userId);

  const listings = feedQ.data ?? EMPTY_LISTINGS;
  const loading = feedQ.isLoading;
  const isFallback =
    !user ||
    (listings as RecommendedListing[]).every(
      (r) => !r.rec_reason || r.rec_reason === 'trending',
    );
  const trendingListings = trendingQ.data ?? EMPTY_LISTINGS;
  const trendingLoading = trendingQ.isLoading;
  const priceDrops = priceDropsQ.data ?? EMPTY_PRICE_DROPS;
  const savedSearches = savedSearchesQ.data ?? EMPTY_SAVED_SEARCHES;
  const savedListings = savedListingsQ.data ?? EMPTY_LISTINGS;
  const loadingSaved = savedListingsQ.isLoading;

  // Proactively warm up browser/disk cache with top visible cards
  useEffect(() => {
    const topList = (listings.length ? listings : trendingListings).slice(0, 8);
    if (topList.length > 0) {
      prefetchImages(
        topList.map((l) => getOptimizedImageUrl(cardImageUrl(l, 0), { width: 400 })),
      );
    }
  }, [listings, trendingListings]);

  const refreshing =
    feedQ.isRefetching ||
    trendingQ.isRefetching ||
    priceDropsQ.isRefetching ||
    savedSearchesQ.isRefetching ||
    savedListingsQ.isRefetching;

  const { isStale: feedStale, refetch: feedRefetch } = feedQ;
  const { isStale: trendingStale, refetch: trendingRefetch } = trendingQ;
  const { isStale: dropsStale, refetch: dropsRefetch } = priceDropsQ;
  const { isStale: searchesStale, refetch: searchesRefetch } = savedSearchesQ;
  const { isStale: savedStale, refetch: savedRefetch } = savedListingsQ;

  // ── Focus Effect & Revalidation ──────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (feedStale) feedRefetch();
      if (trendingStale) trendingRefetch();
      if (userId && dropsStale) dropsRefetch();
      if (userId && searchesStale) searchesRefetch();
      if (userId && savedStale) savedRefetch();
    }, [
      feedStale,
      feedRefetch,
      trendingStale,
      trendingRefetch,
      dropsStale,
      dropsRefetch,
      searchesStale,
      searchesRefetch,
      savedStale,
      savedRefetch,
      userId,
    ]),
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([
      feedRefetch(),
      trendingRefetch(),
      ...(userId ? [dropsRefetch(), searchesRefetch(), savedRefetch()] : []),
    ]);
  }, [feedRefetch, trendingRefetch, dropsRefetch, searchesRefetch, savedRefetch, userId]);

  // ── BackHandler listener for search mode ────────────────────────────────
  useEffect(() => {
    if (!searchModeOpen) return;
    const onBackPress = () => {
      setSearchModeOpen(false);
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [searchModeOpen]);

  // ── Multi-Tier Client Filter Hook ────────────────────────────────────────
  const feedFilter = useHomeFeedFilters({
    listings,
    trendingListings,
    savedListings,
    savedSearches,
    deleteSavedSearchM,
    feedRefetch,
    trendingRefetch,
    scrollToTop,
    columns,
  });

  const authSettled = !authLoading;
  const ctaInputsSettled = authSettled && !feedQ.isPending && !savedSearchesQ.isPending;
  const showColdStartBanner = authSettled && !user;
  const showFollowCta =
    ctaInputsSettled && !!user && savedSearches.length === 0 && isFallback;
  const showRails =
    feedFilter.activeChip === FOR_YOU &&
    !feedFilter.showingSaved &&
    !feedFilter.isSearching &&
    feedFilter.activeFilterCount === 0;

  const gridLoading = feedFilter.showingSaved
    ? loadingSaved
    : feedFilter.showingTrending
      ? trendingLoading
      : loading;

  const renderRow = useCallback(
    ({ item }: { item: Listing[] }) => (
      <GridRow row={item} columns={columns} cardWidth={cardWidth} />
    ),
    [columns, cardWidth],
  );

  const rowKey = useCallback((row: Listing[]) => row[0]?.id ?? 'empty', []);

  // ── Composed Header Element ──────────────────────────────────────────────
  const listHeader = (
    <>
      <HomeHeader
        searchProps={{
          value: feedFilter.query,
          onChangeText: feedFilter.setQuery,
          focused: feedFilter.searchFocused,
          onFocus: () => feedFilter.setSearchFocused(true),
          onBlur: () => feedFilter.setSearchFocused(false),
          onPressSearch: () => setSearchModeOpen(true),
          resultCount:
            feedFilter.isSearching || feedFilter.activeFilterCount > 0
              ? feedFilter.filteredListings.length
              : null,
          filterCount: feedFilter.activeFilterCount,
          onOpenFilter: () => feedFilter.setFilterOpen(true),
          savedActive: feedFilter.showingSaved,
          onToggleSaved: () =>
            feedFilter.selectChip(feedFilter.showingSaved ? FOR_YOU : SAVED),
        }}
        chipProps={{
          savedSearches,
          activeChip: feedFilter.activeChip,
          onSelectChip: feedFilter.selectChip,
          onDeleteChip: feedFilter.onDeleteChip,
          onAdd: () => {
            if (!user?.id) {
              toast.show('Sign in to create drop alerts', { variant: 'info', icon: 'log-in' });
              router.push('/auth/login');
              return;
            }
            setAlertSheetOpen(true);
          },
        }}
        showColdStartBanner={showColdStartBanner}
        showFollowCta={showFollowCta}
      />

      <PriceDropRail show={showRails} priceDrops={priceDrops} />
    </>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <FlashList
        ref={listRef}
        data={feedFilter.gridRows}
        extraData={feedFilter.activeChip}
        renderItem={renderRow}
        keyExtractor={rowKey}
        drawDistance={GRID_DRAW_DISTANCE}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <GridPlaceholder
            loading={gridLoading}
            columns={columns}
            cardWidth={cardWidth}
            emptyText={feedFilter.gridEmptyText}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.purple}
          />
        }
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + tabClear + 16 }}
      />

      {searchModeOpen && (
        <View style={StyleSheet.absoluteFillObject}>
          <HomeSearchView
            onClose={() => setSearchModeOpen(false)}
            onOpenSavedAlerts={() => {
              if (!user?.id) {
                toast.show('Sign in to create drop alerts', { variant: 'info', icon: 'log-in' });
                router.push('/auth/login');
                return;
              }
              setAlertSheetOpen(true);
            }}
          />
        </View>
      )}

      <FeedFilterSheet
        visible={feedFilter.filterOpen}
        initial={feedFilter.filters}
        onApply={feedFilter.setFilters}
        onClose={() => feedFilter.setFilterOpen(false)}
        resultCount={feedFilter.filteredListings.length}
      />

      {user?.id ? (
        <DropAlertSheet
          visible={alertSheetOpen}
          userId={user.id}
          onClose={() => setAlertSheetOpen(false)}
          onCreated={() => searchesRefetch()}
        />
      ) : null}
    </SafeAreaView>
  );
}
