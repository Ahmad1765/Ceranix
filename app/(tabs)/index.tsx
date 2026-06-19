import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';

// JS-driven on web (no RCTAnimation), native-driven on iOS/Android.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { AnonCards } from '@/components/AnonCards';
import { useWebPullToRefresh, WebPullIndicator } from '@/components/WebRefresh';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { fetchFollowing, fetchSuggestedFollows, toggleFollow } from '@/lib/follows';
import { useHomeFeedQuery, qk, type HomeFeedTab } from '@/lib/queries';
import { onListingCreated } from '@/lib/listingEvents';
import { getOptimizedImageUrl } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { colors } from '@/lib/theme';
import { useResponsiveColumns, useTabBarClearance } from '@/lib/responsive';
import type { Listing, User as Profile } from '@/types';

type TabName = 'For you' | 'Popular' | 'Following';

// Same column ramp as discover so listings render at identical sizes on
// every screen of the app: 2-up on phones, 3 on big phones, 4 on tablets.
const GRID_THRESHOLDS = [560, 900, 1200];
const GRID_GAP = 8;
type FeedItem = Listing | { __placeholder: true; id: string };

function isPlaceholder(item: FeedItem): item is { __placeholder: true; id: string } {
  return (item as { __placeholder?: boolean }).__placeholder === true;
}

function AnimatedTabPill({
  tab,
  isActive,
  onPress,
}: {
  tab: TabName;
  isActive: boolean;
  onPress: () => void;
}) {
  const colorAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.timing(colorAnim, {
      toValue: isActive ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [isActive]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', 'rgba(108,71,255,0.12)'],
  });

  const borderColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E5E5E5', '#6C47FF'],
  });

  const textColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#666666', '#0F0F0F'],
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: USE_NATIVE_DRIVER, speed: 30, bounciness: 4 }).start()
      }
      onPressOut={() =>
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER, speed: 20, bounciness: 6 }).start()
      }
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Animated.View
          style={{
            backgroundColor,
            borderColor,
            borderWidth: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 8,
            borderRadius: 999,
          }}
        >
          <Animated.Text style={{ fontSize: 15, fontWeight: '500', color: textColor }}>
            {tab}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const TABS: TabName[] = ['For you', 'Popular', 'Following'];

const TAB_KEY: Record<TabName, HomeFeedTab> = {
  'For you': 'for_you',
  Popular: 'popular',
  Following: 'following',
};

// Stable empty reference so the flattened-listings memo fallback doesn't churn.
const EMPTY_LISTINGS: Listing[] = [];

