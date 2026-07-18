import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors, radii } from '@/lib/theme';
import type { RecommendedListing } from '@/lib/recommendations';
import { PriceDropCard } from '@/components/PriceDropCard';
import { PressableScale } from '@/components/PressableScale';
import { type SavedSearch } from '@/lib/savedSearches';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { DropAlertSheet } from '@/components/DropAlertSheet';
import { useWebPullToRefresh, WebPullIndicator } from '@/components/WebRefresh';
import { getOptimizedImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { buyerProtectionFee } from '@/lib/fees';
import { isLiked as fetchIsLiked, toggleLike } from '@/lib/listings';
import { useGuestGate } from '@/components/GuestGate';
import {
  useMyFeedInfiniteQuery,
  usePriceDropsQuery,
  useNewFromFollowedQuery,
  useSavedSearchesQuery,
  useSavedListingsQuery,
  useDeleteSavedSearch,
} from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { useGridDimensions, useTabBarClearance } from '@/lib/responsive';
import type { Category, Listing } from '@/types';

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
// Single width for both horizontal rails so the price-drop and followed strips
// read as one system rather than two mismatched card sizes.
const RAIL_CARD_W = 150;
const FOR_YOU: 'for-you' = 'for-you';
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

// Grid rows are padded to a full multiple of the column count so the trailing
// row's cards keep their width instead of stretching across the gap.
type FeedItem = Listing | { __placeholder: true; id: string };
function isPlaceholder(item: FeedItem): item is { __placeholder: true; id: string } {
  return (item as { __placeholder?: boolean }).__placeholder === true;
}

export default function MyFeedScreen() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [activeChip, setActiveChip] = useState<string>(FOR_YOU);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);

  const { columns } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });
  // Bottom padding that clears the floating tab bar overlaying the feed.
  const tabClear = useTabBarClearance();

  // React Query owns every read. The primary grid is now infinite (personalized
  // first page, popular tail); the two rails, saved searches, and saved listings
  // stay single-shot. Each caches and revalidates independently.
  const userId = user?.id ?? null;
  const feedQ = useMyFeedInfiniteQuery(userId);
  const priceDropsQ = usePriceDropsQuery(userId);
  const followedQ = useNewFromFollowedQuery(userId);
  const savedSearchesQ = useSavedSearchesQuery(userId);
  const savedListingsQ = useSavedListingsQuery(userId);
  const deleteSavedSearchM = useDeleteSavedSearch(userId);

  // Flatten the infinite pages, de-duping by id — a popular tail page can
  // re-surface a row already shown in the personalized first page.
  const listings = useMemo<Listing[]>(() => {
    const pages = feedQ.data?.pages;
    if (!pages) return EMPTY_LISTINGS;
    const seen = new Set<string>();
    const out: Listing[] = [];
    for (const page of pages) {
      for (const l of page) {
        if (!seen.has(l.id)) {
          seen.add(l.id);
          out.push(l);
        }
      }
    }
    return out;
  }, [feedQ.data]);

  const loading = feedQ.isLoading;
  const loadingMore = feedQ.isFetchingNextPage;
  const reachedEnd = !feedQ.hasNextPage && !feedQ.isLoading;
  // "Fallback" = nothing ranked for personal reasons (cold start). Anonymous
  // users always get the trending fallback.
  const isFallback =
    !user ||
    (listings as RecommendedListing[]).every(
      (r) => !r.rec_reason || r.rec_reason === 'trending',
    );
  const priceDrops = priceDropsQ.data ?? [];
  const fromFollowed = followedQ.data ?? EMPTY_LISTINGS;
  const savedSearches = savedSearchesQ.data ?? EMPTY_SAVED_SEARCHES;
  const savedListings = savedListingsQ.data ?? EMPTY_LISTINGS;
  const loadingSaved = savedListingsQ.isLoading;
  const refreshing =
    (feedQ.isRefetching && !feedQ.isFetchingNextPage) ||
    priceDropsQ.isRefetching ||
    followedQ.isRefetching ||
    savedSearchesQ.isRefetching ||
    savedListingsQ.isRefetching;

  // Stable refetch fns + isStale snapshots for the focus gate (see discover).
  const { isStale: feedStale, refetch: feedRefetch } = feedQ;
  const { isStale: dropsStale, refetch: dropsRefetch } = priceDropsQ;
  const { isStale: followedStale, refetch: followedRefetch } = followedQ;
  const { isStale: searchesStale, refetch: searchesRefetch } = savedSearchesQ;
  const { isStale: savedStale, refetch: savedRefetch } = savedListingsQ;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feedQ;

  // Revalidate stale queries on focus — reuses fresh data so returning to this
  // multi-fetch tab doesn't re-hit the network every time.
  useFocusEffect(
    useCallback(() => {
      if (feedStale) feedRefetch();
      if (dropsStale) dropsRefetch();
      if (followedStale) followedRefetch();
      if (searchesStale) searchesRefetch();
      if (savedStale) savedRefetch();
    }, [
      feedStale, feedRefetch,
      dropsStale, dropsRefetch,
      followedStale, followedRefetch,
      searchesStale, searchesRefetch,
      savedStale, savedRefetch,
    ]),
  );

  // Warm the image cache for the first screenful so cards paint instantly.
  useEffect(() => {
    const urls = listings
      .slice(0, 12)
      .map((l) => l.images?.[0])
      .filter(Boolean)
      .map((u) => getOptimizedImageUrl(u as string, { width: 400 }));
    if (urls.length) Image.prefetch(urls, { cachePolicy: 'memory-disk' });
  }, [listings]);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      feedRefetch(),
      dropsRefetch(),
      followedRefetch(),
      searchesRefetch(),
      savedRefetch(),
    ]);
  }, [feedRefetch, dropsRefetch, followedRefetch, searchesRefetch, savedRefetch]);

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
  const feedError = feedQ.isError && !showingSaved;

  // Client-side filter when a saved search chip is selected. Mirrors the
  // discover screen's filter logic so the chip's params actually narrow the
  // grid in-place rather than navigating away. When the "Saved" chip is
  // active we swap the dataset entirely to the user's bookmarks.
  const visibleListings = useMemo(() => {
    if (showingSaved) return savedListings;
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
  }, [listings, savedListings, activeSavedSearch, showingSaved]);

  const showColdStartBanner = !user;
  const showFollowCta =
    !!user && savedSearches.length === 0 && isFallback;

  // Personal subtitle: name the dominant category in today's picks instead
  // of a static tagline, so the feed tells the user WHY it looks like this.
  const subtitle = useMemo(() => {
    if (!user || isFallback || listings.length === 0) return 'Curated from what you like';
    const counts = new Map<string, number>();
    for (const l of listings.slice(0, 24)) {
      if (l.category) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
    }
    let top: string | null = null;
    let max = 0;
    for (const [cat, n] of counts) {
      if (n > max) { top = cat; max = n; }
    }
    return top
      ? `Heavy on ${top} today, from your likes, saves & sellers you follow`
      : 'From your likes, saves & sellers you follow';
  }, [user, isFallback, listings]);

  const showRails = activeChip === FOR_YOU && !showingSaved;

  // Feature the single strongest pick as a full-bleed hero, then flow the rest
  // into the grid. Breaks the identical-card-grid monotony and gives the feed
  // an editorial anchor — only on the main "For you" surface (not while a saved
  // search or the Saved tab narrows the set), and never over a loading state.
  const showHero = showRails && !loading && visibleListings.length > 0;
  const heroListing = showHero ? visibleListings[0] : null;
  const gridListings = showHero ? visibleListings.slice(1) : visibleListings;

  // Pad the grid data to a full row so trailing cards don't stretch.
  const data = useMemo<FeedItem[]>(() => {
    if (gridListings.length === 0) return [];
    const remainder = gridListings.length % columns;
    if (remainder === 0) return gridListings;
    const pads: FeedItem[] = Array.from({ length: columns - remainder }, (_, i) => ({
      __placeholder: true as const,
      id: `__pad-${i}`,
    }));
    return [...gridListings, ...pads];
  }, [gridListings, columns]);

  // Infinite scroll: the personalized page is finite, so the tail extends with
  // popular stock. Saved bookmarks aren't paginated, so skip there.
  const loadMore = useCallback(() => {
    if (showingSaved) return;
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [showingSaved, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) =>
      isPlaceholder(item) ? <View style={{ flex: 1 }} /> : <ListingCard listing={item} />,
    [],
  );

  // Web pull-to-refresh — RefreshControl is inert on react-native-web.
  const { scrollRef, pull, nodeTop, threshold, contentStyle } = useWebPullToRefresh({ refreshing, onRefresh });

  // Masthead: one clock read drives both the dated eyebrow and the time-of-day
  // greeting, so they can't disagree across a midnight/evening boundary.
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const firstName = (profile?.full_name || profile?.username || '').trim().split(/\s+/)[0];
  const greeting = `${now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'}${firstName ? `, ${firstName}` : ''}`;

  const listHeader = (
    <View>
      {/* Editorial masthead — a dated eyebrow over a serif, time-of-day
          greeting (the same Fraunces display the home screen uses for its hero
          moments), so the feed opens like a personal cover page. The subtitle
          explains WHY today's picks look like this. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
          <Text
            style={{
              fontSize: 11,
              fontFamily: 'Inter_700Bold',
              color: colors.ink,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            {dateLabel}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 34,
            fontFamily: 'Fraunces_600SemiBold',
            color: colors.ink,
            letterSpacing: -1,
            lineHeight: 38,
          }}
        >
          {greeting}
        </Text>
        <Text
          style={{
            fontSize: 13.5,
            color: colors.muteSoft,
            marginTop: 8,
            lineHeight: 19,
            letterSpacing: -0.1,
            fontFamily: 'Inter_500Medium',
          }}
        >
          {subtitle}
        </Text>
      </View>

      {showColdStartBanner ? (
        <Pressable
          onPress={() => router.push('/auth/login')}
          accessibilityRole="button"
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
          <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 18 }}>
            Sign in and like a few items to see this feed personalize itself.
          </Text>
          <Feather name="chevron-right" size={16} color={colors.purple} style={{ marginLeft: 8 }} />
        </Pressable>
      ) : null}

      {showFollowCta ? (
        <Pressable
          onPress={() => router.push('/(tabs)/discover')}
          accessibilityRole="button"
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
          <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 18 }}>
            Follow some sellers or like a few items to start personalizing your feed.
          </Text>
          <Feather name="chevron-right" size={16} color={colors.purple} style={{ marginLeft: 8 }} />
        </Pressable>
      ) : null}

      {/* Chip row: For you + Saved + saved searches + add */}
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

      {/* Featured hero — the strongest single pick, full-bleed. */}
      {heroListing ? <HeroPick listing={heroListing} /> : null}

      {/* Price drops on items the user liked — a marketplace-only signal. */}
      {showRails && priceDrops.length > 0 ? (
        <View style={{ marginBottom: 16 }}>
          <SectionEyebrow label="Price drops on your likes" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}
          >
            {priceDrops.map((drop) => (
              <PriceDropCard key={drop.id} listing={drop} width={RAIL_CARD_W} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Fresh stock from sellers the user follows. */}
      {showRails && fromFollowed.length > 0 ? (
        <View style={{ marginBottom: 16 }}>
          <SectionEyebrow label="New from sellers you follow" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}
          >
            {fromFollowed.map((listing) => (
              <View key={listing.id} style={{ width: RAIL_CARD_W }}>
                <ListingCard listing={listing} />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Section label for the main grid — only once a hero sits above it, so
          the grid reads as "the rest" rather than a headless dump. */}
      {showHero && gridListings.length > 0 ? (
        <SectionEyebrow label="More for you" style={{ marginTop: 6, marginBottom: 12 }} />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Web pull-to-refresh translates the whole page with the gesture;
          contentStyle is undefined on native, so this wrapper is a no-op there. */}
      <View style={[{ flex: 1 }, contentStyle]}>
        <FlatList
          ref={scrollRef}
          key={`feed-${columns}`}
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={columns}
          columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: HORIZONTAL_PAD }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          updateCellsBatchingPeriod={50}
          windowSize={8}
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
          }
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            (showingSaved ? loadingSaved : loading) ? (
              <SkeletonRows columns={columns} />
            ) : feedError ? (
              <View style={{ paddingHorizontal: 32, paddingTop: 48, alignItems: 'center' }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: colors.purpleSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Feather name="alert-circle" size={22} color={colors.purple} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, textAlign: 'center', letterSpacing: -0.2 }}>
                  Couldn’t load your feed
                </Text>
                <Text style={{ fontSize: 13, color: colors.muteSoft, textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 268 }}>
                  Something went wrong. Check your connection and try again.
                </Text>
                <Pressable
                  onPress={() => feedRefetch()}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    marginTop: 18,
                    paddingHorizontal: 24,
                    paddingVertical: 10,
                    borderRadius: radii.pill,
                    backgroundColor: colors.purple,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: colors.white, fontSize: 14, fontWeight: '600' }}>Retry</Text>
                </Pressable>
              </View>
            ) : showHero ? null : (
              <EmptyState
                icon={showingSaved ? 'bookmark' : 'compass'}
                title={showingSaved ? 'Nothing saved yet' : 'This feed is warming up'}
                text={
                  showingSaved
                    ? 'Tap the bookmark on any listing to keep it here for later.'
                    : activeChip === FOR_YOU
                      ? 'Like a few items and follow some sellers, and your picks will land here.'
                      : 'Nothing matches this feed right now. Check back soon.'
                }
              />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingTop: 8 }}>
                <SkeletonRows columns={columns} rows={1} />
              </View>
            ) : !loading && reachedEnd && !showingSaved && gridListings.length > 0 ? (
              <View style={{ paddingVertical: 28, paddingHorizontal: 40, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
                <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.muteSoft, letterSpacing: 1.6, textTransform: 'uppercase' }}>
                  All caught up
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: tabClear }}
        />
      </View>

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

// Unified section header — a purple dot + uppercase micro-caps, matching the
// masthead / hero / grid labels so every section speaks the same visual
// language instead of the old icon-chip style.
function SectionEyebrow({ label, style }: { label: string; style?: object }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
        style,
      ]}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
      <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.ink, letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
}

