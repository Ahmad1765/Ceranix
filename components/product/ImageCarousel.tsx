import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { useTheme } from '@/context/ThemeContext';
import { getOptimizedImageUrl, thumbWidthFor, IMAGE_TRANSITION, prefetchImages } from '@/lib/images';

export interface ImageCarouselProps {
  images: string[];
  aspectRatio?: '1:1' | '4:5';
  onImagePress?: (index: number) => void;
  className?: string;
  style?: ViewStyle;
  placeholderImage?: string;
  listingId?: string;
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
  placeholderImage,
  listingId,
}: ImageCarouselProps) {
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(windowWidth);
  const scrollRef = useRef<ScrollView>(null);

  const validImages = useMemo(() => (images || []).filter(Boolean), [images]);

  // Proactively prefetch adjacent gallery images on mount so swipes are instantaneous
  useEffect(() => {
    if (validImages.length > 1) {
      const targetWidth = thumbWidthFor(carouselWidth);
      const toPrefetch = validImages
        .slice(1)
        .map((u) => getOptimizedImageUrl(u, { width: targetWidth }));
      prefetchImages(toPrefetch);
    }
  }, [validImages, carouselWidth]);

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
  }, [carouselWidth, activeIndex]);

  // Height based on aspect ratio
  const carouselHeight = aspectRatio === '1:1' ? carouselWidth : carouselWidth * 1.25;

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
          { height: carouselHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel },
          style,
        ]}
      >
        <Feather name="image" size={36} color={theme.mute} />
      </View>
    );
  }

  return (
    <View
      className={className}
      style={[styles.container, { height: carouselHeight, backgroundColor: theme.panel }, style]}
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
            key={listingId ? `${listingId}-${index}` : `${uri}-${index}`}
            uri={uri}
            index={index}
            width={carouselWidth}
            height={carouselHeight}
            placeholderUri={index === 0 ? placeholderImage : undefined}
            listingId={listingId}
            onPress={onImagePress ? () => onImagePress(index) : undefined}
          />
        ))}
      </ScrollView>

      {/* Bar-style page indicators (bottom center) */}
      {validImages.length > 1 && (
        <View style={styles.indicatorWrapper} pointerEvents="none">
          <View style={styles.barContainer}>
            {validImages.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  i === activeIndex ? styles.barActive : styles.barInactive,
                ]}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const CarouselSlide = React.memo(
  function CarouselSlide({
    uri,
    index,
    width,
    height,
    placeholderUri,
    listingId,
    onPress,
  }: {
    uri: string;
    index: number;
    width: number;
    height: number;
    placeholderUri?: string;
    listingId?: string;
    onPress?: () => void;
  }) {
    const optimizedUri = getOptimizedImageUrl(uri, { width: thumbWidthFor(width) });
    const imageElement = (
      <Image
        source={{ uri: optimizedUri }}
        placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
        placeholderContentFit="cover"
        contentFit="cover"
        transition={IMAGE_TRANSITION}
        priority={index === 0 ? 'high' : 'normal'}
        cachePolicy="memory-disk"
        recyclingKey={listingId ? `${listingId}-${index}` : undefined}
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
  },
  (prev, next) =>
    prev.uri === next.uri &&
    prev.index === next.index &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.placeholderUri === next.placeholderUri &&
    prev.listingId === next.listingId &&
    (prev.onPress !== undefined) === (next.onPress !== undefined),
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
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
  indicatorWrapper: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bar: {
    height: 4,
    borderRadius: 2,
  },
  barActive: {
    width: 20,
    backgroundColor: '#FFFFFF',
  },
  barInactive: {
    width: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
});
