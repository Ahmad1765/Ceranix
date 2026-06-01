import { memo, useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { PressableScale } from '@/components/PressableScale';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import type { Listing } from '@/types';

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface Props {
  listing: Listing;
}

export const ListingCard = memo(function ListingCard({ listing }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  // Sibling carousel images only mount after the user actually engages with
  // the card. This shaves ~2/3 of image requests on multi-image listings in
  // the home grid since most users never swipe individual cards.
  const [carouselArmed, setCarouselArmed] = useState(false);
  const images = listing.images.length > 0 ? listing.images : [''];
  const hasMultiple = images.length > 1;

  // Subtle staggered entrance: fade + slight rise on mount.
  const enterY = useSharedValue(8);
  const enterO = useSharedValue(0);
  useEffect(() => {
    enterO.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    enterY.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.7 });
  }, [enterO, enterY]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterO.value,
    transform: [{ translateY: enterY.value }],
  }));

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cardWidth <= 0) return;
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth));
  }, [cardWidth]);

  const armCarousel = useCallback(() => {
    if (!carouselArmed) setCarouselArmed(true);
  }, [carouselArmed]);

  const srcWidth = thumbWidthFor(cardWidth || 200);
  const firstSrc = getOptimizedImageUrl(images[0], { width: srcWidth });

  return (
    <Animated.View style={[{ flex: 1, marginBottom: 16 }, enterStyle]}>
    <PressableScale
      onPress={() => router.push(`/product/${listing.id}`)}
      style={{ flex: 1 }}
    >
      <View
        className="relative w-full"
        style={{ aspectRatio: 1 / 1.33, overflow: 'hidden', borderRadius: 6, backgroundColor: 'rgba(15,15,15,0.04)' }}
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
      >
        {hasMultiple && cardWidth > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            onScroll={handleScroll}
            onTouchStart={armCarousel}
            onScrollBeginDrag={armCarousel}
            scrollEventThrottle={16}
            disableIntervalMomentum
          >
            {images.map((uri, i) => {
              if (i === 0) {
                return (
                  <AnimatedExpoImage
                    key={i}
                    source={{ uri: firstSrc }}
                    style={{ width: cardWidth, height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={uri}
                    transition={200}
                    priority="high"
                    sharedTransitionTag={`product-image-${listing.id}`}
                  />
                );
              }
              if (!carouselArmed) {
                return <View key={i} style={{ width: cardWidth, height: '100%' }} />;
              }
              return (
                <Image
                  key={i}
                  source={{ uri: getOptimizedImageUrl(uri, { width: srcWidth }) }}
                  style={{ width: cardWidth, height: '100%' }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  transition={200}
                  priority="low"
                />
              );
            })}
          </ScrollView>
        ) : (
          <AnimatedExpoImage
            source={{ uri: firstSrc }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={images[0]}
            transition={200}
            priority="high"
            sharedTransitionTag={`product-image-${listing.id}`}
          />
        )}

        {hasMultiple && (
          <View
            style={{
              position: 'absolute',
              bottom: 6,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            {images.map((_, i) => (
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

        {listing.is_sold && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <Text className="text-white font-bold text-sm">SOLD</Text>
          </View>
        )}
      </View>

      <View className="mt-1.5 w-full">
        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-[13px] font-medium text-ink flex-1" numberOfLines={1}>
            {listing.brand || listing.title}
          </Text>
          {listing.size && (
            <Text className="text-[13px] font-bold text-ink ml-1">{listing.size}</Text>
          )}
        </View>
        <Text className="text-[14px] font-bold text-black mt-0.5">
          ${listing.price}
        </Text>
      </View>
    </PressableScale>
    </Animated.View>
  );
});
