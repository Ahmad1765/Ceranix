import { memo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { cardImageUrl, getOptimizedImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { colors } from '@/lib/theme';
import type { Listing } from '@/types';

interface Props {
  listing: Listing;
  width: number;
}

export const TikTokListingCard = memo(function TikTokListingCard({ listing, width }: Props) {
  const rawUrl = cardImageUrl(listing);
  const imageUrl = getOptimizedImageUrl(rawUrl, { width: Math.round(width * 1.5), quality: 75 });
  const soldText = listing.is_sold ? ', Sold' : '';
  const priceText = listing.price != null ? `, ${formatPrice(listing.price)}` : '';
  const accessibilityLabel = `${listing.title || 'Listing'}${priceText}${soldText}`;

  return (
    <Pressable
      onPress={() => router.push(`/product/${listing.id}`)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width,
        aspectRatio: 3 / 4,
        backgroundColor: '#1a1a1a',
        position: 'relative',
        overflow: 'hidden',
        opacity: pressed ? 0.88 : 1,
      })}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={100}
          cachePolicy="memory-disk"
        />
      ) : (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: '#262626',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="shopping-bag" size={24} color="#666" />
        </View>
      )}

      {/* Price tag on bottom-left */}
      {listing.price != null && (
        <View
          style={{
            position: 'absolute',
            bottom: 6,
            left: 6,
            backgroundColor: 'rgba(0,0,0,0.65)',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>
            {formatPrice(listing.price)}
          </Text>
        </View>
      )}

      {/* Sold badge overlay */}
      {listing.is_sold && (
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: '#D4FF00',
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 4,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.18,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <Text
              style={{
                color: '#000000',
                fontSize: 12,
                fontWeight: '900',
                fontFamily: 'Inter_700Bold',
              }}
            >
              Sold
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
});

