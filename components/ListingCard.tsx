import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Listing } from '@/types';

interface Props {
  listing: Listing;
}

export function ListingCard({ listing }: Props) {
  return (
    <Pressable
      onPress={() => router.push(`/product/${listing.id}`)}
      className="flex-1 mb-6 px-1"
    >
      <View className="relative w-full" style={{ aspectRatio: 1 / 1.33, overflow: 'hidden' }}>
        <Image
          source={{ uri: listing.images[0] }}
          style={{ width: '100%', height: '100%' }}
          className="bg-gray-100"
          contentFit="cover"
        />
        {listing.is_sold && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <Text className="text-white font-bold text-sm">SOLD</Text>
          </View>
        )}
      </View>

      <View className="mt-1.5 w-full">
        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-[13px] font-medium text-gray-900 flex-1" numberOfLines={1}>
            {listing.brand || listing.title}
          </Text>
          {listing.size && (
            <Text className="text-[13px] font-medium text-gray-500 ml-1">{listing.size}</Text>
          )}
        </View>
        <Text className="text-[14px] font-bold text-black mt-0.5">
          {listing.price} SEK
        </Text>
      </View>
    </Pressable>
  );
}
