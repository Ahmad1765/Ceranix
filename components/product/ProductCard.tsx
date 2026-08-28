import React, { memo, useState } from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Text } from '@/lib/rnText';
import { radii, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { router } from 'expo-router';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';

export interface ProductCardData {
  id: string;
  title: string;
  price: number;
  brand?: string;
  size?: string;
  imageUrl: string;
  isLiked?: boolean;
  likesCount?: number;
}

export interface ProductCardProps {
  item: ProductCardData;
  onPress?: () => void;
  onLikeToggle?: (isLiked: boolean) => void;
  aspectRatio?: '1:1' | '4:5';
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Mobile-First 2-Column Product Card.
 * Optimized for high-FPS FlashList rendering with 4:5 image ratio,
 * accessible 44x44px Heart action, and quiet-luxury styling.
 */
export const ProductCard = memo(function ProductCard({
  item,
  onPress,
  onLikeToggle,
  aspectRatio = '4:5',
  style,
}: ProductCardProps) {
  const { theme } = useTheme();
  const [pendingLiked, setPendingLiked] = useState<boolean | null>(null);

  React.useEffect(() => {
    setPendingLiked(null);
  }, [item.id]);

  React.useEffect(() => {
    if (pendingLiked !== null && Boolean(item.isLiked) === pendingLiked) {
      setPendingLiked(null);
    }
  }, [item.isLiked, pendingLiked]);

  const isLiked = pendingLiked ?? !!item.isLiked;

  // Reanimated press scale physics
  const scale = useSharedValue(1);
  const heartScale = useSharedValue(1);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleCardPressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };

  const handleCardPressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/product/${item.id}` as any);
    }
  };

  const handleLikePress = (e: any) => {
    e?.stopPropagation?.();
    const nextLiked = !isLiked;
    setPendingLiked(nextLiked);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    // Heart pop animation
    heartScale.value = withSpring(1.35, { damping: 10, stiffness: 400 }, () => {
      heartScale.value = withSpring(1, { damping: 12, stiffness: 300 });
    });

    onLikeToggle?.(nextLiked);
  };

  const subtitle = [item.brand, item.size].filter(Boolean).join(' · ');

  return (
    <AnimatedPressable
      onPress={handleCardPress}
      onPressIn={handleCardPressIn}
      onPressOut={handleCardPressOut}
      style={[
        styles.container,
        { backgroundColor: theme.white },
        cardAnimatedStyle,
        style,
      ]}
      accessibilityRole={Platform.OS === 'web' ? 'link' : 'button'}
      accessibilityLabel={`${item.title}, ${formatPrice(item.price)}`}
    >
      {/* 1. Media Container with 4:5 Aspect Ratio */}
      <View
        style={[
          styles.imageContainer,
          { backgroundColor: theme.panel },
          aspectRatio === '4:5' ? styles.ratio45 : styles.ratio11,
        ]}
      >
        <Image
          source={{ uri: getOptimizedImageUrl(item.imageUrl, { width: 450 }) }}
          contentFit="cover"
          transition={IMAGE_TRANSITION}
          cachePolicy="memory-disk"
          priority="high"
          recyclingKey={item.id}
          style={styles.image}
        />

        {/* $44x44px Touch Target Like / Bookmark Action */}
        <Pressable
          onPress={handleLikePress}
          accessibilityRole="button"
          accessibilityState={{ selected: isLiked }}
          accessibilityLabel={isLiked ? 'Unlike item' : 'Like item'}
          style={({ pressed }) => [
            styles.likeButtonWrapper,
            {
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.likeCircle,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              heartAnimatedStyle,
            ]}
          >
            <Feather
              name="heart"
              size={18}
              color={isLiked ? theme.purple : theme.ink}
            />
          </Animated.View>
        </Pressable>
      </View>

      {/* 2. Metadata Section (Price, Title, Brand/Size) */}
      <View style={styles.metaContainer}>
        <View style={styles.priceRow}>
          <Text
            style={[
              styles.priceText,
              { color: theme.ink, fontFamily: type.family.sansBold },
            ]}
            numberOfLines={1}
          >
            {formatPrice(item.price)}
          </Text>
        </View>

        <Text
          style={[
            styles.titleText,
            { color: theme.ink, fontFamily: type.family.sansMedium },
          ]}
          numberOfLines={1}
        >
          {item.title}
        </Text>

        {subtitle.length > 0 && (
          <Text style={[styles.subtitleText, { color: theme.mute }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 0,
  },
  imageContainer: {
    width: '100%',
    borderRadius: radii.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  ratio45: {
    aspectRatio: 4 / 5,
  },
  ratio11: {
    aspectRatio: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  likeButtonWrapper: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  likeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
      default: {
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
      },
    }),
  },
  metaContainer: {
    paddingTop: 8,
    paddingHorizontal: 2,
    gap: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceText: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  titleText: {
    fontSize: 13,
    lineHeight: 17,
  },
  subtitleText: {
    fontSize: 11,
    marginTop: 1,
  },
});
