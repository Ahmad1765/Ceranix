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
import { useTheme } from '@/context/ThemeContext';
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
  const { theme, isDark } = useTheme();
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
          {parsedAmount >= askingPrice && parsedAmount > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginBottom: 8,
              }}
            >
              <Feather name="alert-circle" size={13} color={colors.danger} />
              <Text style={{ fontSize: 12, color: colors.danger, fontFamily: type.family.sans }}>
                Offers must be below the asking price ({formatPrice(askingPrice)})
              </Text>
            </View>
          )}
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
        <View style={[styles.askingRow, { backgroundColor: theme.panel }]}>
          <Text style={[styles.askingLabel, { color: theme.mute }]}>Listed asking price</Text>
          <Text style={[styles.askingValue, { color: theme.ink, fontFamily: type.family.sansBold }]}>
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
                  {
                    backgroundColor: isSelected
                      ? (isDark ? 'rgba(108, 71, 255, 0.22)' : theme.primarySoft)
                      : theme.panel,
                    borderColor: isSelected ? theme.purple : theme.hairline,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`-${tier.percent}%: ${formatPrice(tier.amount)}`}
              >
                <Text
                  style={[
                    styles.presetPercent,
                    {
                      color: isSelected ? (isDark ? '#A78BFA' : theme.purple) : theme.mute,
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
                      color: isSelected ? (isDark ? '#FFFFFF' : theme.purple) : theme.ink,
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
        <View style={[styles.inputContainer, { backgroundColor: theme.panel, borderColor: theme.hairline }]}>
          <Text style={[styles.inputPrefix, { color: theme.ink }]}>{CURRENCY_SYMBOL}</Text>
          <TextInput
            value={customAmount}
            onChangeText={handleCustomChange}
            placeholder={String(askingPrice)}
            placeholderTextColor={theme.mute}
            keyboardType="number-pad"
            style={[styles.input, { color: theme.ink, fontFamily: type.family.sansBold }]}
            maxLength={Math.max(10, String(askingPrice || 0).length + 2)}
            returnKeyType="done"
          />
          {customAmount.length > 0 && (
            <Pressable
              onPress={() => {
                setCustomAmount('');
                setSelectedTier(null);
              }}
              hitSlop={8}
              style={[styles.clearButton, { backgroundColor: theme.surface }]}
            >
              <Feather name="x" size={16} color={theme.mute} />
            </Pressable>
          )}
        </View>

        {/* Informational Guidance */}
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: isDark ? 'rgba(108, 71, 255, 0.15)' : 'rgba(108, 71, 255, 0.06)',
            },
          ]}
        >
          <Feather name="info" size={14} color={isDark ? '#A78BFA' : theme.purple} />
          <Text style={[styles.infoText, { color: theme.mute }]}>
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