// Skeleton grid — the shared SkeletonCard (matches ListingCard's shape + pulse)
// laid out in the real grid so loading reads as content arriving.
function SkeletonRows({ columns, rows = 3 }: { columns: number; rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: GRID_GAP, paddingHorizontal: HORIZONTAL_PAD, marginBottom: 6 }}>
          {Array.from({ length: columns }).map((_, ci) => (
            <SkeletonCard key={ci} />
          ))}
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={{ paddingHorizontal: 32, paddingTop: 48, alignItems: 'center' }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <Feather name={icon} size={22} color={colors.purple} />
      </View>
      <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.ink, textAlign: 'center', letterSpacing: -0.2 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.muteSoft, textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 268 }}>
        {text}
      </Text>
    </View>
  );
}

// Condition labels for the hero meta line. Kept local so the feed doesn't pull
// in the whole product-screen shared module for one map.
const HERO_CONDITION: Record<string, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  good: 'Good condition',
  fair: 'Fair',
};

// Featured hero — the single strongest pick promoted to a full-bleed image with
// the info set beneath it (no gradient scrim: text lives on white, per the
// palette). Carries the shared-element transition tag so tapping it zooms the
// photo straight into the product page, and a quick-like control that mirrors
// the grid cards so the most prominent item is just as actionable.
function HeroPick({ listing }: { listing: Listing }) {
  const { user } = useAuth();
  const guestGate = useGuestGate();
  const toast = useToast();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(listing.likes ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      setLiked(false);
      hydratedRef.current = true;
      return;
    }
    hydratedRef.current = false;
    let cancelled = false;
    fetchIsLiked(listing.id, user.id)
      .then((v) => {
        if (!cancelled) setLiked(v);
      })
      .catch(() => {
        // Hydration failed — leave liked at its current value rather than
        // producing an unhandled promise rejection.
      })
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [listing.id, user?.id]);

  useEffect(() => {
    setLikeCount(listing.likes ?? 0);
  }, [listing.likes]);

  const onToggleLike = useCallback(async () => {
    if (!user?.id) {
      guestGate.prompt({
        title: 'Save your favourites',
        message: 'Create a free account to like items and keep everything you love in one place.',
        icon: 'heart',
        resume: { kind: 'like', listingId: listing.id },
      });
      return;
    }
    if (likeBusy || !hydratedRef.current) return;
    setLikeBusy(true);
    const prev = liked;
    const next = !prev;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const result = await toggleLike(listing.id, user.id, prev);
      if (result !== next) {
        setLiked(prev);
        setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      }
    } catch {
      setLiked(prev);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      toast.show("Couldn't update like", { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setLikeBusy(false);
    }
  }, [liked, likeBusy, listing.id, user?.id, guestGate, toast]);

  const img = listing.images?.[0];
  const bpFee = buyerProtectionFee(listing.price);
  const meta = [
    listing.size ? `Size ${listing.size}` : null,
    HERO_CONDITION[listing.condition] ?? null,
  ]
    .filter(Boolean)
    .join('   ·   ');

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 4, marginBottom: 22 }}>
      <SectionEyebrow label="Today's top pick" style={{ paddingHorizontal: 0 }} />
      <PressableScale
        onPress={() => router.push(`/product/${listing.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${listing.brand || listing.title}, ${formatPrice(listing.price)}. Top pick.`}
      >
        <View
          style={{
            width: '100%',
            aspectRatio: 1,
            borderRadius: 22,
            overflow: 'hidden',
            backgroundColor: colors.panel,
          }}
        >
          {img ? (
            <AnimatedExpoImage
              source={{ uri: getOptimizedImageUrl(img, { width: 900 }) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              sharedTransitionTag={`product-image-${listing.id}`}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="image" size={30} color="rgba(15,15,15,0.30)" />
            </View>
          )}

          {/* Quick-like — nested Pressable wins the touch responder so the
              card's onPress doesn't fire when the heart is tapped. */}
          <Pressable
            onPress={onToggleLike}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Unlike this item' : 'Like this item'}
            accessibilityState={{ selected: liked }}
            style={({ pressed }) => ({
              position: 'absolute',
              top: 12,
              right: 12,
              backgroundColor: 'rgba(255,255,255,0.94)',
              borderRadius: 999,
              paddingVertical: 7,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="heart" size={15} color={liked ? colors.primary : colors.ink} />
            {likeCount > 0 ? (
              <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.ink }}>{likeCount}</Text>
            ) : null}
          </Pressable>

          {listing.is_sold ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,15,15,0.42)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.white, fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: 1 }}>SOLD</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.ink, letterSpacing: -0.3 }} numberOfLines={1}>
              {listing.brand || listing.title}
            </Text>
            {meta ? (
              <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.muteSoft, marginTop: 4 }} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.ink, letterSpacing: -0.3 }}>
              {formatPrice(listing.price)}
            </Text>
            {bpFee > 0 ? (
              <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.muteSoft, marginTop: 4 }}>
                +{formatPrice(bpFee)} protection
              </Text>
            ) : null}
          </View>
        </View>
      </PressableScale>
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
        label="Saved"
        active={activeChip === SAVED}
        onPress={() => onSelectChip(SAVED)}
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
  // Selected state: solid purple fill with white label — Ceranix identity, the
  // same primary treatment as the product page's Follow button. Unselected
  // keeps a hairline border on white. Fixed 40px height so chips align to the
  // AddChip and read as one control row.
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        height: 40,
        justifyContent: 'center',
        paddingHorizontal: 18,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: active ? colors.purple : colors.hairline,
        backgroundColor: active ? colors.purple : colors.white,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: active ? '700' : '500',
          color: active ? colors.white : colors.mute,
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
        width: 40,
        height: 40,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Feather name="plus" size={16} color={colors.ink} />
    </Pressable>
  );
}
