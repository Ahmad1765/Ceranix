import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  Pressable,
  Platform,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { radii, shadow, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice, CURRENCY_SYMBOL } from '@/lib/currency';
import { orderTotal } from '@/lib/fees';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';

export interface OfferSheetProps {
  visible: boolean;
  askingPrice?: number | null;
  itemPrice?: number | null; // backward compatibility alias
  title?: string | null;
  imageUrl?: string | null;
  onClose: () => void;
  onSubmit: (amount: number, note?: string) => Promise<void> | void;
  loading?: boolean;
  offersLeftToday?: number;
}

/**
 * Full-page Vinted-style "Make an offer" modal.
 * Features full-page presentation, 10% / 20% / Custom price cards,
 * large prominent numeric input with glitch-free native keypad handling,
 * dynamic buyer protection fee calculation, and Signal Purple action CTA.
 */
export function OfferSheet({
  visible,
  askingPrice: askingPriceProp,
  itemPrice: itemPriceProp,
  title,
  imageUrl,
  onClose,
  onSubmit,
  loading = false,
  offersLeftToday = 25,
}: OfferSheetProps) {
  const { theme, isDark } = useTheme();
  const inputRef = useRef<any>(null);

  // Normalize asking price
  const askingPrice = Number(askingPriceProp ?? itemPriceProp ?? 0);

  // 10% and 20% round numbers
  const preset10 = useMemo(() => Math.round(askingPrice * 0.9), [askingPrice]);
  const preset20 = useMemo(() => Math.round(askingPrice * 0.8), [askingPrice]);

  const [selectedCard, setSelectedCard] = useState<'tier10' | 'tier20' | 'custom'>('tier20');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const optimizedThumb = imageUrl
    ? getOptimizedImageUrl(imageUrl, { width: 120 })
    : null;

  // Initialize selected tier on open
  useEffect(() => {
    if (visible) {
      setSelectedCard('tier20');
      setCustomAmount(preset20 > 0 ? String(preset20) : '');
      setSubmitting(false);
    }
  }, [visible, askingPrice, preset20]);

  const handleSelectCard = (card: 'tier10' | 'tier20' | 'custom') => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedCard(card);

    if (card === 'tier10') {
      setCustomAmount(String(preset10));
      inputRef.current?.blur?.();
    } else if (card === 'tier20') {
      setCustomAmount(String(preset20));
      inputRef.current?.blur?.();
    } else if (card === 'custom') {
      setTimeout(() => {
        inputRef.current?.focus?.();
      }, 50);
    }
  };

  const handleCustomChange = (text: string) => {
    // Only allow digits and a single decimal point
    const clean = text.replace(/[^0-9.]/g, '');
    setSelectedCard('custom');
    setCustomAmount(clean);
  };

  const parsedAmount = parseFloat(customAmount) || 0;
  const isValidOffer = parsedAmount > 0 && (askingPrice <= 0 || parsedAmount < askingPrice);

  const totalWithProtection = useMemo(() => {
    if (parsedAmount <= 0) return 0;
    return orderTotal(parsedAmount);
  }, [parsedAmount]);

  const handleSubmit = async () => {
    if (!isValidOffer || submitting || loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    setSubmitting(true);
    try {
      await onSubmit(parsedAmount);
    } catch (e) {
      console.warn('[OfferSheet] submit failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLearnWhy = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    Alert.alert(
      'Daily Offer Limit',
      'To prevent spam and keep negotiations active and meaningful for sellers, buyers are limited to 25 offers per day.',
      [{ text: 'Got it' }],
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[
          styles.fullPageContainer,
          { backgroundColor: isDark ? theme.background : '#F9FAFB' },
        ]}
      >
        {/* Top Navigation Header */}
        <View
          style={[
            styles.headerBar,
            {
              borderBottomColor: theme.hairline,
              backgroundColor: isDark ? theme.background : '#FFFFFF',
            },
          ]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Feather name="arrow-left" size={24} color={theme.ink} />
          </Pressable>

          <Text
            style={[
              styles.headerTitle,
              { color: theme.ink, fontFamily: type.family.sansBold },
            ]}
          >
            Make an offer
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        {/* Full-Page Content with Keypad Stability */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Item Card Row */}
            <View
              style={[
                styles.itemRow,
                {
                  backgroundColor: isDark ? theme.surface : '#FFFFFF',
                  borderColor: isDark ? theme.border : '#E5E7EB',
                },
              ]}
            >
              {optimizedThumb ? (
                <Image
                  source={{ uri: optimizedThumb }}
                  style={styles.itemImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={IMAGE_TRANSITION}
                />
              ) : (
                <View style={[styles.itemImagePlaceholder, { backgroundColor: isDark ? theme.panel : '#F4F4F5' }]}>
                  <Feather name="tag" size={20} color={theme.mute} />
                </View>
              )}

              <View style={styles.itemDetails}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.itemTitle,
                    { color: theme.ink, fontFamily: type.family.sansBold },
                  ]}
                >
                  {title || 'Selected Item'}
                </Text>
                <Text style={[styles.itemPrice, { color: theme.mute }]}>
                  Listing price: {formatPrice(askingPrice)}
                </Text>
              </View>
            </View>

            {/* 3 Preset Tier Cards */}
            <View style={styles.cardsRow}>
              {/* 10% off card */}
              <Pressable
                onPress={() => handleSelectCard('tier10')}
                style={({ pressed }) => [
                  styles.presetCard,
                  {
                    backgroundColor:
                      selectedCard === 'tier10'
                        ? theme.purpleSoft
                        : isDark
                        ? theme.surface
                        : '#FFFFFF',
                    borderColor:
                      selectedCard === 'tier10'
                        ? theme.purple
                        : isDark
                        ? theme.border
                        : '#E5E7EB',
                    borderWidth: selectedCard === 'tier10' ? 1.5 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`10% off: ${formatPrice(preset10)}`}
              >
                <Text
                  style={[
                    styles.cardTopText,
                    {
                      color: selectedCard === 'tier10' ? theme.purple : theme.ink,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                >
                  {formatPrice(preset10)}
                </Text>
                <Text
                  style={[
                    styles.cardBottomText,
                    {
                      color: selectedCard === 'tier10' ? theme.purple : theme.mute,
                      fontFamily: type.family.sansMedium,
                    },
                  ]}
                >
                  10% off
                </Text>
              </Pressable>

              {/* 20% off card */}
              <Pressable
                onPress={() => handleSelectCard('tier20')}
                style={({ pressed }) => [
                  styles.presetCard,
                  {
                    backgroundColor:
                      selectedCard === 'tier20'
                        ? theme.purpleSoft
                        : isDark
                        ? theme.surface
                        : '#FFFFFF',
                    borderColor:
                      selectedCard === 'tier20'
                        ? theme.purple
                        : isDark
                        ? theme.border
                        : '#E5E7EB',
                    borderWidth: selectedCard === 'tier20' ? 1.5 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`20% off: ${formatPrice(preset20)}`}
              >
                <Text
                  style={[
                    styles.cardTopText,
                    {
                      color: selectedCard === 'tier20' ? theme.purple : theme.ink,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                >
                  {formatPrice(preset20)}
                </Text>
                <Text
                  style={[
                    styles.cardBottomText,
                    {
                      color: selectedCard === 'tier20' ? theme.purple : theme.mute,
                      fontFamily: type.family.sansMedium,
                    },
                  ]}
                >
                  20% off
                </Text>
              </Pressable>

              {/* Custom card */}
              <Pressable
                onPress={() => handleSelectCard('custom')}
                style={({ pressed }) => [
                  styles.presetCard,
                  {
                    backgroundColor:
                      selectedCard === 'custom'
                        ? theme.purpleSoft
                        : isDark
                        ? theme.surface
                        : '#FFFFFF',
                    borderColor:
                      selectedCard === 'custom'
                        ? theme.purple
                        : isDark
                        ? theme.border
                        : '#E5E7EB',
                    borderWidth: selectedCard === 'custom' ? 1.5 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Custom set a price"
              >
                <Text
                  style={[
                    styles.cardTopText,
                    {
                      color: selectedCard === 'custom' ? theme.purple : theme.ink,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                >
                  Custom
                </Text>
                <Text
                  style={[
                    styles.cardBottomText,
                    {
                      color: selectedCard === 'custom' ? theme.purple : theme.mute,
                      fontFamily: type.family.sansMedium,
                    },
                  ]}
                >
                  Set a price
                </Text>
              </Pressable>
            </View>

            {/* Input Section */}
            <Pressable
              onPress={() => {
                setSelectedCard('custom');
                inputRef.current?.focus?.();
              }}
              style={[
                styles.inputSection,
                {
                  backgroundColor: isDark ? theme.surface : '#FFFFFF',
                  borderColor:
                    selectedCard === 'custom'
                      ? theme.purple
                      : isDark
                      ? theme.border
                      : '#E5E7EB',
                  borderWidth: selectedCard === 'custom' ? 1.5 : 1,
                },
              ]}
            >
              <Text style={[styles.inputEyebrow, { color: theme.mute }]}>
                YOUR OFFER AMOUNT
              </Text>

              <View style={styles.displayRow}>
                <Text
                  style={[
                    styles.currencyPrefix,
                    {
                      color: theme.ink,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                >
                  {CURRENCY_SYMBOL}
                </Text>
                <TextInput
                  ref={inputRef}
                  value={customAmount}
                  onChangeText={handleCustomChange}
                  placeholder="0"
                  placeholderTextColor={theme.muteSoft}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                  style={[
                    styles.amountInput,
                    {
                      color: theme.ink,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                />
              </View>

              {/* Fee breakdown helper text */}
              <View style={[styles.feeBreakdownRow, { borderTopColor: isDark ? theme.hairline : '#E5E7EB' }]}>
                <ShieldCheckIcon size={16} />
                <Text style={[styles.feeHelperText, { color: theme.mute }]}>
                  {parsedAmount > 0
                    ? `${formatPrice(totalWithProtection)} incl. Buyer Protection`
                    : `Includes Buyer Protection guarantee`}
                </Text>
              </View>
            </Pressable>

            {/* Action Button: "Send Offer · Rs 16" */}
            <View style={styles.actionButtonContainer}>
              <Pressable
                onPress={handleSubmit}
                disabled={!isValidOffer || submitting || loading}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: theme.purple,
                    opacity: !isValidOffer || submitting || loading ? 0.45 : pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                    ...shadow.sm,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  parsedAmount > 0 ? `Offer ${formatPrice(parsedAmount)}` : 'Make an offer'
                }
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    { fontFamily: type.family.sansBold },
                  ]}
                >
                  {submitting || loading
                    ? 'Sending offer…'
                    : parsedAmount > 0
                    ? `Send Offer · ${formatPrice(parsedAmount)}`
                    : 'Make an offer'}
                </Text>
              </Pressable>
            </View>

            {/* Subtext: "25 offers remaining today. Learn why." */}
            <View style={styles.limitRow}>
              <Text style={[styles.limitText, { color: theme.mute }]}>
                {offersLeftToday} offers remaining today.{' '}
              </Text>
              <Pressable onPress={handleLearnWhy} hitSlop={6}>
                <Text style={[styles.learnWhyText, { color: theme.purple }]}>Learn why.</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullPageContainer: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 36,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  itemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 15,
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  itemPrice: {
    fontSize: 13,
    fontFamily: type.family.sansMedium,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  presetCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTopText: {
    fontSize: 16,
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cardBottomText: {
    fontSize: 12.5,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
  },
  inputEyebrow: {
    fontSize: 11,
    fontFamily: type.family.sansBold,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    padding: 0,
    margin: 0,
    height: 38,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  feeBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  feeHelperText: {
    fontSize: 13,
    fontFamily: type.family.sansMedium,
  },
  actionButtonContainer: {
    marginBottom: 14,
  },
  actionButton: {
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  limitText: {
    fontSize: 13,
    fontFamily: type.family.sans,
  },
  learnWhyText: {
    fontSize: 13,
    fontFamily: type.family.sansBold,
    textDecorationLine: 'underline',
  },
});
