import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import type { PriceDropListing } from '@/lib/myFeed';

interface Props {
  listing: PriceDropListing;
  width?: number;
}

export const PriceDropCard = memo(function PriceDropCard({ listing, width = 130 }: Props) {
  const firstImage = listing.images[0] ?? '';
  const src = getOptimizedImageUrl(firstImage, { width: thumbWidthFor(width) });
  const pct =
    listing.old_price > 0
      ? Math.round(((listing.old_price - listing.new_price) / listing.old_price) * 100)
      : 0;
  return (
    <Pressable
      onPress={() => router.push(`/product/${listing.id}`)}
      style={{ width }}
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, price dropped to $${listing.new_price}`}
    >
      <View
        style={{
          width,
          aspectRatio: 1,
          backgroundColor: 'rgba(15,15,15,0.04)',
          borderRadius: 12,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Image
          source={{ uri: src }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
        {pct > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              backgroundColor: '#6C47FF',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>−{pct}%</Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={{ marginTop: 6, fontSize: 12.5, fontWeight: '600', color: '#0F0F0F' }}
      >
        {listing.title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
        <Text
          style={{
            fontSize: 11.5,
            color: 'rgba(15,15,15,0.45)',
            textDecorationLine: 'line-through',
          }}
        >
          ${Number(listing.old_price).toFixed(2)}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#6C47FF' }}>
          ${Number(listing.new_price).toFixed(2)}
        </Text>
      </View>
    </Pressable>
  );
});
