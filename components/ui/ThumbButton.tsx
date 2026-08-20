import React from 'react';
import {
  Pressable,
  View,
  ActivityIndicator,
  Platform,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Feather from '@expo/vector-icons/Feather';
import { Text } from '@/lib/rnText';
import { colors, radii, type } from '@/lib/theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'dark'
  | 'soft'
  | 'ghost'
  | 'danger'
  | 'text';

export type ButtonHeightToken = '44px' | '48px' | '52px' | '56px';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'hero';

export interface ThumbButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Height token or semantic size */
  size?: ButtonSize;
  heightToken?: ButtonHeightToken;
  icon?: keyof typeof Feather.glyphMap;
  iconRight?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Enable or disable haptic feedback on touch (defaults to true) */
  enableHaptics?: boolean;
  /** Optional badge count or tag string (e.g. item count "12") */
  badge?: string | number;
  className?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
}

const HEIGHT_MAP: Record<ButtonSize, number> = {
  sm: 44, // Minimum 44px mobile touch target
  md: 48, // Standard primary action height
  lg: 52, // High priority sticky CTA
  hero: 56, // Full screen checkout / publish conversion
};

const TOKEN_HEIGHTS: Record<ButtonHeightToken, number> = {
  '44px': 44,
  '48px': 48,
  '52px': 52,
  '56px': 56,
};

const FONT_SIZES: Record<ButtonSize, number> = {
  sm: 13,
  md: 14,
  lg: 15,
  hero: 16,
};

const PADDING_HORIZONTAL: Record<ButtonSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
  hero: 28,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Mobile-First ThumbButton.
 * Engineered for thumb-zone ergonomics with strict >=44px touch targets,
 * 120fps Reanimated press-physics, haptic impacts, and WCAG AA contrast.
 */
export function ThumbButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  heightToken,
  icon,
  iconRight = false,
  loading = false,
  disabled = false,
  fullWidth = true,
  enableHaptics = true,
  badge,
  className = '',
  style,
  textStyle,
  accessibilityLabel,
}: ThumbButtonProps) {
  const height = heightToken ? TOKEN_HEIGHTS[heightToken] : HEIGHT_MAP[size];
  const fontSize = FONT_SIZES[size];
  const paddingX = PADDING_HORIZONTAL[size];
  const isInteractive = !disabled && !loading;

  // Reanimated 4 physics scale
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (!isInteractive) return;
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
    if (enableHaptics && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handlePressOut = () => {
    if (!isInteractive) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const colorStyles = getColorStyles(variant, disabled);

  return (
    <AnimatedPressable
      onPress={isInteractive ? onPress : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      // Explicit 44x44 minimum hit slop padding
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        { width: fullWidth ? '100%' : 'auto', alignSelf: fullWidth ? 'stretch' : 'flex-start' },
        animatedStyle,
      ]}
    >
      <View
        className={className}
        style={[
          styles.base,
          {
            height,
            paddingHorizontal: paddingX,
            backgroundColor: colorStyles.bg,
            borderWidth: colorStyles.borderWidth,
            borderColor: colorStyles.borderColor,
            borderRadius: radii.pill,
          },
          getVariantShadow(variant, disabled),
          style,
        ]}
      >
        {/* Leading Icon */}
        {!iconRight && icon && !loading && (
          <Feather
            name={icon}
            size={fontSize + 3}
            color={colorStyles.fg}
            style={styles.iconMargin}
          />
        )}

        {/* Loading Spinner or Text */}
        {loading ? (
          <ActivityIndicator size="small" color={colorStyles.fg} />
        ) : (
          <View style={styles.contentRow}>
            <Text
              style={[
                styles.label,
                {
                  color: colorStyles.fg,
                  fontSize,
                  fontFamily: type.family.sansBold,
                },
                textStyle,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>

            {badge !== undefined && badge !== null && badge !== 0 && badge !== '' && (
              <View
                style={[
                  styles.badgeContainer,
                  {
                    backgroundColor:
                      variant === 'primary' ? 'rgba(255,255,255,0.25)' : colors.primarySoft,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: variant === 'primary' ? colors.white : colors.primary,
                      fontSize: fontSize - 2,
                    },
                  ]}
                >
                  {badge}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Trailing Icon */}
        {iconRight && icon && !loading && (
          <Feather
            name={icon}
            size={fontSize + 3}
            color={colorStyles.fg}
            style={styles.iconRightMargin}
          />
        )}
      </View>
    </AnimatedPressable>
  );
}

function getColorStyles(variant: ButtonVariant, disabled?: boolean) {
  if (disabled) {
    return {
      bg: colors.panel,
      fg: colors.muteSoft,
      borderWidth: 0,
      borderColor: 'transparent',
    };
  }

  switch (variant) {
    case 'primary':
      return {
        bg: colors.primary,
        fg: colors.white,
        borderWidth: 0,
        borderColor: 'transparent',
      };
    case 'secondary':
    case 'ghost':
      return {
        bg: colors.white,
        fg: colors.ink,
        borderWidth: 1,
        borderColor: colors.hairline,
      };
    case 'dark':
      return {
        bg: colors.ink,
        fg: colors.white,
        borderWidth: 0,
        borderColor: 'transparent',
      };
    case 'soft':
      return {
        bg: colors.primarySoft,
        fg: colors.primary,
        borderWidth: 0,
        borderColor: 'transparent',
      };
    case 'danger':
      return {
        bg: colors.danger,
        fg: colors.white,
        borderWidth: 0,
        borderColor: 'transparent',
      };
    case 'text':
      return {
        bg: 'transparent',
        fg: colors.primary,
        borderWidth: 0,
        borderColor: 'transparent',
      };
    default:
      return {
        bg: colors.primary,
        fg: colors.white,
        borderWidth: 0,
        borderColor: 'transparent',
      };
  }
}

function getVariantShadow(variant: ButtonVariant, disabled?: boolean): ViewStyle {
  if (disabled || variant === 'ghost' || variant === 'secondary' || variant === 'text' || variant === 'soft') {
    return {};
  }

  if (variant === 'primary') {
    return Platform.select({
      ios: {
        shadowColor: '#6C47FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
      default: {
        boxShadow: '0 4px 14px rgba(108, 71, 255, 0.24)',
      },
    }) as ViewStyle;
  }

  if (variant === 'dark') {
    return Platform.select({
      ios: {
        shadowColor: '#0F0F0F',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      default: {
        boxShadow: '0 3px 10px rgba(15, 15, 15, 0.18)',
      },
    }) as ViewStyle;
  }

  return {};
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  iconMargin: {
    marginRight: 6,
  },
  iconRightMargin: {
    marginLeft: 6,
  },
  badgeContainer: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
  },
});
