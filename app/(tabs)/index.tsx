import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { AnonCards } from '@/components/AnonCards';
import { fetchListings, type FeedTab } from '@/lib/listings';
import { getOptimizedImageUrl } from '@/lib/images';
import type { Listing } from '@/types';

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
        Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: true, speed: 30, bounciness: 4 }).start()
      }
      onPressOut={() =>
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start()
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

const SUGGESTED_USERS = [
  { id: 'u1', display_name: 'dafneee', username: '@dafneee', avatar: 'https://picsum.photos/seed/dafne/80/80' },
  { id: 'u2', display_name: 'T.Fashion', username: '@t.fashion', avatar: 'https://picsum.photos/seed/tfash/80/80' },
  { id: 'u3', display_name: 'Thea settergren', username: '@theasettergren', avatar: 'https://picsum.photos/seed/thea/80/80' },
  { id: 'u4', display_name: 'Leah Ferm', username: '@leah.ferm', avatar: 'https://picsum.photos/seed/leah/80/80' },
  { id: 'u5', display_name: 'Edita Kondrat Art', username: '@editakondratjewelry', avatar: 'https://picsum.photos/seed/edita/80/80' },
];

const TABS: TabName[] = ['For you', 'Popular', 'Following'];

const TAB_TO_FEED: Record<Exclude<TabName, 'Following'>, FeedTab> = {
  'For you': 'for_you',
  Popular: 'popular',
};

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<TabName>('For you');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<Listing[]>([]);
  const hasLoadedRef = useRef(false);

  // Single commit: flips loading off in the SAME setter call that installs
  // the rows, so the FlatList never sees the intermediate
  // `loading=true, listings=rows` state that previously left skeletons stuck
  // until a manual reload.
  const load = useCallback(async (tab: TabName): Promise<Listing[]> => {
    if (tab === 'Following') return [];
    const rows = await fetchListings({ tab: TAB_TO_FEED[tab as Exclude<TabName, 'Following'>] });
    const firstUrls = rows
      .slice(0, 12)
      .map((l) => l.images?.[0])
      .filter(Boolean)
      .map((u) => getOptimizedImageUrl(u as string, { width: 400 }));
    if (firstUrls.length) Image.prefetch(firstUrls, { cachePolicy: 'memory-disk' });
    return rows;
  }, []);

  // Initial + tab-change load: show skeletons.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load(activeTab)
      .then((rows) => {
        if (cancelled) return;
        // Commit listings + loading=false together so React renders once with
        // the final state. Without this, the FlatList briefly sees
        // listings=rows while loading=true and the data memo zeroes them out.
        setListings(rows);
        setLoading(false);
        hasLoadedRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        hasLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
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
        .then((rows) => {
          if (!cancelled) setListings(rows);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [activeTab, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const rows = await load(activeTab);
    setListings(rows);
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
        <View className="flex-1 flex-row items-center bg-ink-panel rounded-full px-4 py-[10px] mr-3">
          <Feather name="search" size={18} color="rgba(15,15,15,0.45)" />
          <Text className="ml-2.5 flex-1 text-[15px] text-ink-mute">
            What are you looking for today?
          </Text>
        </View>
        <Pressable className="w-[42px] h-[42px] border border-ink-hair rounded-[10px] items-center justify-center bg-surface">
          <Feather name="sliders" size={18} color="#0F0F0F" />
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

      {/* Following view — always mounted, hidden when inactive */}
      <ScrollView
        style={{ flex: 1, display: activeTab === 'Following' ? 'flex' : 'none' }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Text className="text-center text-[15px] text-ink leading-[22px] px-8 pt-6 pb-5">
          {'You are not following anyone yet.\nFollow other members to see their listings here.'}
        </Text>
        {SUGGESTED_USERS.map((user) => (
          <View key={user.id} className="flex-row items-center px-4 py-3">
            <Image
              source={{ uri: getOptimizedImageUrl(user.avatar, { width: 120 }) }}
              style={{ width: 52, height: 52, borderRadius: 26 }}
              className="bg-ink-panel"
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
            <View className="flex-1 ml-3">
              <Text className="text-[15px] font-bold text-ink">{user.display_name}</Text>
              <Text className="text-[13px] text-ink-mute mt-0.5">{user.username}</Text>
            </View>
            <Pressable className="bg-primary rounded-[10px] px-5 py-2 flex-row items-center">
              <Feather name="plus" size={13} color="#fff" style={{ marginRight: 4 }} />
              <Text className="text-white text-[13px] font-semibold">Follow</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

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