export default function HomeScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const columns = useResponsiveColumns({ min: 2, max: 4, thresholds: GRID_THRESHOLDS });
  // Bottom padding that clears the floating tab bar overlaying the feed.
  const tabClear = useTabBarClearance();
  const [activeTab, setActiveTab] = useState<TabName>('For you');
  // Suggested people for an empty Following tab. Live data ranked by
  // followers; updated whenever the auth user changes so the exclusion list
  // (self + already-followed) stays accurate.
  const [suggestions, setSuggestions] = useState<
    Array<Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url' | 'followers_count' | 'is_verified'>>
  >([]);
  const [followingState, setFollowingState] = useState<Record<string, boolean>>({});
  // Profiles the current user follows. Surfaced as a horizontal strip at the
  // top of the Following tab so the user can see the people themselves, not
  // just their listings (which can be empty even when follows exist).
  const [followedProfiles, setFollowedProfiles] = useState<
    Array<Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url' | 'is_verified'>>
  >([]);
  // React Query owns the feed now. One infinite query per active tab; switching
  // tabs swaps the query key, so each tab's pages are cached independently
  // (replacing the feedSnapshots cache) and a wedged fetch throws — which makes
  // React Query keep the last good pages instead of blanking the grid.
  const queryClient = useQueryClient();
  const feedTab = TAB_KEY[activeTab];
  const feedQ = useHomeFeedQuery(feedTab, user?.id ?? null);

  // Flatten pages, de-duping by id (a row prepended via onListingCreated can
  // also surface in a later fetched page).
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
  // Pull-to-refresh spinner: a refetch of existing pages, not a next-page fetch.
  const refreshing = feedQ.isRefetching && !feedQ.isFetchingNextPage;

  const { refetch: feedRefetch, fetchNextPage, isStale: feedStale } = feedQ;

  // Warm the image cache for the first screenful so cards paint instantly.
  useEffect(() => {
    const urls = listings
      .slice(0, 12)
      .map((l) => l.images?.[0])
      .filter(Boolean)
      .map((u) => getOptimizedImageUrl(u as string, { width: 400 }));
    if (urls.length) Image.prefetch(urls, { cachePolicy: 'memory-disk' });
  }, [listings]);

  // Pull a fresh batch of "people to follow" whenever the auth user changes.
  // We don't poll — the strip is a static-ish recommendation, not a feed.
  useEffect(() => {
    let cancelled = false;
    fetchSuggestedFollows(user?.id ?? null).then((rows) => {
      if (cancelled) return;
      setSuggestions(rows);
      setFollowingState({});
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Followed profiles for the Following-tab strip. Refetched on user change
  // and whenever the home tab regains focus, so a follow toggled elsewhere
  // shows up here without a manual reload.
  const loadFollowed = useCallback(async () => {
    if (!user?.id) {
      setFollowedProfiles([]);
      return;
    }
    const rows = await fetchFollowing(user.id);
    setFollowedProfiles(rows);
  }, [user?.id]);
  useEffect(() => {
    loadFollowed();
  }, [loadFollowed]);
  useFocusEffect(
    useCallback(() => {
      loadFollowed();
    }, [loadFollowed]),
  );

  // Infinite scroll: ask React Query for the next page. It no-ops when there's
  // no next page or a fetch is already in flight; Following never paginates.
  // (No tab-reset effect needed — switching tabs swaps the query key, so each
  // tab's page list resets on its own.)
  const loadMore = useCallback(() => {
    if (feedTab === 'following') return;
    if (feedQ.hasNextPage && !feedQ.isFetchingNextPage) fetchNextPage();
  }, [feedTab, feedQ.hasNextPage, feedQ.isFetchingNextPage, fetchNextPage]);

  const handleFollowSuggestion = useCallback(
    async (suggestedId: string, username: string) => {
      if (!user?.id) {
        toast.show('Sign in to follow', { variant: 'info', icon: 'log-in' });
        router.push('/auth/login');
        return;
      }
      // Optimistic flip; rollback on failure.
      const already = followingState[suggestedId] === true;
      setFollowingState((prev) => ({ ...prev, [suggestedId]: !already }));
      try {
        const next = await toggleFollow(user.id, suggestedId, already);
        setFollowingState((prev) => ({ ...prev, [suggestedId]: next.isFollowing }));
        if (next.isFollowing) {
          toast.show(`Following @${username}`, { variant: 'info', icon: 'user-check' });
          // Invalidate the Following feed so the next visit refetches with the
          // newly-followed seller's listings.
          queryClient.invalidateQueries({ queryKey: qk.homeFeed('following', user.id) });
        }
      } catch (e: any) {
        setFollowingState((prev) => ({ ...prev, [suggestedId]: already }));
        toast.show(e?.message ?? 'Could not follow', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    },
    [followingState, user?.id, toast, queryClient],
  );

  // Revalidate on focus (e.g. after publishing from the upload tab), but only
  // when the feed has gone stale — React Query's staleTime reproduces the old
  // isFresh() gate, so a just-loaded feed is reused. Following is skipped here
  // (its profiles strip refreshes separately via loadFollowed). The initial
  // fetch and tab-change fetch are handled automatically by useInfiniteQuery.
  useFocusEffect(
    useCallback(() => {
      if (feedTab === 'following') return;
      if (feedStale) feedRefetch();
    }, [feedTab, feedStale, feedRefetch]),
  );

  // Freshly published listings: prepend to the For-you feed's first page so the
  // user's upload lands at the top immediately, without waiting for a refetch.
  useEffect(() => {
    return onListingCreated((listing) => {
      if (feedTab !== 'for_you') return;
      const key = qk.homeFeed('for_you', user?.id ?? null);
      queryClient.setQueryData<InfiniteData<Listing[], number>>(key, (old) => {
        if (!old) return old;
        if (old.pages.some((page) => page.some((l) => l.id === listing.id))) return old;
        const [first = [], ...rest] = old.pages;
        return { ...old, pages: [[listing, ...first], ...rest] };
      });
    });
  }, [feedTab, user?.id, queryClient]);

  const onRefresh = useCallback(async () => {
    // refetch revalidates all loaded pages. On failure React Query keeps the
    // current pages on screen, so pull-to-refresh can't blank a wedged feed.
    await feedRefetch();
  }, [feedRefetch]);

  // Web pull-to-refresh — RefreshControl is inert on react-native-web, so we
  // drive the scroll-down gesture ourselves. No-op on native.
  const { scrollRef, pull, nodeTop, threshold } = useWebPullToRefresh({ refreshing, onRefresh });

  // Pad to a multiple of the column count so trailing rows don't stretch
  // their cards across the full width when listings.length isn't divisible.
  // Note: we DON'T gate this on `loading` — listings render the moment they
  // arrive. The skeleton ListEmptyComponent below keys off `loading` instead.
  const data = useMemo<FeedItem[]>(() => {
    if (listings.length === 0) return [];
    const remainder = listings.length % columns;
    if (remainder === 0) return listings;
    const padCount = columns - remainder;
    const pads: FeedItem[] = Array.from({ length: padCount }, (_, i) => ({
      __placeholder: true as const,
      id: `__pad-${i}`,
    }));
    return [...listings, ...pads];
  }, [listings, columns]);

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) =>
      isPlaceholder(item) ? <View style={{ flex: 1 }} /> : <ListingCard listing={item} />,
    [],
  );

  const renderSkeleton = useCallback(
    () => (
      <View style={{ flexDirection: 'row', gap: GRID_GAP, paddingHorizontal: 12, marginBottom: 6 }}>
        {Array.from({ length: columns }, (_, i) => <SkeletonCard key={i} />)}
      </View>
    ),
    [columns],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      {/* Search Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Pressable
          onPress={() => router.push('/(tabs)/discover' as any)}
          accessibilityRole="button"
          accessibilityLabel="Search items, brands, sellers"
          className="flex-1 flex-row items-center bg-ink-panel rounded-full px-4 py-[10px] mr-3"
        >
          <Feather name="search" size={18} color="rgba(15,15,15,0.45)" />
          <Text className="ml-2.5 flex-1 text-[15px] text-ink-mute">
            What are you looking for today?
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(tabs)/chat' as any)}
          accessibilityRole="button"
          accessibilityLabel="Open chats"
          className="w-[42px] h-[42px] border border-ink-hair rounded-full items-center justify-center bg-surface"
        >
          <Feather name="message-circle" size={18} color={colors.ink} />
        </Pressable>
      </View>

      {/* Feed tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4"
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingBottom: 12, gap: 8 }}
      >
        {TABS.map((tab) => (
          <AnimatedTabPill
            key={tab}
            tab={tab}
            isActive={activeTab === tab}
            onPress={() => setActiveTab(tab)}
          />
        ))}
      </ScrollView>

      {/* Following view — listing grid if the user follows people, otherwise
          a live "people to follow" strip with real profiles. */}
      <FlatList
        ref={activeTab === 'Following' ? scrollRef : undefined}
        key={`following-${columns}`}
        style={{ flex: 1, display: activeTab === 'Following' ? 'flex' : 'none' }}
        data={activeTab === 'Following' ? data : []}
        keyExtractor={keyExtractor}
        numColumns={columns}
        columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: 12 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        updateCellsBatchingPeriod={50}
        windowSize={8}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          followedProfiles.length > 0 ? (
            <FollowedProfilesStrip
              profiles={followedProfiles}
              onSeeAll={() => router.push('/profile/following' as any)}
            />
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View>
              {renderSkeleton()}
              {renderSkeleton()}
              {renderSkeleton()}
            </View>
          ) : (
            <View>
              <Text className="text-center text-[15px] text-ink leading-[22px] px-8 pt-6 pb-5">
                {!user
                  ? 'Sign in and follow members to see their listings here.'
                  : followedProfiles.length > 0
                    ? "The people you follow haven't posted anything yet.\nCheck back later or follow more sellers below."
                    : "You're not following anyone yet.\nFollow members to see their listings here."}
              </Text>
              {suggestions.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Text style={{ fontSize: 13, color: '#0F0F0F88' }}>
                    No suggestions right now.
                  </Text>
                </View>
              ) : (
                suggestions.map((s) => {
                  const isFollowing = followingState[s.id] === true;
                  const display = s.full_name || s.username;
                  const handle = `@${s.username}`;
                  return (
                    <View key={s.id} className="flex-row items-center px-4 py-3">
                      <Pressable
                        onPress={() => router.push(`/user/${s.id}` as any)}
                        style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden' }}
                      >
                        {s.avatar_url ? (
                          <Image
                            source={{ uri: getOptimizedImageUrl(s.avatar_url, { width: 120 }) }}
                            style={{ width: 52, height: 52, borderRadius: 26 }}
                            className="bg-ink-panel"
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={150}
                          />
                        ) : (
                          <View
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: 26,
                              backgroundColor: 'rgba(108,71,255,0.12)',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ fontSize: 18, fontWeight: '900', color: '#6C47FF' }}>
                              {(display.trim().charAt(0) || 'U').toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => router.push(`/user/${s.id}` as any)}
                        className="flex-1 ml-3"
                      >
                        <View className="flex-row items-center">
                          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                            {display}
                          </Text>
                          {s.is_verified && (
                            <Feather
                              name="check-circle"
                              size={12}
                              color="#6C47FF"
                              style={{ marginLeft: 4 }}
                            />
                          )}
                        </View>
                        <Text className="text-[13px] text-ink-mute mt-0.5" numberOfLines={1}>
                          {handle}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleFollowSuggestion(s.id, s.username)}
                        className={`rounded-[10px] px-5 py-2 flex-row items-center ${isFollowing ? 'bg-white border border-ink-hair' : 'bg-primary'}`}
                      >
                        <Feather
                          name={isFollowing ? 'check' : 'plus'}
                          size={13}
                          color={isFollowing ? '#0F0F0F' : '#fff'}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          className={`text-[13px] font-semibold ${isFollowing ? 'text-ink' : 'text-white'}`}
                        >
                          {isFollowing ? 'Following' : 'Follow'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          )
        }
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: tabClear }}
      />

      {/* Product grid — always mounted, hidden when Following is active */}
      <FlatList
        key={`feed-${columns}`}
        style={{ flex: 1, display: activeTab !== 'Following' ? 'flex' : 'none' }}
        data={activeTab !== 'Following' ? data : []}
        keyExtractor={keyExtractor}
        numColumns={columns}
        columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: 12 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        updateCellsBatchingPeriod={50}
        windowSize={8}
        removeClippedSubviews={Platform.OS !== 'web'}
        onEndReachedThreshold={0.5}
        onEndReached={loadMore}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 16 }}>{renderSkeleton()}</View>
          ) : reachedEnd && listings.length > 0 ? (
            <View
              style={{
                paddingVertical: 28,
                paddingHorizontal: 40,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: 'Inter_600SemiBold',
                  color: colors.muteSoft,
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                }}
              >
                All caught up
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          activeTab === 'For you' ? (
            <View className="pb-4">
              <AnonCards />
            </View>
          ) : (
            <View className="pt-3 pb-2" />
          )
        }
        ListEmptyComponent={
          loading ? (
            <View>
              {renderSkeleton()}
              {renderSkeleton()}
              {renderSkeleton()}
            </View>
          ) : (
            <View style={{ paddingHorizontal: 24, paddingVertical: 56, alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginRight: 10 }} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.ink, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                  Empty rack
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 36,
                  color: colors.ink,
                  lineHeight: 40,
                  letterSpacing: -1,
                  fontFamily: 'Fraunces_600SemiBold',
                }}
              >
                Nothing here{'\n'}yet.
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.mute,
                  marginTop: 10,
                  lineHeight: 20,
                  fontFamily: 'Inter_400Regular',
                }}
              >
                Pull down to refresh, or be the first to post. The upload tab is one tap away.
              </Text>
            </View>
          )
        }
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: tabClear }}
        ref={activeTab !== 'Following' ? scrollRef : undefined}
      />
      <WebPullIndicator pull={pull} refreshing={refreshing} nodeTop={nodeTop} threshold={threshold} />
    </SafeAreaView>
  );
}

