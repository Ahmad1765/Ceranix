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
        <View className="flex-1 flex-row items-center bg-[#F2F2F2] rounded-full px-4 py-[10px] mr-3">
          <Feather name="search" size={20} color="#9ca3af" />
          <Text className="ml-3 flex-1 text-[16px] text-gray-500">
            What are you looking for today?
          </Text>
        </View>
        <Pressable className="w-[42px] h-[42px] border border-gray-200 rounded-[12px] items-center justify-center bg-white shadow-sm">
          <Feather name="menu" size={20} color="#000" />
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
              className={`mr-2 px-4 py-2 rounded-full border flex-row items-center ${isActive ? 'border-transparent' : 'border-transparent bg-[#F2F2F2]'}`}
              style={isActive ? { backgroundColor: '#5C5CFF' } : {}}
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
        columnWrapperStyle={{ gap: 8, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e4ff3a" />
        }
        ListHeaderComponent={
          activeTab === 'For you' ? (
            <View className="pb-4 px-4 w-full">
              <Image
                source={require('../../Sreenshots/asdfWhatsApp Image 2026-04-16 at 12.38.07 AM.jpeg')}
                style={{ width: '100%', height: 160, borderRadius: 12 }}
                resizeMode="cover"
              />
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

