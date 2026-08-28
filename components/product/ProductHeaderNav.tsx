// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT HEADER NAV (PROFESSIONAL FLOATING-TO-STICKY NAVIGATION)
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { BRAND_PURPLE, HAIRLINE, tap } from './shared';

type ProductHeaderNavProps = {
  showStickyHeader: boolean;
  title?: string | null;
  price?: number | null;
  onBack: () => void;
  onShare?: () => void;
};

export const ProductHeaderNav = memo(function ProductHeaderNav({
  showStickyHeader,
  title,
  price,
  onBack,
  onShare,
}: ProductHeaderNavProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const handleBack = () => {
    tap('light');
    onBack();
  };

  const handleShare = () => {
    if (onShare) {
      tap('light');
      onShare();
    }
  };

  // Button disc styling tailored for floating over imagery vs sticky bar
  const buttonBg = showStickyHeader
    ? theme.surface
    : isDark
      ? 'rgba(20, 20, 20, 0.72)'
      : 'rgba(255, 255, 255, 0.88)';

  const buttonBorder = showStickyHeader
    ? theme.border
    : isDark
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.08)';

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + (Platform.OS === 'android' ? 6 : 4),
          paddingBottom: 8,
          borderBottomWidth: showStickyHeader ? HAIRLINE : 0,
          borderBottomColor: theme.border,
          backgroundColor: showStickyHeader
            ? Platform.OS === 'ios'
              ? 'transparent'
              : isDark
                ? 'rgba(15, 15, 15, 0.94)'
                : 'rgba(255, 255, 255, 0.94)'
            : 'transparent',
        },
      ]}
      pointerEvents="box-none"
    >
      {showStickyHeader && Platform.OS === 'ios' && (
        <BlurView
          intensity={30}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      <View style={styles.navRow}>
        {/* Left Slot: 40x40px Back Button Disc */}
        <View style={styles.sideSlot}>
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.navButton,
              {
                backgroundColor: buttonBg,
                borderColor: buttonBorder,
                transform: [{ scale: pressed ? 0.92 : 1 }],
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather name="arrow-left" size={20} color={theme.ink} />
          </Pressable>
        </View>

        {/* Center Slot: Product Title & Price (Sticky Mode Only) */}
        <View style={styles.centerSlot}>
          {showStickyHeader ? (
            <View style={styles.titleContainer}>
              {title ? (
                <Text
                  style={[styles.title, { color: theme.ink }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              ) : null}
              {price != null ? (
                <Text style={[styles.price, { color: BRAND_PURPLE }]}>
                  {formatPrice(price, { whole: true })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Right Slot: 40x40px Share Button (or Spacer for Perfect Symmetry) */}
        <View style={styles.sideSlot}>
          {onShare ? (
            <Pressable
              onPress={handleShare}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Share this item"
              style={({ pressed }) => [
                styles.navButton,
                {
                  backgroundColor: buttonBg,
                  borderColor: buttonBorder,
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="share" size={17} color={theme.ink} />
            </Pressable>
          ) : (
            <View style={styles.spacer} />
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 16,
  },
  navRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: 40,
    height: 40,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  titleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  price: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 1,
    textAlign: 'center',
  },
});
