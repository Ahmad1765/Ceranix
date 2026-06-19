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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { ListingCard } from '@/components/ListingCard';
import { searchListings } from '@/lib/listings';
import { searchUsers } from '@/lib/follows';
import { getOptimizedImageUrl } from '@/lib/images';
import {
  useFeedListingsQuery,
  useRecommendationsQuery,
  useRecentlyViewedQuery,
} from '@/lib/queries';
import { createSavedSearch, touchSavedSearchSeen } from '@/lib/savedSearches';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { colors, radii } from '@/lib/theme';
import { useGridDimensions, useTabBarClearance, HIT_SLOP_8 } from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import type { Category, Listing } from '@/types';
import { EmptyState, SectionHeader } from '@/components/ui';
import { useWebPullToRefresh, WebPullIndicator } from '@/components/WebRefresh';

type CatTile = {
  id: Category | 'trending';
  label: string;
  icon: keyof typeof Feather.glyphMap;
};

const CATEGORY_TILES: CatTile[] = [
  { id: 'trending', label: 'Trending', icon: 'trending-up' },
  { id: 'clothing', label: 'Clothing', icon: 'shopping-bag' },
  { id: 'shoes', label: 'Shoes', icon: 'compass' },
  { id: 'bags', label: 'Bags', icon: 'briefcase' },
  { id: 'accessories', label: 'Accessories', icon: 'watch' },
  { id: 'electronics', label: 'Tech', icon: 'monitor' },
  { id: 'beauty', label: 'Beauty', icon: 'droplet' },
  { id: 'other', label: 'Other', icon: 'box' },
];

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const RAIL_CARD_WIDTH = 160;
const SEARCH_DEBOUNCE_MS = 300;
// Stable empty reference so the grid's fallback doesn't churn useMemo deps when
// the query has no data yet.
const EMPTY_LISTINGS: Listing[] = [];

type UserResult = Awaited<ReturnType<typeof searchUsers>>[number];

