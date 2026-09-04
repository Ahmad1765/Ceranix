// ─────────────────────────────────────────────────────────────────────────────
// DISCOVER HUB SCREEN (CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Modular Multi-Paradigm Search Hub
//
// 1. Decoupled Discovery Paradigms:
//    The Discover Hub consolidates 4 distinct exploration modes:
//    - Items: Classic visual marketplace grid + facet filters + editorial reels.
//    - Aesthetics: Live crowdsourced hashtag taxonomy.
//    - Brands: Stock-depth ranked brand index.
//    - Users: Seller reputation and social discovery with inline follows.
//
// 2. Virtualized Unified Grid:
//    Regardless of whether an item grid is displaying trending items, category
//    sub-facets, or tagged listings, FlashList virtualizes rows with memoized
//    components, maintaining 60fps performance across tabs.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef } from 'react';
import { View, RefreshControl } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { useGridDimensions, useTabBarClearance, GRID_DRAW_DISTANCE } from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import { EmptyState, SectionHeader } from '@/components/ui';
import {
  qk,
  useBrandIndexQuery,
  useFeedListingsQuery,
  useRecentlyViewedQuery,
  useRecommendationsQuery,
  useSuggestedFollowsQuery,
  useTagIndexQuery,
  useTagListingsQuery,
} from '@/lib/queries';
import {
  buildCollections,
  buildDigest,
  buildPromos,
  buildTopicCovers,
  buildTrendingSearches,
} from '@/lib/discover';
import type { Listing } from '@/types';
import type { TagIndexEntry } from '@/lib/searchIndex';
import {
  AestheticsPanel,
  AestheticsSkeleton,
  BrandsPanel,
  BrandsSkeleton,
  DiscoverGridRow,
  DiscoverHeader,
  DiscoverItemsGrid,
  GridSkeleton,
  HubTitle,
  PeopleSkeleton,
  SearchLanding,
  TrendingSearches,
  UsersPanel,
  useDiscoverSearch,
  type BrandEntry,
} from '@/components/discover';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const EMPTY_LISTINGS: Listing[] = [];

