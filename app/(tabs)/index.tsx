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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PromoBanner } from '@/components/PromoBanner';
import { AnonCards } from '@/components/AnonCards';
import { fetchListings, type FeedTab } from '@/lib/listings';
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
    outputRange: ['#F2F2F2', '#6C47FF'],
  });

  const textColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#374151', '#ffffff'],
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
            color={isActive ? '#ffffff' : '#374151'}
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

  const load = useCallback(async (tab: TabName) => {
    if (tab === 'Following') return;
    const rows = await fetchListings({ tab: TAB_TO_FEED[tab as Exclude<TabName, 'Following'>] });
    setListings(rows);
    // Warm the image cache for the first few cards.
    const firstUrls = rows.slice(0, 12).map((l) => l.images?.[0]).filter(Boolean) as string[];
    if (firstUrls.length) Image.prefetch(firstUrls);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load(activeTab).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(activeTab);
    setRefreshing(false);
  }, [activeTab, load]);

  // Pad to a multiple of FEED_COLUMNS so trailing rows don't stretch their
  // cards across the full width when listings.length isn't divisible by 3.
  const data = useMemo<FeedItem[]>(() => {
    if (loading || listings.length === 0) return [];
    const remainder = listings.length % FEED_COLUMNS;
    if (remainder === 0) return listings;
    const padCount = FEED_COLUMNS - remainder;
    const pads: FeedItem[] = Array.from({ length: padCount }, (_, i) => ({
      __placeholder: true as const,
      id: `__pad-${i}`,
    }));
    return [...listings, ...pads];
  }, [listings, loading]);

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
        <View className="flex-1 flex-row items-center bg-[#F2F2F2] rounded-full px-4 py-[10px] mr-3">
          <Feather name="search" size={18} color="#9ca3af" />
          <Text className="ml-2.5 flex-1 text-[15px] text-gray-400">
            What are you looking for today?
          </Text>
        </View>
        <Pressable className="w-[42px] h-[42px] border border-gray-200 rounded-[10px] items-center justify-center bg-white">
          <Feather name="sliders" size={18} color="#111827" />
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
        <Text className="text-center text-[15px] text-gray-800 leading-[22px] px-8 pt-6 pb-5">
          {'Oops, you are not following anyone yet! 😭\nFollow other Carrinexers to get one step closer to your dream clothes! Here are some recommendations 🌀💛'}
        </Text>
        {SUGGESTED_USERS.map((user) => (
          <View key={user.id} className="flex-row items-center px-4 py-3">
            <Image
              source={{ uri: user.avatar }}
              style={{ width: 52, height: 52, borderRadius: 26 }}
              className="bg-gray-200"
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <View className="flex-1 ml-3">
              <Text className="text-[15px] font-bold text-gray-900">{user.display_name}</Text>
              <Text className="text-[13px] text-gray-500 mt-0.5">{user.username}</Text>
            </View>
            <Pressable className="bg-black rounded-[10px] px-5 py-2 flex-row items-center">
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
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        updateCellsBatchingPeriod={50}
        windowSize={8}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C47FF" />
        }
        ListHeaderComponent={
          activeTab === 'For you' ? (
            <View className="pb-4">
              <PromoBanner onReadMore={() => {}} />
              <View style={{ height: 4 }} />
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
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#d8f53a', marginRight: 10 }} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#0a0a0a', letterSpacing: 1.4, textTransform: 'uppercase' }}>
                  Empty rack
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 38,
                  fontWeight: '900',
                  color: '#0a0a0a',
                  lineHeight: 40,
                  letterSpacing: -1.4,
                }}
              >
                Nothing here{'\n'}yet.
              </Text>
              <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 10, lineHeight: 20 }}>
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
