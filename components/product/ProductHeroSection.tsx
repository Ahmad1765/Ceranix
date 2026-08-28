// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT HERO SECTION (PRESENTATIONAL WITH STABLE MEMOIZATION)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Protecting the UI Thread with React.memo
// The product image carousel is the most computationally expensive component on
// this screen. Wrapping `ProductHeroSection` in `memo` ensures that whenever the
// user scrolls, types, or toggles sheets, the carousel does NOT re-render unless
// its explicit props (`images`, `liked`, `saved`, `heartCount`) change.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Animated from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { ImageCarousel } from '@/components/product/ImageCarousel';
import { PopIcon, type PopIconHandle } from '@/components/product/PopIcon';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { BRAND_PURPLE, HAIRLINE } from '@/components/product/shared';
import { radii } from '@/lib/theme';

type ProductHeroSectionProps = {
  images: string[];
  isSold: boolean;
  liked: boolean;
  saved: boolean;
  heartCount: number;
  heroParallaxStyle: any;
  heartAnimRef: React.RefObject<PopIconHandle | null>;
  saveAnimRef: React.RefObject<PopIconHandle | null>;
  onImagePress: (index: number) => void;
  onHeartPress: () => void;
  onOpenSaveList: () => void;
};

export const ProductHeroSection = memo(function ProductHeroSection({
  images,
  isSold,
  liked,
  saved,
  heartCount,
  heroParallaxStyle,
  heartAnimRef,
  saveAnimRef,
  onImagePress,
  onHeartPress,
  onOpenSaveList,
}: ProductHeroSectionProps) {
  const { theme } = useTheme();
  return (
    <View style={{ position: 'relative' }}>
      {/* Parallax / Stretch layer wraps only the carousel */}
      <Animated.View style={heroParallaxStyle}>
        <ImageCarousel
          images={images}
          aspectRatio="4:5"
          onImagePress={onImagePress}
        />
      </Animated.View>

      {/* Centered Sold Badge overlay */}
      {isSold && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
          }}
        >
          <View
            style={{
              backgroundColor: theme.ink,
              paddingHorizontal: 20,
              paddingVertical: 8,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: theme.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.25,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: theme.background,
                letterSpacing: 0.6,
                fontFamily: 'Inter_700Bold',
                textTransform: 'uppercase',
              }}
            >
              Sold
            </Text>
          </View>
        </View>
      )}

      {/* Floating Action Discs (Like & Save) */}
      <View
        style={{
          position: 'absolute',
          right: 14,
          bottom: 16,
          alignItems: 'center',
          gap: 12,
          zIndex: 10,
        }}
      >
        {/* Like Button */}
        <Pressable
          onPress={onHeartPress}
          onLongPress={onOpenSaveList}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike this item' : 'Like this item'}
          accessibilityHint="Long press to save this item to a collection"
          accessibilityState={{ selected: liked }}
          style={({ pressed }) => ({
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: theme.white,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: HAIRLINE,
            borderColor: theme.border,
            boxShadow: '0px 4px 14px rgba(0,0,0,0.12)',
            transform: [{ scale: pressed ? 0.93 : 1 }],
          })}
        >
          <PopIcon
            ref={heartAnimRef}
            name="heart"
            active={liked}
            size={20}
            activeColor={BRAND_PURPLE}
            inactiveColor={theme.ink}
          />
          <AnimatedNumber
            value={heartCount}
            height={13}
            style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: theme.mute, marginTop: 1 }}
          />
        </Pressable>

        {/* Bookmark / Save Button */}
        <Pressable
          onPress={onOpenSaveList}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Edit save lists' : 'Save to list'}
          accessibilityState={{ selected: saved }}
          style={({ pressed }) => ({
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: theme.white,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: HAIRLINE,
            borderColor: theme.border,
            boxShadow: '0px 4px 14px rgba(0,0,0,0.12)',
            transform: [{ scale: pressed ? 0.93 : 1 }],
          })}
        >
          <PopIcon
            ref={saveAnimRef}
            name="bookmark"
            active={saved}
            size={20}
            activeColor={BRAND_PURPLE}
            inactiveColor={theme.ink}
          />
        </Pressable>
      </View>
    </View>
  );
});
