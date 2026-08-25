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
import { radii, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
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

const TEAL_BRAND = '#007782';

/**
 * Vinted-style "Make an offer" bottom sheet modal.
 * Features 10% / 20% / Custom price cards, native numeric input,
 * dynamic buyer protection fee calculations, primary action CTA, and daily limits.
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
  const { theme, isDark } = useTheme();
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
                backgroundColor: isDark ? theme.surface : '#FFFFFF',
                borderColor: theme.border,
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
          >
            {/* Header Bar */}
            <View style={[styles.headerBar, { borderBottomColor: isDark ? theme.hairline : '#E5E7EB' }]}>
              <Pressable
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={[styles.closeText, { color: isDark ? theme.ink : '#15191A' }]}>Close</Text>
              </Pressable>

              <Text
                style={[
                  styles.headerTitle,
                  { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                ]}
              >
                Make an offer
              </Text>

              {/* Spacer to keep title centered */}
              <View style={styles.headerSpacer} />
            </View>

            {/* Main Content Area */}
            <View style={styles.mainContent}>
              {/* Item Card Row */}
              <View style={styles.itemRow}>
                {optimizedThumb ? (
                  <Image
                    source={{ uri: optimizedThumb }}
                    style={styles.itemImage}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <View style={[styles.itemImagePlaceholder, { backgroundColor: isDark ? theme.panel : '#F3F4F6' }]}>
                    <Feather name="tag" size={22} color={theme.mute} />
                  </View>
                )}

                <View style={styles.itemDetails}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.itemTitle,
                      { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                    ]}
                  >
                    {title || 'Selected Item'}
                  </Text>
                  <Text style={[styles.itemPrice, { color: isDark ? theme.mute : '#5A6566' }]}>
                    Item price: {formatPrice(askingPrice)}
                  </Text>
                </View>
              </View>

              {/* 3 Preset Tier Cards */}
              <View style={styles.cardsRow}>
                {/* 10% off card */}
                <Pressable
                  onPress={() => handleSelectCard('tier10')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: isDark ? theme.panel : '#FFFFFF',
                      borderColor: selectedCard === 'tier10' ? TEAL_BRAND : isDark ? theme.border : '#E5E7EB',
                      borderWidth: selectedCard === 'tier10' ? 2 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`10% off: ${formatPrice(preset10)}`}
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                    ]}
                  >
                    {formatPrice(preset10)}
                  </Text>
                  <Text style={[styles.cardBottomText, { color: TEAL_BRAND, fontFamily: type.family.sansMedium }]}>
                    10% off
                  </Text>
                </Pressable>

                {/* 20% off card */}
                <Pressable
                  onPress={() => handleSelectCard('tier20')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: isDark ? theme.panel : '#FFFFFF',
                      borderColor: selectedCard === 'tier20' ? TEAL_BRAND : isDark ? theme.border : '#E5E7EB',
                      borderWidth: selectedCard === 'tier20' ? 2 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`20% off: ${formatPrice(preset20)}`}
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                    ]}
                  >
                    {formatPrice(preset20)}
                  </Text>
                  <Text style={[styles.cardBottomText, { color: TEAL_BRAND, fontFamily: type.family.sansMedium }]}>
                    20% off
                  </Text>
                </Pressable>

                {/* Custom card */}
                <Pressable
                  onPress={() => handleSelectCard('custom')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: isDark ? theme.panel : '#FFFFFF',
                      borderColor: selectedCard === 'custom' ? TEAL_BRAND : isDark ? theme.border : '#E5E7EB',
                      borderWidth: selectedCard === 'custom' ? 2 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Custom set a price"
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                    ]}
                  >
                    Custom
                  </Text>
                  <Text style={[styles.cardBottomText, { color: TEAL_BRAND, fontFamily: type.family.sansMedium }]}>
                    Set a price
                  </Text>
                </Pressable>
              </View>

              {/* Input Section with underline */}
              <Pressable
                onPress={() => {
                  setSelectedCard('custom');
                  inputRef.current?.focus?.();
                }}
                style={styles.inputSection}
              >
                <View style={styles.displayRow}>
                  <TextInput
                    ref={inputRef}
                    value={customAmount}
                    onChangeText={handleCustomChange}
                    placeholder="0"
                    placeholderTextColor={isDark ? theme.mute : '#9CA3AF'}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    style={[
                      styles.amountInput,
                      {
                        color: isDark ? theme.ink : '#15191A',
                        fontFamily: type.family.sansBold,
                      },
                    ]}
                  />
                </View>

                {/* Underline */}
                <View
                  style={[
                    styles.underline,
                    {
                      backgroundColor:
                        selectedCard === 'custom'
                          ? TEAL_BRAND
                          : isDark
                          ? '#4B5563'
                          : '#6B7280',
                    },
                  ]}
                />

                {/* Fee breakdown helper text */}
                <Text style={[styles.feeHelperText, { color: isDark ? theme.mute : '#5A6566' }]}>
                  {parsedAmount > 0
                    ? `${formatPrice(totalWithProtection)} incl. Buyer Protection fee`
                    : `incl. Buyer Protection fee`}
                </Text>
              </Pressable>

              {/* Action Button: "Offer $15.00" */}
              <View style={styles.actionButtonContainer}>
                <Pressable
                  onPress={handleSubmit}
                  disabled={!isValidOffer || submitting || loading}
                  style={({ pressed }) => [
                    styles.actionButton,
                    {
                      backgroundColor: TEAL_BRAND,
                      opacity: !isValidOffer || submitting || loading ? 0.5 : pressed ? 0.88 : 1,
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
                      ? `Offer ${formatPrice(parsedAmount)}`
                      : 'Make an offer'}
                  </Text>
                </Pressable>
              </View>

              {/* Subtext: "25 offers left for today. Learn why." */}
              <View style={styles.limitRow}>
                <Text style={[styles.limitText, { color: isDark ? theme.mute : '#5A6566' }]}>
                  {offersLeftToday} offers left for today.{' '}
                </Text>
                <Pressable onPress={handleLearnWhy} hitSlop={6}>
                  <Text style={styles.learnWhyText}>Learn why.</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
      default: {
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 50,
  },
  closeText: {
    fontSize: 16,
    color: '#15191A',
  },
  headerTitle: {
    fontSize: 17,
    color: '#15191A',
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 50,
  },
  mainContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  itemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 16,
    color: '#15191A',
    marginBottom: 3,
  },
  itemPrice: {
    fontSize: 14,
    color: '#5A6566',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  presetCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTopText: {
    fontSize: 15,
    color: '#15191A',
    marginBottom: 2,
    textAlign: 'center',
  },
  cardBottomText: {
    fontSize: 12.5,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 20,
  },
  displayRow: {
    paddingVertical: 2,
  },
  amountInput: {
    fontSize: 24,
    color: '#15191A',
    padding: 0,
    margin: 0,
    height: 34,
  },
  underline: {
    height: 1.5,
    backgroundColor: '#6B7280',
    marginTop: 4,
    marginBottom: 6,
    width: '100%',
  },
  feeHelperText: {
    fontSize: 13,
    color: '#5A6566',
  },
  actionButtonContainer: {
    marginBottom: 12,
  },
  actionButton: {
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  limitText: {
    fontSize: 13,
    color: '#5A6566',
  },
  learnWhyText: {
    fontSize: 13,
    color: TEAL_BRAND,
    textDecorationLine: 'underline',
  },
});
