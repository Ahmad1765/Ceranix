import { memo, useState } from 'react';
import { View, Text, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import { router } from 'expo-router';
import type { Listing } from '@/types';

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface Props {
  listing: Listing;
}

export const ListingCard = memo(function ListingCard({ listing }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  const images = listing.images.length > 0 ? listing.images : [''];
  const hasMultiple = images.length > 1;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cardWidth <= 0) return;
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth));
  };

  return (
    <Pressable
      onPress={() => router.push(`/product/${listing.id}`)}
      className="flex-1 mb-4"
    >
      <View
        className="relative w-full"
        style={{ aspectRatio: 1 / 1.33, overflow: 'hidden', borderRadius: 6, backgroundColor: '#f3f4f6' }}
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
      >
        {hasMultiple && cardWidth > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            onScroll={handleScroll}
            scrollEventThrottle={16}
            disableIntervalMomentum
          >
            {images.map((uri, i) =>
              i === 0 ? (
                <AnimatedExpoImage
                  key={i}
                  source={{ uri }}
                  style={{ width: cardWidth, height: '100%' }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  transition={250}
                  sharedTransitionTag={`product-image-${listing.id}`}
                />
              ) : (
                <Image
                  key={i}
                  source={{ uri }}
                  style={{ width: cardWidth, height: '100%' }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  transition={250}
                />
              )
            )}
          </ScrollView>
        ) : (
          <AnimatedExpoImage
            source={{ uri: images[0] }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={images[0]}
            transition={250}
            sharedTransitionTag={`product-image-${listing.id}`}
          />
        )}

        {hasMultiple && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 6,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
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
          <Text className="text-[13px] font-medium text-gray-900 flex-1" numberOfLines={1}>
            {listing.brand || listing.title}
          </Text>
          {listing.size && (
            <Text className="text-[13px] font-bold text-gray-700 ml-1">{listing.size}</Text>
          )}
        </View>
        <Text className="text-[14px] font-bold text-black mt-0.5">
          ${listing.price}
        </Text>
      </View>
    </Pressable>
  );
});
