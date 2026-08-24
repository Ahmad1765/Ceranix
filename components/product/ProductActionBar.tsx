import React from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Text } from '@/lib/rnText';
import { formatPrice } from '@/lib/currency';
import { useTheme } from '@/context/ThemeContext';

export interface ProductActionBarProps {
  price?: number;
  buyTotal?: number;
  bpFee?: number;
  bottomInset?: number;
  onOfferPress?: () => void;
  onOfferOpen?: () => boolean | void;
  onSubmitOffer?: (amount: number) => void;
  onBuyPress?: () => void;
  onChatPress?: () => void;
  isOwner?: boolean;
  isSold?: boolean;
  disabled?: boolean;
  className?: string;
  style?: ViewStyle;
}

export function ProductActionBar({
  price,
  buyTotal,
  bpFee,
  bottomInset,
  onOfferPress,
  onOfferOpen,
  onSubmitOffer,
  onBuyPress,
  onChatPress,
  isOwner = false,
  isSold = false,
  disabled = false,
  className = '',
  style,
}: ProductActionBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const safeBottom = bottomInset !== undefined ? bottomInset : insets.bottom;

  const handleOffer = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (onOfferPress) {
      onOfferPress();
      return;
    }
    const allowed = onOfferOpen ? onOfferOpen() : true;
    if (allowed === false) return;
  };

  const handleBuy = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onBuyPress?.();
  };

  if (isSold) {
    return (
      <View
        className={className}
        style={[
          styles.container,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: Math.max(safeBottom, 16),
          },
          style,
        ]}
      >
        <View style={[styles.soldContainer, { backgroundColor: theme.panel }]}>
          <Text style={[styles.soldText, { color: theme.mute }]}>This item has been sold</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      className={className}
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: Math.max(safeBottom, 16),
        },
        style,
      ]}
    >
      <View style={styles.actionRow}>
        {!isOwner && (
          <Pressable
            onPress={handleOffer}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Make an offer"
            accessibilityHint="Opens a sheet to send the seller a price suggestion"
            style={({ pressed }) => [
              styles.offerButton,
              {
                backgroundColor: theme.panel,
                borderColor: theme.border,
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text style={[styles.offerButtonText, { color: theme.ink }]}>Make an offer</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleBuy}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            isOwner
              ? 'Edit listing'
              : `Buy now for ${buyTotal ? formatPrice(buyTotal) : price ? formatPrice(price) : ''}`
          }
          accessibilityHint="Proceeds to secure checkout"
          style={({ pressed }) => [
            styles.buyButton,
            {
              backgroundColor: theme.ink,
              borderColor: theme.ink,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={[styles.buyButtonText, { color: theme.background }]}>
            {isOwner ? 'Edit listing' : 'Buy now'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 15, 15, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      default: {
        boxShadow: '0px -4px 10px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  offerButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  buyButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
  soldContainer: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
