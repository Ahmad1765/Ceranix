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
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { AnonCards } from '@/components/AnonCards';
import {
  fetchFollowingListingsResult,
  fetchListingsResult,
  type FeedTab,
} from '@/lib/listings';
import { fetchFollowing, fetchSuggestedFollows, toggleFollow } from '@/lib/follows';
import { getFeedSnapshot, putFeedSnapshot } from '@/lib/listingCache';
import { onListingCreated } from '@/lib/listingEvents';
import { getOptimizedImageUrl } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Listing, User as Profile } from '@/types';

type TabName = 'For you' | 'Popular' | 'Following';

const FEED_COLUMNS = 3;
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
    Animated.timing(colorAnim, {
      toValue: isActive ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isActive]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(15,15,15,0.04)', '#6C47FF'],
  });

  const textColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#0F0F0F', '#ffffff'],
  });

  const iconName = tab === 'For you' ? 'sparkles' : tab === 'Popular' ? 'flame' : 'person';

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
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 999,
          }}
        >
          <Ionicons
            name={iconName as any}
            size={14}
            color={isActive ? '#ffffff' : '#0F0F0F'}
            style={{ marginRight: 5 }}
          />
          <Animated.Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>
            {tab}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const TABS: TabName[] = ['For you', 'Popular', 'Following'];

const TAB_TO_FEED: Record<Exclude<TabName, 'Following'>, FeedTab> = {
  'For you': 'for_you',
  Popular: 'popular',
};

