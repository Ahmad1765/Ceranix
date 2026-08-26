import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  Pressable,
  Platform,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import { colors, radii, shadow, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice, CURRENCY_SYMBOL } from '@/lib/currency';
import { orderTotal } from '@/lib/fees';
import { getOptimizedImageUrl } from '@/lib/images';

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
 * Quiet Atelier "Make an offer" bottom sheet modal.
 * Features 10% / 20% / Custom price cards, numeric input,
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
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const inputRef = useRef<any>(null);

  const rawPrice = askingPriceProp ?? itemPriceProp ?? 0;
  const askingPrice = typeof rawPrice === 'number' && Number.isFinite(rawPrice) ? rawPrice : 0;

  const [selectedCard, setSelectedCard] = useState<'tier10' | 'tier20' | 'custom'>('custom');
  const [customAmount, setCustomAmount] = useState('15');
  const [submitting, setSubmitting] = useState(false);

  // Preset tiers: 10% off and 20% off
  const preset10 = useMemo(() => {
    if (askingPrice <= 0) return 0;
    return Math.max(1, Math.round(askingPrice * 0.9));
  }, [askingPrice]);

  const preset20 = useMemo(() => {
    if (askingPrice <= 0) return 0;
    return Math.max(1, Math.round(askingPrice * 0.8));
  }, [askingPrice]);

  // Reset or initialize state on open
  useEffect(() => {
    if (visible) {
      if (askingPrice > 0) {
        setCustomAmount(String(preset20 || Math.round(askingPrice * 0.8)));
        setSelectedCard('custom');
      } else {
        setCustomAmount('');
        setSelectedCard('custom');
      }
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
      inputRef.current?.focus?.();
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
      [{ text: 'Got it' }]
    );
  };

  if (!visible) return null;

  const optimizedThumb = imageUrl ? getOptimizedImageUrl(imageUrl, { width: 100 }) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Backdrop dismiss */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close offer modal"
        />

        {/* Modal Sheet Container */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', maxWidth: 540, alignSelf: 'center' }}
        >
          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
          >
            {/* Grab Handle */}
            <View style={styles.grabHandle} />

            {/* Header Bar */}
            <View style={[styles.headerBar, { borderBottomColor: colors.hairline }]}>
              <Pressable
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={[styles.closeText, { color: colors.muteSoft }]}>Cancel</Text>
              </Pressable>

              <Text
                style={[
                  styles.headerTitle,
                  { color: colors.ink, fontFamily: type.family.sansBold },
                ]}
              >
                Make an Offer
              </Text>

              {/* Spacer to keep title centered */}
              <View style={styles.headerSpacer} />
            </View>

            {/* Main Content Area */}
            <View style={styles.mainContent}>
              {/* Item Card Row */}
              <View
                style={[
                  styles.itemRow,
                  { backgroundColor: colors.panel, borderColor: colors.hairline },
                ]}
              >
                {optimizedThumb ? (
                  <Image
                    source={{ uri: optimizedThumb }}
                    style={styles.itemImage}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <View style={[styles.itemImagePlaceholder, { backgroundColor: colors.surface }]}>
                    <Feather name="tag" size={20} color={colors.mute} />
                  </View>
                )}

                <View style={styles.itemDetails}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.itemTitle,
                      { color: colors.ink, fontFamily: type.family.sansBold },
                    ]}
                  >
                    {title || 'Selected Item'}
                  </Text>
                  <Text style={[styles.itemPrice, { color: colors.mute }]}>
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
                        selectedCard === 'tier10' ? colors.purpleSoft : colors.panel,
                      borderColor:
                        selectedCard === 'tier10' ? colors.purple : colors.hairline,
                      borderWidth: selectedCard === 'tier10' ? 1.5 : 1,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`10% off: ${formatPrice(preset10)}`}
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      {
                        color: selectedCard === 'tier10' ? colors.purple : colors.ink,
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
                        color: selectedCard === 'tier10' ? colors.purple : colors.muteSoft,
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
                        selectedCard === 'tier20' ? colors.purpleSoft : colors.panel,
                      borderColor:
                        selectedCard === 'tier20' ? colors.purple : colors.hairline,
                      borderWidth: selectedCard === 'tier20' ? 1.5 : 1,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`20% off: ${formatPrice(preset20)}`}
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      {
                        color: selectedCard === 'tier20' ? colors.purple : colors.ink,
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
                        color: selectedCard === 'tier20' ? colors.purple : colors.muteSoft,
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
                        selectedCard === 'custom' ? colors.purpleSoft : colors.panel,
                      borderColor:
                        selectedCard === 'custom' ? colors.purple : colors.hairline,
                      borderWidth: selectedCard === 'custom' ? 1.5 : 1,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Custom set a price"
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      {
                        color: selectedCard === 'custom' ? colors.purple : colors.ink,
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
                        color: selectedCard === 'custom' ? colors.purple : colors.muteSoft,
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
                    backgroundColor: colors.panel,
                    borderColor: selectedCard === 'custom' ? colors.purple : colors.hairline,
                  },
                ]}
              >
                <Text style={styles.inputEyebrow}>YOUR OFFER AMOUNT</Text>
                <View style={styles.displayRow}>
                  <Text style={[styles.currencyPrefix, { color: colors.ink }]}>
                    {CURRENCY_SYMBOL}
                  </Text>
                  <TextInput
                    ref={inputRef}
                    value={customAmount}
                    onChangeText={handleCustomChange}
                    placeholder="0"
                    placeholderTextColor={colors.muteSoft}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    style={[
                      styles.amountInput,
                      {
                        color: colors.ink,
                        fontFamily: type.family.sansBold,
                      },
                    ]}
                  />
                </View>

                {/* Fee breakdown helper text */}
                <View style={styles.feeBreakdownRow}>
                  <Feather name="shield" size={13} color={colors.purple} />
                  <Text style={[styles.feeHelperText, { color: colors.mute }]}>
                    {parsedAmount > 0
                      ? `${formatPrice(totalWithProtection)} incl. Buyer Protection`
                      : `Includes Buyer Protection guarantee`}
                  </Text>
                </View>
              </Pressable>

              {/* Action Button: "Offer $15.00" */}
              <View style={styles.actionButtonContainer}>
                <Pressable
                  onPress={handleSubmit}
                  disabled={!isValidOffer || submitting || loading}
                  style={({ pressed }) => [
                    styles.actionButton,
                    {
                      backgroundColor: colors.purple,
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

              {/* Subtext: "25 offers left for today. Learn why." */}
              <View style={styles.limitRow}>
                <Text style={[styles.limitText, { color: colors.muteSoft }]}>
                  {offersLeftToday} offers remaining today.{' '}
                </Text>
                <Pressable onPress={handleLearnWhy} hitSlop={6}>
                  <Text style={[styles.learnWhyText, { color: colors.purple }]}>Learn why.</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.50)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radii['3xl'],
    borderTopRightRadius: radii['3xl'],
    overflow: 'hidden',
    borderTopWidth: 1,
    ...shadow.lg,
  },
  grabHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15, 15, 15, 0.15)',
    alignSelf: 'center',
    marginTop: 10,
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
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 56,
  },
  closeText: {
    fontSize: 14.5,
    fontFamily: type.family.sansMedium,
  },
  headerTitle: {
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSpacer: {
    minWidth: 56,
  },
  mainContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    padding: 10,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  itemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 14,
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
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTopText: {
    fontSize: 15,
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cardBottomText: {
    fontSize: 12,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 18,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  inputEyebrow: {
    fontSize: 10.5,
    fontFamily: type.family.sansBold,
    fontWeight: '700',
    color: colors.muteSoft,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currencyPrefix: {
    fontSize: 26,
    fontFamily: type.family.sansBold,
    fontWeight: '700',
  },
  amountInput: {
    flex: 1,
    fontSize: 26,
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
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  feeHelperText: {
    fontSize: 12.5,
    fontFamily: type.family.sansMedium,
  },
  actionButtonContainer: {
    marginBottom: 12,
  },
  actionButton: {
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionButtonText: {
    fontSize: 15,
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
    fontSize: 12.5,
    fontFamily: type.family.sans,
  },
  learnWhyText: {
    fontSize: 12.5,
    fontFamily: type.family.sansBold,
    textDecorationLine: 'underline',
  },
});