export default function DiscoverScreen() {
  // Query params from /news Saved tab (and external links). When set, the
  // screen boots with the search pre-applied so the user lands on results.
  const params = useLocalSearchParams<{ q?: string; category?: Category; savedId?: string }>();
  const initialQuery = typeof params.q === 'string' ? params.q : '';
  const initialCat = typeof params.category === 'string' ? (params.category as CatTile['id']) : null;
  const savedId = typeof params.savedId === 'string' ? params.savedId : null;

  const { user } = useAuth();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [activeCat, setActiveCat] = useState<CatTile['id'] | null>(initialCat);
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

    if (typeof params.category === 'string') {
      const isValid = CATEGORY_TILES.some(t => t.id === params.category);
      setActiveCat(isValid ? (params.category as CatTile['id']) : null);
    } else {
      setActiveCat(null);
    }
  }, [params.q, params.category]);

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

  // React Query owns the grid + personalized rails. staleTime (60s) reproduces
  // the old isFresh() gate; the three reads dedupe and cache independently so
  // the grid skeleton no longer waits on the recommendation pipeline.
  const gridQ = useFeedListingsQuery({ tab: 'popular', category: browseCat, limit: 60 });
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

  const onRefresh = useCallback(async () => {
    await Promise.all([gridRefetch(), recRefetch(), recentRefetch()]);
  }, [gridRefetch, recRefetch, recentRefetch]);

  // Web pull-to-refresh — RefreshControl is inert on react-native-web.
  const { scrollRef, pull, nodeTop, threshold } = useWebPullToRefresh({ refreshing, onRefresh });

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
  // Idle = browsing, not searching: rails are shown only here so search
  // results stay focused on the query.
  const idle = !hasQuery && !browseCat;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
        contentContainerStyle={{ paddingBottom: tabClear }}
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

        {/* Search */}
        <Animated.View
          style={[
            {
              marginHorizontal: 16,
              marginTop: 10,
              backgroundColor: colors.panel,
              borderRadius: radii.pill,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 6,
              height: 46,
            },
            fade,
          ]}
        >
          <Feather name="search" size={18} color={colors.muteSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search items, brands, sellers"
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
        </Animated.View>

        {/* Categories — clean circular icons */}
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
              <Pressable hitSlop={HIT_SLOP_8} onPress={() => setActiveCat(null)}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.purple }}>Clear</Text>
              </Pressable>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
          >
            {CATEGORY_TILES.map((cat) => {
              const active = activeCat === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setActiveCat(active ? null : cat.id)}
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
        </View>

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

        {/* For you — personalized rail (hybrid recommender). Idle browse only. */}
        {idle && user && (recLoading || recommended.length > 0) ? (
          <View style={{ marginTop: 22 }}>
            <SectionHeader title="For you" />
            {recLoading ? (
              <RailSkeleton />
            ) : (
              <Rail listings={recommended} testID="discover-for-you" />
            )}
          </View>
        ) : null}

        {/* Recently viewed — pick up where you left off. Hidden when empty. */}
        {idle && user && recentlyViewed.length > 0 && !recentLoading ? (
          <View style={{ marginTop: 22 }}>
            <SectionHeader title="Recently viewed" />
            <Rail listings={recentlyViewed} testID="discover-recently-viewed" />
          </View>
        ) : null}

        {/* People — sellers matching the query. Shown above item results so
            "search for a user" lands them right away. */}
        {hasQuery && userResults.length > 0 ? (
          <View style={{ marginTop: 22 }}>
            <SectionHeader
              title="People"
              count={userResults.length}
              rightText={userResults.length === 1 ? 'person' : 'people'}
            />
            <View style={{ paddingHorizontal: 8 }}>
              {userResults.map((u) => (
                <PeopleRow key={u.id} user={u} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Results */}
        <View style={{ marginTop: 22 }}>
          <SectionHeader
            title={
              hasQuery
                ? 'Items'
                : browseCat
                  ? `In ${CATEGORY_TILES.find((c) => c.id === browseCat)?.label}`
                  : 'Trending'
            }
            count={results.length}
            rightText={results.length === 1 ? 'item' : 'items'}
          />

          {loading ? (
            <GridSkeleton columns={columns} cardW={cardW} />
          ) : results.length === 0 ? (
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
            <GridSection listings={results} columns={columns} cardW={cardW} />
          )}
        </View>
      </ScrollView>
      <WebPullIndicator pull={pull} refreshing={refreshing} nodeTop={nodeTop} threshold={threshold} />
    </SafeAreaView>
  );
}

// A single person result. Taps through to the seller's profile, where the
// follow / message / followers actions live.
function PeopleRow({ user }: { user: UserResult }) {
  const avatar = user.avatar_url ? getOptimizedImageUrl(user.avatar_url, { width: 120 }) : null;
  const initial = (user.full_name || user.username || 'U').trim().charAt(0).toUpperCase();
  const followers = Number(user.followers_count ?? 0);
  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`View @${user.username}'s profile`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {avatar ? (
          <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.purple }}>{initial}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {user.full_name || user.username}
          </Text>
          {user.is_verified && <Feather name="check-circle" size={12} color={colors.purple} />}
        </View>
        <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 1 }} numberOfLines={1}>
          @{user.username}
          {followers > 0 ? ` · ${followers} ${followers === 1 ? 'follower' : 'followers'}` : ''}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.muteSoft} />
    </Pressable>
  );
}

// Horizontal listing rail used by "For you" and "Recently viewed".
function Rail({ listings, testID }: { listings: Listing[]; testID?: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}
      testID={testID}
    >
      {listings.map((listing) => (
        <View key={listing.id} style={{ width: RAIL_CARD_WIDTH }}>
          <ListingCard listing={listing} />
        </View>
      ))}
    </ScrollView>
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
