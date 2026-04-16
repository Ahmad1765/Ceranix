import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ListingCard } from '@/components/ListingCard';
import { LinearGradient } from 'expo-linear-gradient';
import type { Listing } from '@/types';

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
];

const TABS = ['For you', 'Popular', 'Following'] as const;
type FeedTab = typeof TABS[number];

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<FeedTab>('For you');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const listings = activeTab === 'Popular'
    ? [...MOCK_LISTINGS].sort((a, b) => b.likes - a.likes)
    : MOCK_LISTINGS;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      {/* Search Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <View className="flex-1 flex-row items-center bg-gray-100 rounded-full px-4 py-3 mr-3 outline outline-1 outline-gray-200">
          <Feather name="search" size={20} color="#9ca3af" />
          <Text className="ml-3 flex-1 text-[16px] text-gray-400">
            What are you looking for today?
          </Text>
        </View>
        <Pressable className="w-[42px] h-[42px] border border-gray-200 rounded-full items-center justify-center bg-white shadow-sm">
          <Ionicons name="document-text-outline" size={20} color="#000" />
        </Pressable>
      </View>

      {/* Feed tabs */}
      <View className="flex-row px-4 pb-4">
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          let iconName: any = 'sparkles';
          if (tab === 'Popular') iconName = 'flame';
          if (tab === 'Following') iconName = 'person';
          
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className={`mr-2 px-4 py-2.5 rounded-full border flex-row items-center ${isActive ? 'border-transparent' : 'border-gray-200 bg-white'}`}
              style={isActive ? { backgroundColor: '#5433fb' } : {}}
            >
              <Ionicons name={iconName} size={14} color={isActive ? '#ffffff' : '#111827'} style={{ marginRight: 6 }} />
              <Text
                className={`text-[15px] font-bold ${
                  isActive ? 'text-white' : 'text-gray-900'
                }`}
              >
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        key={3} // Add key to force re-render when changing columns
        data={listings}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={{ gap: 4, paddingHorizontal: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e4ff3a" />
        }
        ListHeaderComponent={
          activeTab === 'For you' ? (
            <View className="pb-4">
              {/* Banner */}
              <View style={{ backgroundColor: '#3b0764', minHeight: 170 }} className="w-full overflow-hidden flex-row">
                {/* Left content */}
                <View className="w-[58%] z-10 px-5 pt-5 pb-5 justify-between">
                  <View>
                    <Text style={{ letterSpacing: 4 }} className="text-white text-[9px] font-bold mb-3">CERANIX</Text>
                    <View style={{ backgroundColor: '#e4ff3a', alignSelf: 'flex-start' }} className="px-2 py-[2px] mb-[3px]">
                      <Text className="text-black font-black text-[20px] leading-tight">Win a gift card</Text>
                    </View>
                    <View style={{ backgroundColor: '#e4ff3a', alignSelf: 'flex-start' }} className="px-2 py-[2px] mb-3">
                      <Text className="text-black font-black text-[20px] leading-tight">worth 5000 PKR</Text>
                    </View>
                    <Text className="text-white font-semibold text-xs mb-1">The Ceranix lottery*</Text>
                    <Text style={{ opacity: 0.75 }} className="text-white text-[9px] leading-relaxed">
                      1 uploaded listing = 1 entry.{'\n'}Three winners. April 12–20.
                    </Text>
                  </View>
                </View>

                {/* Right image collage */}
                <View className="absolute right-0 top-0 bottom-0 w-[44%] flex-row">
                  <View className="flex-1">
                    <Image source={{ uri: 'https://picsum.photos/seed/lux1/110/90' }} style={{ flex: 1 }} resizeMode="cover" />
                    <Image source={{ uri: 'https://picsum.photos/seed/lux3/110/90' }} style={{ flex: 1 }} resizeMode="cover" />
                  </View>
                  <View className="flex-1">
                    <Image source={{ uri: 'https://picsum.photos/seed/lux2/110/90' }} style={{ flex: 1 }} resizeMode="cover" />
                    <Image source={{ uri: 'https://picsum.photos/seed/lux4/110/90' }} style={{ flex: 1 }} resizeMode="cover" />
                  </View>
                  {/* Fade left edge into background */}
                  <LinearGradient
                    colors={['#3b0764', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 40 }}
                  />
                </View>

                {/* Learn more button */}
                <Pressable
                  style={{ backgroundColor: '#3b82f6', position: 'absolute', bottom: 16, right: 16, zIndex: 10, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}
                >
                  <Text className="text-white font-bold text-sm">Learn more</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="pt-3 pb-2" />
          )
        }
        renderItem={({ item }) => <ListingCard listing={item} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}

