import { useState, useCallback, useEffect, useRef } from 'react';
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
import type { Listing } from '@/types';

type TabName = 'For you' | 'Popular' | 'Following';

function AnimatedTabPill({
  tab,
  isActive,
  onPress,
}: {
  tab: TabName;
  isActive: boolean;
  onPress: () => void;
}) {
  // JS-driver anim for color (can't use native driver with backgroundColor)
  const colorAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  // Native-driver anim for scale (fast, jank-free)
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
      {/* Outer view handles scale (native driver) */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {/* Inner view handles background color (JS driver) */}
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

const MOCK_LISTINGS: Listing[] = [
  {
    id: '7',
    seller_id: 'u5',
    seller: { id: 'u5', username: 'maryam_closet', avatar_url: null, full_name: 'Maryam', bio: null, location: 'Karachi', rating: 4.7, total_sales: 22, created_at: '' },
    title: 'Superdry',
    description: 'Barely worn, great condition.',
    price: 499,
    category: 'clothing',
    gender: 'women',
    brand: 'Superdry',
    size: 'XS',
    condition: 'like_new',
    images: ['https://picsum.photos/seed/7/400/520'],
    is_sold: false,
    views: 55,
    likes: 11,
    created_at: '',
  },
  {
    id: '1',
    seller_id: 'u5',
    seller: { id: 'u5', username: 'maryam_closet', avatar_url: null, full_name: 'Maryam', bio: null, location: 'Karachi', rating: 4.7, total_sales: 22, created_at: '' },
    title: 'Superdry',
    description: 'Barely worn, great condition.',
    price: 649,
    category: 'clothing',
    gender: 'women',
    brand: 'Superdry',
    size: 'S',
    condition: 'like_new',
    images: ['https://picsum.photos/seed/17/400/520'],
    is_sold: false,
    views: 55,
    likes: 11,
    created_at: '',
  },
  {
    id: '8',
    seller_id: 'u6',
    seller: { id: 'u6', username: 'junaid_fits', avatar_url: null, full_name: 'Junaid', bio: null, location: 'Lahore', rating: 4.3, total_sales: 5, created_at: '' },
    title: 'Nudie',
    description: 'Slim fit, authentic.',
    price: 549,
    category: 'clothing',
    gender: 'men',
    brand: 'Nudie',
    size: '31/...',
    condition: 'good',
    images: ['https://picsum.photos/seed/8/400/520'],
    is_sold: false,
    views: 78,
    likes: 14,
    created_at: '',
  },
  {
    id: '9',
    seller_id: 'u6',
    seller: { id: 'u6', username: 'junaid_fits', avatar_url: null, full_name: 'Junaid', bio: null, location: 'Lahore', rating: 4.3, total_sales: 5, created_at: '' },
    title: 'Nudie Jeans',
    description: 'Slim fit',
    price: 549,
    category: 'clothing',
    gender: 'men',
    brand: 'Nudie',
    size: '31/...',
    condition: 'good',
    images: ['https://picsum.photos/seed/9/400/520'],
    is_sold: false,
    views: 78,
    likes: 14,
    created_at: '',
  },
  {
    id: '10',
    seller_id: 'u7',
    seller: { id: 'u7', username: 'sara_style', avatar_url: null, full_name: 'Sara', bio: null, location: 'Stockholm', rating: 4.9, total_sales: 40, created_at: '' },
    title: 'Acne Studios',
    description: 'Barely used.',
    price: 899,
    category: 'clothing',
    gender: 'women',
    brand: 'Acne Studios',
    size: 'M',
    condition: 'like_new',
    images: ['https://picsum.photos/seed/10/400/520'],
    is_sold: false,
    views: 120,
    likes: 31,
    created_at: '',
  },
  {
    id: '11',
    seller_id: 'u8',
    seller: { id: 'u8', username: 'karl_fits', avatar_url: null, full_name: 'Karl', bio: null, location: 'Gothenburg', rating: 4.5, total_sales: 12, created_at: '' },
    title: 'Carhartt WIP',
    description: 'Great condition.',
    price: 450,
    category: 'clothing',
    gender: 'men',
    brand: 'Carhartt',
    size: 'L',
    condition: 'good',
    images: ['https://picsum.photos/seed/21/400/520'],
    is_sold: false,
    views: 64,
    likes: 9,
    created_at: '',
  },
  {
    id: '12',
    seller_id: 'u9',
    seller: { id: 'u9', username: 'lena_preloved', avatar_url: null, full_name: 'Lena', bio: null, location: 'Malmö', rating: 4.6, total_sales: 18, created_at: '' },
    title: 'Weekday',
    description: 'Worn twice.',
    price: 299,
    category: 'clothing',
    gender: 'women',
    brand: 'Weekday',
    size: 'S',
    condition: 'like_new',
    images: ['https://picsum.photos/seed/33/400/520'],
    is_sold: false,
    views: 47,
    likes: 7,
    created_at: '',
  },
  {
    id: '13',
    seller_id: 'u10',
    seller: { id: 'u10', username: 'oskar_shop', avatar_url: null, full_name: 'Oskar', bio: null, location: 'Uppsala', rating: 4.2, total_sales: 8, created_at: '' },
    title: 'Tiger of Sweden',
    description: 'Perfect condition.',
    price: 750,
    category: 'clothing',
    gender: 'men',
    brand: 'Tiger of Sweden',
    size: '50',
    condition: 'like_new',
    images: ['https://picsum.photos/seed/44/400/520'],
    is_sold: false,
    views: 89,
    likes: 20,
    created_at: '',
  },
  {
    id: '14',
    seller_id: 'u11',
    seller: { id: 'u11', username: 'maja_closet', avatar_url: null, full_name: 'Maja', bio: null, location: 'Lund', rating: 4.8, total_sales: 33, created_at: '' },
    title: 'Filippa K',
    description: 'Elegant, light wear.',
    price: 620,
    category: 'clothing',
    gender: 'women',
    brand: 'Filippa K',
    size: 'XS',
    condition: 'good',
    images: ['https://picsum.photos/seed/55/400/520'],
    is_sold: false,
    views: 103,
    likes: 27,
    created_at: '',
  },
];

const TABS: TabName[] = ['For you', 'Popular', 'Following'];

// Prefetch all image URLs so they're in cache before user scrolls to them
Image.prefetch(MOCK_LISTINGS.map(l => l.images[0]));

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<TabName>('For you');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate a short data-fetch delay; replace with real Supabase call
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const listings = activeTab === 'Popular'
    ? [...MOCK_LISTINGS].sort((a, b) => b.likes - a.likes)
    : MOCK_LISTINGS;

  const renderItem = useCallback(
    ({ item }: { item: Listing }) => <ListingCard listing={item} />,
    []
  );

  const skeletonData = Array.from({ length: 9 }, (_, i) => ({ id: `sk-${i}` }));
  const renderSkeleton = useCallback(
    () => (
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginBottom: 6 }}>
        {[0,1,2].map(i => <SkeletonCard key={i} />)}
      </View>
    ),
    []
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

      {activeTab === 'Following' ? (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
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
      ) : (
        <FlatList
          key="feed-3"
          style={{ flex: 1 }}
          data={loading ? [] : listings}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 6, paddingHorizontal: 12 }}
          showsVerticalScrollIndicator={false}
          // ── Performance tuning ──────────────────────────
          initialNumToRender={9}
          maxToRenderPerBatch={9}
          updateCellsBatchingPeriod={50}
          windowSize={8}
          removeClippedSubviews={Platform.OS !== 'web'}
          // ────────────────────────────────────────────────
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C47FF" />
          }
          ListHeaderComponent={
            activeTab === 'For you' ? (
              <View className="pb-4">
                <PromoBanner onReadMore={() => {}} />
              </View>
            ) : (
              <View className="pt-3 pb-2" />
            )
          }
          ListEmptyComponent={loading ? (
            <View>
              {renderSkeleton()}
              {renderSkeleton()}
              {renderSkeleton()}
            </View>
          ) : null}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}
