import { memo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { cardImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { formatCount } from '@/components/profile/format';
import { colors } from '@/lib/theme';
import type { Listing } from '@/types';

interface Props {
  listing: Listing;
  width: number;
}

export const TikTokListingCard = memo(function TikTokListingCard({ listing, width }: Props) {
  const imageUrl = cardImageUrl(listing);
  const count = listing.views || (listing.likes ? listing.likes * 120 + 350 : 250);
  const formattedCount = formatCount(count);

  return (
    <Pressable
      onPress={() => router.push(`/product/${listing.id}`)}
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
          transition={150}
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

      {/* Subtle bottom gradient overlay */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 48,
          backgroundColor: 'rgba(0,0,0,0.35)',
        }}
      />

      {/* Title tag sticker (like the TikTok MRLEAN, BAGUETTE stickers) */}
      {listing.title ? (
        <View
          style={{
            position: 'absolute',
            bottom: 26,
            left: 4,
            right: 4,
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              backgroundColor: '#000',
              paddingHorizontal: 5,
              paddingVertical: 2,
              borderRadius: 3,
              borderWidth: 1,
              borderColor: '#00F2FE',
              maxWidth: '92%',
            }}
          >
            <Text
              style={{
                color: '#FFF',
                fontSize: 9.5,
                fontWeight: '900',
                textTransform: 'uppercase',
                letterSpacing: 0.2,
              }}
              numberOfLines={1}
            >
              {listing.title}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Bottom left view/play count */}
      <View
        style={{
          position: 'absolute',
          bottom: 6,
          left: 6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <Ionicons name="play-outline" size={13} color="#FFFFFF" />
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 11.5,
            fontWeight: '700',
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}
        >
          {formattedCount}
        </Text>
      </View>

      {/* Price tag on top-right */}
      {listing.price != null && (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            backgroundColor: 'rgba(0,0,0,0.65)',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>
            {formatPrice(listing.price)}
          </Text>
        </View>
      )}

      {/* Sold badge overlay */}
      {listing.is_sold && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: colors.danger,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 4,
            }}
          >
            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>SOLD</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
});
