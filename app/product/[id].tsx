import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Listing } from '@/types';

const { width } = Dimensions.get('window');

const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
};

// TODO: fetch from Supabase by id
const MOCK_LISTING: Listing = {
  id: '1',
  seller_id: 'u1',
  seller: {
    id: 'u1',
    username: 'sara_fashion',
    avatar_url: null,
    full_name: 'Sara Ahmed',
    bio: 'Fashion lover from Karachi',
    location: 'Karachi',
    rating: 4.8,
    total_sales: 34,
    created_at: '',
  },
  title: 'Zara Floral Midi Dress',
  description: 'Beautiful floral midi dress from Zara. Worn once to a wedding, in excellent condition. No stains, no pulls. Fits a UK 8 / US 4.',
  price: 2500,
  category: 'clothing',
  gender: 'women',
  brand: 'Zara',
  size: 'S',
  condition: 'like_new',
  images: [
    'https://picsum.photos/seed/1a/400/520',
    'https://picsum.photos/seed/1b/400/520',
    'https://picsum.photos/seed/1c/400/520',
  ],
  is_sold: false,
  views: 120,
  likes: 18,
  created_at: '',
};

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const [activeImage, setActiveImage] = useState(0);
  const [liked, setLiked] = useState(false);
  const listing = MOCK_LISTING; // replace with Supabase fetch by id

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image carousel */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / width);
            setActiveImage(page);
          }}
          scrollEventThrottle={16}
        >
          {listing.images.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={{ width, height: width * 1.2 }}
              contentFit="cover"
            />
          ))}
        </ScrollView>

        {/* Pagination dots */}
        {listing.images.length > 1 && (
          <View className="flex-row justify-center mt-2 gap-1.5">
            {listing.images.map((_, i) => (
              <View
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${i === activeImage ? 'bg-gray-800' : 'bg-gray-300'}`}
              />
            ))}
          </View>
        )}

        <View className="px-4 pt-4">
          {/* Price + like */}
          <View className="flex-row items-start justify-between">
            <View>
              <Text className="text-2xl font-bold text-gray-900">
                Rs {listing.price.toLocaleString()}
              </Text>
              {listing.brand && (
                <Text className="text-sm text-gray-500 mt-0.5">{listing.brand}</Text>
              )}
            </View>
            <Pressable
              onPress={() => setLiked(!liked)}
              className="p-2"
            >
              <Feather
                name="heart"
                size={24}
                color={liked ? '#ef4444' : '#6b7280'}
                fill={liked ? '#ef4444' : 'none'}
              />
            </Pressable>
          </View>

          <Text className="text-lg font-semibold text-gray-900 mt-2">{listing.title}</Text>

          {/* Tags */}
          <View className="flex-row flex-wrap gap-2 mt-3">
            {listing.size && (
              <View className="bg-gray-100 rounded-full px-3 py-1">
                <Text className="text-xs text-gray-600">Size: {listing.size}</Text>
              </View>
            )}
            <View className="bg-gray-100 rounded-full px-3 py-1">
              <Text className="text-xs text-gray-600">{CONDITION_LABELS[listing.condition]}</Text>
            </View>
            <View className="bg-gray-100 rounded-full px-3 py-1">
              <Text className="text-xs text-gray-600 capitalize">{listing.gender}</Text>
            </View>
          </View>

          {/* Description */}
          <Text className="text-sm text-gray-600 mt-4 leading-5">{listing.description}</Text>

          {/* Divider */}
          <View className="h-px bg-gray-100 my-4" />

          {/* Seller */}
          <Pressable
            onPress={() => router.push(`/user/${listing.seller_id}`)}
            className="flex-row items-center"
          >
            <View className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center mr-3">
              <Feather name="user" size={20} color="#9ca3af" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900">
                {listing.seller.username}
              </Text>
              <View className="flex-row items-center">
                <Feather name="star" size={11} color="#f97316" />
                <Text className="text-xs text-gray-500 ml-1">
                  {listing.seller.rating} · {listing.seller.total_sales} sales · {listing.seller.location}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={16} color="#9ca3af" />
          </Pressable>

          <View className="h-px bg-gray-100 my-4" />

          {/* Views */}
          <Text className="text-xs text-gray-400 text-center mb-4">
            {listing.views} views · {listing.likes} likes
          </Text>
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View className="px-4 pb-6 pt-2 border-t border-gray-100 flex-row gap-3">
        <Pressable
          onPress={() => router.push(`/conversation/new?listing=${listing.id}&seller=${listing.seller_id}`)}
          className="flex-1 border border-gray-200 rounded-xl py-3.5 items-center"
        >
          <Text className="text-sm font-semibold text-gray-800">Message Seller</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert('Buy', 'Payment flow coming soon')}
          className="flex-1 bg-brand-500 rounded-xl py-3.5 items-center"
        >
          <Text className="text-sm font-bold text-white">Buy Now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