// Horizontal "people you follow" strip rendered above the Following feed.
// Tapping an avatar opens that profile; "See all" routes to /profile/following
// for the full list (with Follow/Unfollow per row).
function FollowedProfilesStrip({
  profiles,
  onSeeAll,
}: {
  profiles: Array<Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url' | 'is_verified'>>;
  onSeeAll: () => void;
}) {
  return (
    <View style={{ paddingTop: 8, paddingBottom: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F0F0F', letterSpacing: -0.1 }}>
          People you follow
        </Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#6C47FF' }}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 14 }}
      >
        {profiles.map((p) => {
          const display = p.full_name || p.username || 'U';
          const initial = display.trim().charAt(0).toUpperCase();
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/user/${p.id}` as any)}
              style={{ alignItems: 'center', width: 64 }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  borderWidth: 2,
                  borderColor: '#6C47FF',
                  padding: 2,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: 24,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(108,71,255,0.10)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {p.avatar_url ? (
                    <Image
                      source={{ uri: getOptimizedImageUrl(p.avatar_url, { width: 120 }) }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#6C47FF' }}>{initial}</Text>
                  )}
                </View>
              </View>
              <Text
                style={{ fontSize: 11.5, fontWeight: '600', color: '#0F0F0F', marginTop: 6, maxWidth: 64 }}
                numberOfLines={1}
              >
                @{p.username}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