export default function DiscoverScreen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const scrollRef = useRef<FlashListRef<Listing[]>>(null);
  const gridYRef = useRef(0);

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });
  const tabClear = useTabBarClearance();
  const fade = useFadeIn(0, 320);

  // ── Primary Feed Queries ─────────────────────────────────────────────────
  const gridQ = useFeedListingsQuery({
    tab: 'popular',
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

  const { isStale: gridStale, refetch: gridRefetch } = gridQ;
  const { isStale: recStale, refetch: recRefetch } = recQ;
  const { isStale: recentStale, refetch: recentRefetch } = recentQ;

  // ── Unified Search State Domain Hook ─────────────────────────────────────
  const search = useDiscoverSearch({
    user,
    listings,
    scrollRef,
    gridYRef,
  });

  // ── Search Hub Index Queries ─────────────────────────────────────────────
  const tagIdxQ = useTagIndexQuery(search.tab === 'aesthetics');
  const brandIdxQ = useBrandIndexQuery(search.tab === 'brands');
  const suggestedQ = useSuggestedFollowsQuery(user?.id ?? null, search.tab === 'users' && !search.hasQuery);
  const tagListingsQ = useTagListingsQuery(search.activeTag);

  // ── Focus Effect & Cache Revalidation ────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (gridStale) gridRefetch();
      if (recStale) recRefetch();
      if (recentStale) recentRefetch();
    }, [gridStale, gridRefetch, recStale, recRefetch, recentStale, recentRefetch]),
  );

  const onRefresh = useCallback(async () => {
    qc.invalidateQueries({ queryKey: qk.brandIndex() });
    qc.invalidateQueries({ queryKey: qk.tagIndex() });
    qc.invalidateQueries({ queryKey: qk.suggestedFollows(user?.id ?? null) });
    await Promise.all([gridRefetch(), recRefetch(), recentRefetch()]);
  }, [gridRefetch, recRefetch, recentRefetch, qc, user?.id]);

  // ── Editorial Derivations ────────────────────────────────────────────────
  const digest = useMemo(() => buildDigest(listings), [listings]);
  const collections = useMemo(() => buildCollections(listings), [listings]);
  const trendingSearches = useMemo(() => buildTrendingSearches(listings), [listings]);
  const promos = useMemo(() => buildPromos(listings), [listings]);
  const picks = recommended.length > 0 ? recommended : listings.slice(0, 10);
  const topicCovers = useMemo(() => buildTopicCovers(listings), [listings]);

  // ── Aesthetics Tag Index Derivation ──────────────────────────────────────
  const tagResults = useMemo<TagIndexEntry[]>(() => {
    let rows: TagIndexEntry[];
    if (tagIdxQ.data) {
      rows = tagIdxQ.data;
    } else {
      const counts = new Map<string, TagIndexEntry>();
      for (const l of listings) {
        if (!l || l.is_sold) continue;
        const tags = Array.isArray(l.tags) ? l.tags : [];
        for (const raw of tags) {
          if (typeof raw !== 'string') continue;
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
    const q = search.query.trim().toLowerCase();
    return q ? rows.filter((t) => t.tag.includes(q)) : rows;
  }, [tagIdxQ.data, listings, search.query]);

  // ── Brand Index Derivation ───────────────────────────────────────────────
  const brandResults = useMemo<BrandEntry[]>(() => {
    let rows: BrandEntry[];
    if (brandIdxQ.data) {
      rows = brandIdxQ.data;
    } else {
      const counts = new Map<string, BrandEntry>();
      for (const l of listings) {
        if (!l) continue;
        const name = l.brand?.trim();
        if (!name || l.is_sold) continue;
        const key = name.toLowerCase();
        const cur = counts.get(key);
        const img = l.images?.[0];
        if (cur) {
          cur.count += 1;
          if (img && cur.images.length < 3) cur.images.push(img);
        } else {
          counts.set(key, { name, count: 1, images: img ? [img] : [] });
        }
      }
      rows = [...counts.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
      );
    }
    const q = search.query.trim().toLowerCase();
    return q ? rows.filter((b) => b.name.toLowerCase().includes(q)) : rows;
  }, [brandIdxQ.data, listings, search.query]);

  const suggested = suggestedQ.data ?? null;

  // ── Unified FlashList Grid Rows ──────────────────────────────────────────
  const gridListings = useMemo<Listing[]>(() => {
    if (search.showSearchLanding) return EMPTY_LISTINGS;
    if (search.tab === 'aesthetics') {
      if (!search.activeTag || tagListingsQ.isLoading) return EMPTY_LISTINGS;
      return tagListingsQ.data ?? EMPTY_LISTINGS;
    }
    if (search.tab === 'items') {
      if (loading) return EMPTY_LISTINGS;
      return search.idle ? search.gridResults : search.results;
    }
    return EMPTY_LISTINGS;
  }, [
    search.showSearchLanding,
    search.tab,
    search.activeTag,
    tagListingsQ.isLoading,
    tagListingsQ.data,
    loading,
    search.idle,
    search.gridResults,
    search.results,
  ]);

  const gridRows = useMemo(() => {
    const out: Listing[][] = [];
    for (let i = 0; i < gridListings.length; i += columns) {
      out.push(gridListings.slice(i, i + columns));
    }
    return out;
  }, [gridListings, columns]);

  const renderRow = useCallback(
    ({ item }: { item: Listing[] }) => (
      <DiscoverGridRow row={item} columns={columns} cardW={cardW} />
    ),
    [columns, cardW],
  );

  const rowKey = useCallback((row: Listing[]) => row[0]?.id ?? 'empty', []);

  // ── Composed Header Tree ─────────────────────────────────────────────────
  const listHeader = (
    <>
      <DiscoverHeader
        query={search.query}
        tab={search.tab}
        searchActive={search.searchActive}
        searching={search.searching}
        showSearchLanding={search.showSearchLanding}
        fade={fade}
        onChangeQuery={search.setQuery}
        onFocusSearch={() => search.setSearchActive(true)}
        onClearSearch={() => search.setQuery('')}
        onCancelSearch={search.cancelSearch}
        onChangeTab={search.setTab}
      />

      {/* ── Aesthetics Tab ── */}
      {search.tab === 'aesthetics' && !search.showSearchLanding && (
        search.activeTag ? (
          <View style={{ marginTop: 16 }}>
            <SectionHeader
              title={`#${search.activeTag}`}
              count={tagListingsQ.data?.length ?? undefined}
              action={{ label: 'All aesthetics', onPress: () => search.setActiveTag(null) }}
            />
            {tagListingsQ.isLoading ? (
              <GridSkeleton columns={columns} cardW={cardW} />
            ) : (tagListingsQ.data ?? []).length === 0 ? (
              <EmptyState
                icon="hash"
                title={`No #${search.activeTag} items yet`}
                description="Nothing in the catalog carries this tag right now — check back soon."
              />
            ) : null}
          </View>
        ) : (loading || tagIdxQ.isLoading) && tagResults.length === 0 ? (
          <AestheticsSkeleton />
        ) : tagResults.length === 0 ? (
          <EmptyState
            icon="hash"
            title={search.hasQuery ? 'No tag matched' : 'No aesthetics yet'}
            description={
              search.hasQuery
                ? 'Try a different word or a shorter spelling.'
                : 'Aesthetics appear here as sellers tag their listings.'
            }
          />
        ) : (
          <>
            {!search.hasQuery ? (
              <HubTitle title={`Browse all ${tagResults.length} Aesthetics`} />
            ) : (
              <View style={{ height: 18 }} />
            )}
            <AestheticsPanel tags={tagResults} onOpen={search.openTag} />
          </>
        )
      )}

      {/* ── Brands Tab ── */}
      {search.tab === 'brands' && !search.showSearchLanding && (
        (loading || brandIdxQ.isLoading) && brandResults.length === 0 ? (
          <BrandsSkeleton />
        ) : brandResults.length === 0 ? (
          <EmptyState
            icon="tag"
            title={search.hasQuery ? 'No brand matched' : 'No brands yet'}
            description={
              search.hasQuery
                ? 'Try a different spelling or a shorter name.'
                : 'Brands appear here as items are listed.'
            }
          />
        ) : (
          <>
            {!search.hasQuery ? (
              <HubTitle eyebrow="Ranked by live stock" title="Trending brands" />
            ) : (
              <View style={{ height: 10 }} />
            )}
            <BrandsPanel brands={brandResults} onSelect={search.openBrand} />
          </>
        )
      )}

      {/* ── Users Tab ── */}
      {search.tab === 'users' && !search.showSearchLanding && (
        search.hasQuery ? (
          search.searching && search.userResults.length === 0 ? (
            <PeopleSkeleton />
          ) : search.userResults.length === 0 ? (
            <EmptyState
              icon="users"
              title="No one matched"
              description="Try a username or full name."
            />
          ) : (
            <View style={{ marginTop: 10 }}>
              <UsersPanel users={search.userResults} viewerId={user?.id ?? null} />
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
      )}

      {/* ── Search Focus Landing ── */}
      {search.showSearchLanding && (
        <>
          <SearchLanding
            covers={topicCovers}
            onBrowse={search.handleBrowse}
            onTopic={search.handleTopic}
          />
          <TrendingSearches
            terms={trendingSearches}
            onSelect={search.selectSearchTerm}
            onShopAll={search.shopAll}
          />
        </>
      )}

      {/* ── Items Tab ── */}
      {search.tab === 'items' && !search.showSearchLanding && (
        <DiscoverItemsGrid
          currentSaveKey={search.currentSaveKey}
          canSaveSearch={search.canSaveSearch}
          savingSearch={search.savingSearch}
          onSaveSearch={search.handleSaveSearch}
          idle={search.idle}
          promos={promos}
          onPromoPress={search.handlePromoPress}
          loading={loading}
          digest={digest}
          onDigestPress={search.handleDigestPress}
          recLoading={recLoading}
          picks={picks}
          user={user}
          recentlyViewed={recentlyViewed}
          recentLoading={recentLoading}
          collections={collections}
          onSelectBrand={(brand) => search.setQuery(brand)}
          hasQuery={search.hasQuery}
          query={search.query}
          userResults={search.userResults}
          onSwitchToUsers={() => search.setTab('users')}
          gridYRef={gridYRef}
          browseCat={search.browseCat}
          activeSub={search.activeSub}
          browseSubs={search.browseSubs}
          onSelectSub={(subId) => search.setActiveSub(subId)}
          sort={search.sort}
          onSelectSort={(s) => search.setSort(s)}
          sortOnly={search.sortOnly}
          digestSort={search.digestSort}
          idleGridTitle={search.idleGridTitle}
          gridResults={search.gridResults}
          results={search.results}
          searching={search.searching}
          columns={columns}
          cardW={cardW}
          onClearCategory={search.clearCategory}
          onClearSort={() => search.setSort(null)}
          onClearDigestSort={() => search.setDigestSort(null)}
          searchFilters={search.searchFilters}
          onUpdateFilter={search.updateFilter}
          onResetFilters={search.resetFilters}
          activeFilterCount={search.activeFilterCount}
        />
      )}

    </>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <FlashList
        ref={scrollRef}
        data={gridRows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        drawDistance={GRID_DRAW_DISTANCE}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.purple}
          />
        }
        contentContainerStyle={{ paddingBottom: tabClear }}
        ListHeaderComponent={listHeader}
      />
    </SafeAreaView>
  );
}
