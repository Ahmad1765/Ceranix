import { useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, Modal } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import Animated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import { HeroPageDot } from './HeroPageDot';
import { width, SCREEN_HEIGHT, IS_IOS, tap } from './shared';

export function FullscreenImageViewer({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetX = useSharedValue(initialIndex * width);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      offsetX.value = e.contentOffset.x;
    },
  });

  // Sync to the tapped image whenever the viewer (re-)opens.
  useEffect(() => {
    if (!visible) return;
    offsetX.value = initialIndex * width;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * width, y: 0, animated: false });
    });
  }, [visible, initialIndex, offsetX]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar style="light" animated />
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Animated.ScrollView
          ref={scrollRef as any}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {images.map((uri, i) => (
            <Pressable
              key={i}
              onPress={onClose}
              style={{
                width,
                height: SCREEN_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                source={{ uri: getOptimizedImageUrl(uri, { width: thumbWidthFor(width), quality: 80 }) }}
                style={{ width, height: SCREEN_HEIGHT }}
                contentFit="contain"
                cachePolicy="memory-disk"
                recyclingKey={uri}
                transition={0}
                priority={i === initialIndex ? 'high' : 'normal'}
              />
            </Pressable>
          ))}
        </Animated.ScrollView>

        {/* Close button */}
        <Pressable
          onPress={() => { tap('selection'); onClose(); }}
          hitSlop={12}
          style={({ pressed }) => ({
            position: 'absolute',
            top: (IS_IOS ? 54 : 28),
            right: 16,
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: 'rgba(255,255,255,0.14)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="x" size={20} color="#fff" />
        </Pressable>

        {/* Pagination dots */}
        {images.length > 1 && (
          <View
            style={{
              position: 'absolute',
              bottom: IS_IOS ? 44 : 28,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              pointerEvents: 'none',
            }}
          >
            {images.map((_, i) => (
              <HeroPageDot key={i} index={i} offsetX={offsetX} pageWidth={width} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}
