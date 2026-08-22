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

import { colors } from '@/lib/theme';

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
  disabled = false,
  className = '',
  style,
}: ProductActionBarProps) {
  const insets = useSafeAreaInsets();
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
    if (allowed !== false && onSubmitOffer) {
      // Offer trigger
    }
  };

  const handleBuy = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onBuyPress?.();
  };

  return (
    <View
      className={className}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(safeBottom, 16),
        },
        style,
      ]}
    >
      {/* Secure checkout · Buyer Protection included trust line */}
      <View
        accessibilityRole="text"
        style={styles.trustRow}
      >
        <Feather name="lock" size={12} color={colors.mute} />
        <Text style={[styles.trustText, { color: colors.mute }]}>
          Secure checkout · Buyer Protection included
        </Text>
      </View>

      <View style={styles.actionRow}>
        {/* Equal halves, both 48h/10r: one outlined, one filled */}
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
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text style={[styles.offerButtonText, { color: colors.ink }]}>Make an offer</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleBuy}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            isOwner
              ? 'Edit listing'
              : `Buy now for ${buyTotal ? formatPrice(buyTotal) : price ? formatPrice(price) : ''}, Buyer Protection included`
          }
          accessibilityHint="Proceeds to secure checkout"
          style={({ pressed }) => [
            styles.buyButton,
            {
              backgroundColor: colors.purple,
              borderColor: colors.purple,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={[styles.buyButtonText, { color: '#FFFFFF' }]}>
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
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(15, 15, 15, 0.62)',
    fontFamily: 'Inter_500Medium',
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
    borderColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  offerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F0F0F',
    fontFamily: 'Inter_700Bold',
  },
  buyButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#0F0F0F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
});
