import React, { useState, useMemo } from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { ThumbButton } from '@/components/ui/ThumbButton';
import { Text, TextInput } from '@/lib/rnText';
import { colors, radii, type } from '@/lib/theme';
import { formatPrice, CURRENCY_SYMBOL } from '@/lib/currency';

export interface OfferSheetProps {
  visible: boolean;
  askingPrice: number;
  onClose: () => void;
  onSubmit: (amount: number) => void;
  loading?: boolean;
}

const DISCOUNT_TIERS = [0.10, 0.15, 0.20] as const;

/**
 * Mobile-First Quick Offer Bottom Sheet.
 * Displays smart discount calculation chips (-10%, -15%, -20%)
 * and an interactive numeric keypad for instant zero-navigation negotiation.
 */
export function OfferSheet({
  visible,
  askingPrice = 0,
  onClose,
  onSubmit,
  loading = false,
}: OfferSheetProps) {
  const [customAmount, setCustomAmount] = useState('');
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  // Compute preset discount offer amounts rounded to nearest whole dollar
  const presets = useMemo(() => {
    return DISCOUNT_TIERS.map((rate) => {
      const discounted = Math.max(1, Math.round(askingPrice * (1 - rate)));
      return {
        percent: Math.round(rate * 100),
        amount: discounted,
      };
    });
  }, [askingPrice]);

  const handleSelectTier = (tierIndex: number, amount: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedTier(tierIndex);
    setCustomAmount(String(amount));
  };

  const handleCustomChange = (text: string) => {
    const numericOnly = text.replace(/[^0-9]/g, '');
    setCustomAmount(numericOnly);
    setSelectedTier(null);
  };

  const parsedAmount = parseInt(customAmount, 10) || 0;
  const isValidOffer = parsedAmount > 0 && parsedAmount < askingPrice;

  const handleSubmit = () => {
    if (!isValidOffer) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onSubmit(parsedAmount);
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Make an Offer"
      subtitle="Direct binding offer to the seller"
      snapHeightRatio={0.62}
      scrollable
      footer={
        <View style={styles.footerInner}>
          <ThumbButton
            label={
              parsedAmount > 0
                ? `Send Binding Offer · ${formatPrice(parsedAmount)}`
                : 'Send Binding Offer'
            }
            variant="primary"
            heightToken="48px"
            disabled={!isValidOffer || loading}
            loading={loading}
            icon="tag"
            onPress={handleSubmit}
            accessibilityLabel="Send binding offer"
          />
        </View>
      }
    >
      <View style={styles.content}>
        {/* Asking Price Banner */}
        <View style={styles.askingRow}>
          <Text style={styles.askingLabel}>Listed asking price</Text>
          <Text style={[styles.askingValue, { fontFamily: type.family.sansBold }]}>
            {formatPrice(askingPrice)}
          </Text>
        </View>

        {/* 1-Tap Smart Offer Preset Chips */}
        <View style={styles.presetsRow}>
          {presets.map((tier, idx) => {
            const isSelected = selectedTier === idx;
            return (
              <Pressable
                key={tier.percent}
                onPress={() => handleSelectTier(idx, tier.amount)}
                style={[
                  styles.presetChip,
                  isSelected && styles.presetChipSelected,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`-${tier.percent}%: ${formatPrice(tier.amount)}`}
              >
                <Text
                  style={[
                    styles.presetPercent,
                    {
                      color: isSelected ? colors.primary : colors.mute,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                >
                  -{tier.percent}%
                </Text>
                <Text
                  style={[
                    styles.presetAmount,
                    {
                      color: isSelected ? colors.primary : colors.ink,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                >
                  {formatPrice(tier.amount)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Custom Input Field */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputPrefix}>{CURRENCY_SYMBOL}</Text>
          <TextInput
            value={customAmount}
            onChangeText={handleCustomChange}
            placeholder={String(askingPrice)}
            placeholderTextColor={colors.mute}
            keyboardType="number-pad"
            style={[styles.input, { fontFamily: type.family.sansBold }]}
            maxLength={6}
            returnKeyType="done"
          />
          {customAmount.length > 0 && (
            <Pressable
              onPress={() => {
                setCustomAmount('');
                setSelectedTier(null);
              }}
              hitSlop={8}
              style={styles.clearButton}
            >
              <Feather name="x" size={16} color={colors.mute} />
            </Pressable>
          )}
        </View>

        {/* Informational Guidance */}
        <View style={styles.infoBox}>
          <Feather name="info" size={14} color={colors.primary} />
          <Text style={styles.infoText}>
            Offers are valid for 24 hours. The seller can accept, counter, or decline.
          </Text>
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  askingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: radii.xl,
  },
  askingLabel: {
    fontSize: 13,
    color: colors.mute,
  },
  askingValue: {
    fontSize: 15,
    color: colors.ink,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  presetChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  presetPercent: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  presetAmount: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: radii['2xl'],
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
  },
  inputPrefix: {
    fontSize: 20,
    color: colors.ink,
    fontFamily: type.family.sansBold,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 22,
    color: colors.ink,
    padding: 0,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(108, 71, 255, 0.06)',
    borderRadius: radii.lg,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: colors.mute,
    lineHeight: 15,
  },
  footerInner: {
    width: '100%',
    paddingBottom: 4,
  },
});
