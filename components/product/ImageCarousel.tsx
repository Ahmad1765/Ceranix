import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
  ViewStyle,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { Text } from '@/lib/rnText';
import { colors, radii } from '@/lib/theme';

export interface ImageCarouselProps {
  images: string[];
  aspectRatio?: '1:1' | '4:5';
  onImagePress?: (index: number) => void;
  className?: string;
  style?: ViewStyle;
}

/**
 * Mobile-Native Image Carousel.
 * Full-bleed swipeable gallery with momentum pagination,
 * dynamic active indicator dots, and crisp tap-to-expand.
 */
export function ImageCarousel({
  images,
  aspectRatio = '4:5',
  onImagePress,
  className = '',
  style,
}: ImageCarouselProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(windowWidth);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setCarouselWidth(windowWidth);
  }, [windowWidth]);

  useEffect(() => {
    if (carouselWidth > 0) {
      scrollRef.current?.scrollTo({
        x: activeIndex * carouselWidth,
        y: 0,
        animated: false,
      });
    }
  }, [carouselWidth]);

  // Height based on aspect ratio
  const carouselHeight = aspectRatio === '1:1' ? carouselWidth : carouselWidth * 1.25;

  const validImages = (images || []).filter(Boolean);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / carouselWidth);
      if (index !== activeIndex && index >= 0 && index < validImages.length) {
        setActiveIndex(index);
      }
    },
    [activeIndex, carouselWidth, validImages.length]
  );

  if (validImages.length === 0) {
    return (
      <View
        className={className}
        style={[
          styles.container,
          { height: carouselHeight, alignItems: 'center', justifyContent: 'center' },
          style,
        ]}
      >
        <Feather name="image" size={36} color={colors.mute} />
      </View>
    );
  }

  return (
    <View
      className={className}
      style={[styles.container, { height: carouselHeight }, style]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== carouselWidth) {
          setCarouselWidth(w);
        }
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={validImages.length > 1}
        style={styles.scroll}
      >
        {validImages.map((uri, index) => (
          <CarouselSlide
            key={index}
            uri={uri}
            width={carouselWidth}
            height={carouselHeight}
            onPress={onImagePress ? () => onImagePress(index) : undefined}
          />
        ))}
      </ScrollView>

      {/* Floating Counter Pill (Top Right) */}
      {validImages.length > 1 && (
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>
            {activeIndex + 1} / {validImages.length}
          </Text>
        </View>
      )}

      {/* Active Pagination Indicator Dots (Bottom Center) */}
      {validImages.length > 1 && (
        <View style={styles.paginationContainer} pointerEvents="none">
          {validImages.map((_, index) => {
            const isActive = index === activeIndex;
            return (
              <View
                key={index}
                style={[
                  styles.dot,
                  isActive ? styles.dotActive : styles.dotInactive,
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

function CarouselSlide({
  uri,
  width,
  height,
  onPress,
}: {
  uri: string;
  width: number;
  height: number;
  onPress?: () => void;
}) {
  const imageElement = (
    <Image
      source={{ uri }}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      style={styles.image}
    />
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="View full photo"
        style={({ pressed }) => [
          styles.slide,
          { width, height, opacity: pressed ? 0.96 : 1 },
        ]}
      >
        {imageElement}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Product photo"
      style={[styles.slide, { width, height }]}
    >
      {imageElement}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.panel,
    position: 'relative',
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  slide: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  counterBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(15, 15, 15, 0.65)',
    zIndex: 10,
  },
  counterText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.2,
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 10,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
});
