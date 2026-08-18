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
import { ThumbButton } from '@/components/ui/ThumbButton';
import { colors, radii } from '@/lib/theme';
import { formatPrice } from '@/lib/currency';

export interface ProductActionBarProps {
  price?: number;
  buyTotal?: number;
  bottomInset?: number;
  onOfferOpen?: () => boolean | void;
  onSubmitOffer?: (amount: number) => void;
  onBuyPress?: () => void;
  onChatPress?: () => void;
  isOwner?: boolean;
  disabled?: boolean;
  className?: string;
  style?: ViewStyle;
}

/**
 * Mobile-First Sticky Product Action Bar (Z: 50).
 * Locked inside the thumb zone with dynamic safe area bottom clearance.
 * Features a 48x48px Chat action and balanced Make Offer / Buy Now split pills.
 */
export function ProductActionBar({
  price,
  buyTotal,
  bottomInset,
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

  const handleChat = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onChatPress?.();
  };

  const handleOffer = () => {
    const allowed = onOfferOpen ? onOfferOpen() : true;
    if (allowed !== false && onSubmitOffer) {
      // Offer trigger handled by parent sheet
    }
  };

  const formattedPrice = buyTotal
    ? formatPrice(buyTotal)
    : price
    ? formatPrice(price)
    : '';

  return (
    <View
      className={className}
      style={[
        styles.container,
        {
          paddingBottom: Math.max(safeBottom, 12) + 6,
        },
        style,
      ]}
    >
      <View style={styles.actionRow}>
        {/* Compact 48x48px Chat Icon Button */}
        {onChatPress && !isOwner && (
          <Pressable
            onPress={handleChat}
            disabled={disabled}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.chatButton,
              {
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Chat with seller"
          >
            <Feather name="message-circle" size={22} color={colors.ink} />
          </Pressable>
        )}

        {/* Split Action: "Make Offer" (Secondary Pill) */}
        {!isOwner && (
          <View style={styles.buttonFlex}>
            <ThumbButton
              label="Make Offer"
              variant="secondary"
              heightToken="48px"
              disabled={disabled}
              onPress={handleOffer}
              accessibilityLabel="Make an offer on this item"
            />
          </View>
        )}

        {/* Split Action: "Buy Now" / "Edit Listing" (Primary Pill) */}
        <View style={styles.buyButtonFlex}>
          <ThumbButton
            label={isOwner ? 'Edit Listing' : formattedPrice ? `Buy · ${formattedPrice}` : 'Buy Now'}
            variant="primary"
            heightToken="48px"
            disabled={disabled}
            onPress={onBuyPress}
            accessibilityLabel={isOwner ? 'Edit listing' : 'Buy now'}
          />
        </View>
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
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    paddingTop: 12,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
      default: {
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.08)',
      },
    }),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  chatButton: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFlex: {
    flex: 1,
  },
  buyButtonFlex: {
    flex: 1.15,
  },
});