export default function HomeScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabName>('For you');
  const [refreshing, setRefreshing] = useState(false);
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
  // Seed from the last-rendered snapshot for this tab so a re-mount (or a
  // tab swap that races a wedged Supabase client) never blanks the screen.
  // null tab maps to an empty snapshot — Following has no snapshot anyway.
  const initialTab: TabName = 'For you';
  const initialSnapshot = getFeedSnapshot(initialTab) ?? [];
  const [listings, setListings] = useState<Listing[]>(initialSnapshot);
  const [loading, setLoading] = useState(initialSnapshot.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const hasLoadedRef = useRef(initialSnapshot.length > 0);
  const PAGE_SIZE = 60;

  // Single commit: flips loading off in the SAME setter call that installs
  // the rows, so the FlatList never sees the intermediate
  // `loading=true, listings=rows` state that previously left skeletons stuck
  // until a manual reload.
  // Returns the discriminated result so callers can tell "feed is genuinely
  // empty" from "fetch wedged" and decide whether to commit or preserve.
  const load = useCallback(
    async (tab: TabName): Promise<{ ok: true; rows: Listing[] } | { ok: false }> => {
      let result: { ok: true; rows: Listing[] } | { ok: false };
      if (tab === 'Following') {
        if (!user?.id) return { ok: true, rows: [] };
        result = await fetchFollowingListingsResult(user.id);
      } else {
        result = await fetchListingsResult({
          tab: TAB_TO_FEED[tab as Exclude<TabName, 'Following'>],
        });
      }
      if (!result.ok) return result;
      const firstUrls = result.rows
        .slice(0, 12)
        .map((l) => l.images?.[0])
        .filter(Boolean)
        .map((u) => getOptimizedImageUrl(u as string, { width: 400 }));
      if (firstUrls.length) Image.prefetch(firstUrls, { cachePolicy: 'memory-disk' });
      return result;
    },
    [user?.id],
  );

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

  // Infinite scroll: pull the next page when the FlatList reports it's near
  // the bottom. Following gates on listings.length === 0 with no pagination
  // because the followed-seller list is generally small.
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || reachedEnd) return;
    if (activeTab === 'Following') return;
    if (listings.length === 0) return;
    setLoadingMore(true);
    const result = await fetchListingsResult({
      tab: TAB_TO_FEED[activeTab as Exclude<TabName, 'Following'>],
      limit: PAGE_SIZE,
      offset: listings.length,
    });
    if (result.ok) {
      if (result.rows.length === 0) {
        setReachedEnd(true);
      } else {
        setListings((prev) => {
          // De-dupe by id in case a freshly-published row already lives at the
          // top of `prev` from onListingCreated.
          const seen = new Set(prev.map((l) => l.id));
          const next = prev.concat(result.rows.filter((l) => !seen.has(l.id)));
          putFeedSnapshot(activeTab, next);
          return next;
        });
      }
    }
    setLoadingMore(false);
  }, [activeTab, listings.length, loading, loadingMore, reachedEnd]);

  // Reset pagination when the tab flips (each tab has its own ordering).
  useEffect(() => {
    setReachedEnd(false);
    setLoadingMore(false);
  }, [activeTab]);

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
          // Pull the Following feed in the background so the next swipe to
          // that tab already has data.
          load('Following').then((r) => {
            if (r.ok) putFeedSnapshot('Following' as TabName, r.rows);
          });
        }
      } catch (e: any) {
        setFollowingState((prev) => ({ ...prev, [suggestedId]: already }));
        toast.show(e?.message ?? 'Could not follow', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    },
    [followingState, user?.id, toast, load],
  );

  // Initial + tab-change load: show skeletons (only if we don't already have
  // a snapshot for this tab to render against).
  useEffect(() => {
    let cancelled = false;
    const snapshot = getFeedSnapshot(activeTab);
    if (snapshot && snapshot.length > 0) {
      // Render the snapshot immediately so the user never sees a skeleton
      // when we already know what to show. The fetch below refreshes it.
      setListings(snapshot);
      setLoading(false);
      hasLoadedRef.current = true;
    } else {
      setLoading(true);
    }
    // Hard ceiling — if load() never resolves/rejects (a wedged fetch that
    // somehow slips past every other safety net), clear the skeleton anyway
    // so the user sees the empty state and can pull-to-refresh instead of
    // staring at gray boxes forever.
    const wedgeKiller = setTimeout(() => {
      if (cancelled) return;
      console.warn('[home] load() wedge ceiling fired — clearing skeleton');
      setLoading(false);
      hasLoadedRef.current = true;
      // Fire-and-forget retry: a wedge that hit the ceiling is almost always
      // transient on the next attempt. Don't await — the ceiling already
      // unblocked the UI; if this retry happens to return rows we just
      // prepend them silently. Only commit on ok:true so a second wedge
      // doesn't blank a screen that may have prior content.
      load(activeTab)
        .then((result) => {
          if (cancelled || !result.ok) return;
          if (result.rows.length > 0) {
            setListings(result.rows);
            putFeedSnapshot(activeTab, result.rows);
          }
        })
        .catch(() => {});
    }, 12_000);
    load(activeTab)
      .then((result) => {
        if (cancelled) return;
        clearTimeout(wedgeKiller);
        // Commit listings + loading=false together so React renders once with
        // the final state. Without this, the FlatList briefly sees
        // listings=rows while loading=true and the data memo zeroes them out.
        // On ok:false, leave listings alone — we either have a snapshot
        // already showing or nothing yet, but committing [] would mis-signal
        // "feed is empty" to the user.
        if (result.ok) {
          setListings(result.rows);
          putFeedSnapshot(activeTab, result.rows);
        }
        setLoading(false);
        hasLoadedRef.current = true;
        // If the first load came back empty (likely a transient wedge that
        // hit a timeout rather than a genuinely empty feed) OR explicitly
        // failed, silently retry once after a short delay so the user
        // doesn't have to refresh.
        const needsRetry = !result.ok || (result.ok && result.rows.length === 0);
        if (needsRetry && activeTab !== 'Following') {
          setTimeout(() => {
            if (cancelled) return;
            load(activeTab)
              .then((retry) => {
                if (cancelled || !retry.ok) return;
                if (retry.rows.length > 0) {
                  setListings(retry.rows);
                  putFeedSnapshot(activeTab, retry.rows);
                }
              })
              .catch(() => {});
          }, 1500);
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(wedgeKiller);
        setLoading(false);
        hasLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
      clearTimeout(wedgeKiller);
    };
  }, [activeTab, load]);

  // Silently refetch whenever the tab gains focus (e.g. after publishing a
  // listing from the upload tab). Skipping the first focus avoids running
  // back-to-back with the initial mount fetch above. Without this, freshly
  // uploaded listings only appeared after the app was restarted.
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) return;
      if (activeTab === 'Following') return;
      let cancelled = false;
      load(activeTab)
        .then((result) => {
          if (cancelled || !result.ok) return;
          // Silent refetch only commits when the fetch succeeded. On
          // ok:false the supabase client wedged — keep the user's current
          // feed on screen rather than wipe it. Genuine "feed is empty"
          // (ok:true, rows=[]) does commit.
          setListings(result.rows);
          putFeedSnapshot(activeTab, result.rows);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [activeTab, load]),
  );

  // Listen for freshly published listings and prepend them to the feed so
  // the user sees their upload land at the top immediately — no need to
  // wait for the next focus refetch (or refresh the page if that refetch
  // raced/failed).
  useEffect(() => {
    return onListingCreated((listing) => {
      if (activeTab !== 'For you') return;
      setListings((prev) => {
        if (prev.some((l) => l.id === listing.id)) return prev;
        const next = [listing, ...prev];
        putFeedSnapshot(activeTab, next);
        return next;
      });
    });
  }, [activeTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const result = await load(activeTab);
    if (result.ok) {
      setListings(result.rows);
      putFeedSnapshot(activeTab, result.rows);
    }
    // On ok:false, preserve the current feed — pull-to-refresh against a
    // wedged client used to wipe the screen.
    setRefreshing(false);
  }, [activeTab, load]);

  // Pad to a multiple of FEED_COLUMNS so trailing rows don't stretch their
  // cards across the full width when listings.length isn't divisible by 3.
  // Note: we DON'T gate this on `loading` — listings render the moment they
  // arrive. The skeleton ListEmptyComponent below keys off `loading` instead.
  const data = useMemo<FeedItem[]>(() => {
    if (listings.length === 0) return [];
    const remainder = listings.length % FEED_COLUMNS;
    if (remainder === 0) return listings;
    const padCount = FEED_COLUMNS - remainder;
    const pads: FeedItem[] = Array.from({ length: padCount }, (_, i) => ({
      __placeholder: true as const,
      id: `__pad-${i}`,
    }));
    return [...listings, ...pads];
  }, [listings]);

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) =>
      isPlaceholder(item) ? <View style={{ flex: 1 }} /> : <ListingCard listing={item} />,
    [],
  );

  const renderSkeleton = useCallback(
    () => (
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginBottom: 6 }}>
        {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
      </View>
    ),
    [],
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
          className="w-[42px] h-[42px] border border-ink-hair rounded-[10px] items-center justify-center bg-surface"
        >
          <Feather name="message-circle" size={18} color="#0F0F0F" />
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
        key="following-3"
        style={{ flex: 1, display: activeTab === 'Following' ? 'flex' : 'none' }}
        data={activeTab === 'Following' ? data : []}
        keyExtractor={keyExtractor}
        numColumns={FEED_COLUMNS}
        columnWrapperStyle={{ gap: 6, paddingHorizontal: 12 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        updateCellsBatchingPeriod={50}
        windowSize={8}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C47FF" />
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
        contentContainerStyle={{ paddingBottom: 24 }}
      />

      {/* Product grid — always mounted, hidden when Following is active */}
      <FlatList
        key="feed-3"
        style={{ flex: 1, display: activeTab !== 'Following' ? 'flex' : 'none' }}
        data={data}
        keyExtractor={keyExtractor}
        numColumns={FEED_COLUMNS}
        columnWrapperStyle={{ gap: 6, paddingHorizontal: 12 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        updateCellsBatchingPeriod={50}
        windowSize={8}
        removeClippedSubviews={false}
        onEndReachedThreshold={0.5}
        onEndReached={loadMore}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 16 }}>{renderSkeleton()}</View>
          ) : reachedEnd && listings.length > 0 ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.45)' }}>
                You've reached the end.
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C47FF" />
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
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#6C47FF', marginRight: 10 }} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F0F0F', letterSpacing: 1.4, textTransform: 'uppercase' }}>
                  Empty rack
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 38,
                  fontWeight: '900',
                  color: '#0F0F0F',
                  lineHeight: 40,
                  letterSpacing: -1.4,
                }}
              >
                Nothing here{'\n'}yet.
              </Text>
              <Text style={{ fontSize: 14, color: 'rgba(15,15,15,0.62)', marginTop: 10, lineHeight: 20 }}>
                Pull down to refresh, or be the first to post — the upload tab is one tap away.
              </Text>
            </View>
          )
        }
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
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
