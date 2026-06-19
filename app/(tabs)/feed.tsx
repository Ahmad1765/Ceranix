import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
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
import { useWebPullToRefresh, WebPullIndicator } from '@/components/WebRefresh';
import {
  useMyFeedListingsQuery,
  usePriceDropsQuery,
  useNewFromFollowedQuery,
  useSavedSearchesQuery,
  useSavedListingsQuery,
  useDeleteSavedSearch,
} from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { useGridDimensions, useTabBarClearance } from '@/lib/responsive';
import type { Category, Listing } from '@/types';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
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

export default function MyFeedScreen() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [activeChip, setActiveChip] = useState<string>(FOR_YOU);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);

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
  const priceDropsQ = usePriceDropsQuery(userId);
  const followedQ = useNewFromFollowedQuery(userId);
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
  const priceDrops = priceDropsQ.data ?? [];
  const fromFollowed = followedQ.data ?? EMPTY_LISTINGS;
  const savedSearches = savedSearchesQ.data ?? EMPTY_SAVED_SEARCHES;
  const savedListings = savedListingsQ.data ?? EMPTY_LISTINGS;
  const loadingSaved = savedListingsQ.isLoading;
  const refreshing =
    feedQ.isRefetching ||
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

  // Revalidate stale queries on focus — reuses fresh data so returning to this
  // 4-fetch tab doesn't re-hit the network every time.
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

  // Web pull-to-refresh — RefreshControl is inert on react-native-web.
  const { scrollRef, pull, nodeTop, threshold } = useWebPullToRefresh({ refreshing, onRefresh });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
        contentContainerStyle={{ paddingBottom: tabClear }}
      >
        {/* Title — greets the signed-in user by name; the feed is THEIRS,
            not a generic surface. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
            {(() => {
              const first = (profile?.full_name || profile?.username || '')
                .trim()
                .split(/\s+/)[0];
              return first ? `Hey ${first}` : 'My Feed';
            })()}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.muteSoft,
              marginTop: 2,
              letterSpacing: -0.1,
            }}
          >
            {subtitle}
          </Text>
        </View>

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

        {/* Fresh stock from sellers the user follows. */}
        {showRails && fromFollowed.length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            <RailHeader icon="user-check" title="New from sellers you follow" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}
            >
              {fromFollowed.map((listing) => (
                <View key={listing.id} style={{ width: 160 }}>
                  <ListingCard listing={listing} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Grid
          rows={visibleListings}
          loading={showingSaved ? loadingSaved : loading}
          columns={columns}
          cardWidth={cardWidth}
          emptyText={
            showingSaved
              ? 'No saved items yet. Tap the bookmark on any listing to save it.'
              : 'Nothing matches this feed yet.'
          }
        />
      </ScrollView>

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
  // Selected state: solid purple fill with white label — Ceranix identity,
  // replacing the old Instagram-grey selection. Unselected keeps the
  // hairline border on a white surface.
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        paddingHorizontal: 20,
        paddingVertical: 9,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: active ? colors.purple : '#E5E5E5',
        backgroundColor: active ? colors.purpleSoft : colors.white,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: '500',
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
        width: 40,
        height: 40,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: '#E5E5E5',
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name="plus" size={16} color={colors.ink} />
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
