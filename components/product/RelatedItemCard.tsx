import { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import { CARD_WIDTH, CARD_IMAGE_HEIGHT, type RelatedItem } from './shared';
import { formatPrice } from '@/lib/currency';

import { colors } from '@/lib/theme';

export function RelatedItemCard({ item, onPress }: { item: RelatedItem; onPress: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselArmed, setCarouselArmed] = useState(false);
  const hasMultiple = item.images.length > 1;
  const srcWidth = thumbWidthFor(CARD_WIDTH);
  const armCarousel = () => {
    if (!carouselArmed) setCarouselArmed(true);
  };
  return (
    <Pressable onPress={onPress} style={{ width: CARD_WIDTH, marginBottom: 18 }}>
      <View
        style={{
          position: 'relative',
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: colors.panel,
        }}
      >
        {hasMultiple ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            onScroll={(e) =>
              setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH))
            }
            onTouchStart={armCarousel}
            onScrollBeginDrag={armCarousel}
            scrollEventThrottle={16}
            disableIntervalMomentum
          >
            {item.images.map((uri, i) => {
              if (i !== 0 && !carouselArmed) {
                return <View key={i} style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }} />;
              }
              return (
                <Image
                  key={i}
                  source={{ uri: getOptimizedImageUrl(uri, { width: srcWidth }) }}
                  style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  transition={180}
                  priority={i === 0 ? 'normal' : 'low'}
                />
              );
            })}
          </ScrollView>
        ) : (
          <Image
            source={{
              uri: item.images && item.images.length > 0
                ? getOptimizedImageUrl(item.images[0], { width: srcWidth })
                : 'https://placehold.co/400x400/eeeeee/cccccc.png?text=No+Image',
            }}
            style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.images && item.images.length > 0 ? item.images[0] : 'empty-placeholder'}
            transition={180}
          />
        )}

        {hasMultiple && (
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            {item.images.map((_, i) => (
              <View
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: i === activeIndex ? 'white' : 'rgba(255,255,255,0.55)',
                }}
              />
            ))}
          </View>
        )}

        {/* Like chip */}
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 999,
            paddingHorizontal: 9,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Feather name="heart" size={11} color={colors.ink} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink }}>{item.likes}</Text>
        </View>
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
          {item.brand}
        </Text>
        <Text style={{ fontSize: 11, color: colors.mute, marginTop: 2 }} numberOfLines={1}>
          {item.meta}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 4 }}>
          {formatPrice(item.price, { whole: true })}
        </Text>
      </View>
    </Pressable>
  );
}
