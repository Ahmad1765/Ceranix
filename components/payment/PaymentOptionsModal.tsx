import React, { useState } from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  StyleSheet,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';

export type PaymentMethodOption = 'card' | 'apple_pay' | 'cod';

export interface SelectedPaymentMethod {
  method: PaymentMethodOption;
  cardBrand?: string;
  cardLast4?: string;
  saveCard?: boolean;
}

interface PaymentOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMethod: PaymentMethodOption;
  onSelect: (selected: SelectedPaymentMethod) => void;
}

const TEAL = '#007782';

export function PaymentOptionsModal({
  visible,
  onClose,
  selectedMethod: initialSelected,
  onSelect,
}: PaymentOptionsModalProps) {
  const [selected, setSelected] = useState<PaymentMethodOption>(initialSelected || 'card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [showCardForm, setShowCardForm] = useState(false);

  const handleSelect = (method: PaymentMethodOption) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setSelected(method);
    if (method === 'card') {
      setShowCardForm(true);
    } else {
      setShowCardForm(false);
    }
  };

  const handleProceed = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    let brand = 'Visa';
    let last4 = '2907';

    if (cardNumber.trim().length >= 4) {
      const clean = cardNumber.replace(/\s+/g, '');
      last4 = clean.slice(-4);
      if (clean.startsWith('5')) brand = 'Mastercard';
      else if (clean.startsWith('3')) brand = 'Amex';
      else brand = 'Visa';
    }

    onSelect({
      method: selected,
      cardBrand: selected === 'card' ? brand : undefined,
      cardLast4: selected === 'card' ? last4 : undefined,
      saveCard: true,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Close payment options"
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.5 }]}
          >
            <Feather name="x" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Payment options</Text>
          <View style={styles.headerRightPlaceholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Option 1: Bank Card */}
          <Pressable
            onPress={() => handleSelect('card')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'card' }}
            style={({ pressed }) => [
              styles.optionCard,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.optionMainRow}>
              <View style={styles.iconContainer}>
                <Feather name="credit-card" size={22} color={colors.ink} />
              </View>
              <View style={styles.optionDetails}>
                <Text style={styles.optionTitle}>Bank card</Text>
                <Text style={styles.optionSubtitle}>
                  Ceranix never shares your payment information with the seller.
                </Text>

                {/* Card Brand Badges */}
                <View style={styles.cardBadgesRow}>
                  {/* Mastercard badge */}
                  <View style={styles.mcBadge}>
                    <View style={[styles.mcCircle, { backgroundColor: '#EB001B', zIndex: 1 }]} />
                    <View style={[styles.mcCircle, { backgroundColor: '#F79E1B', marginLeft: -8 }]} />
                  </View>
                  {/* Visa badge */}
                  <View style={styles.visaBadge}>
                    <Text style={styles.visaText}>VISA</Text>
                  </View>
                  {/* Amex / Generic badge */}
                  <View style={styles.genericCardBadge}>
                    <Text style={styles.genericCardText}>CARD</Text>
                  </View>
                </View>
              </View>

              {/* Radio Indicator */}
              <View style={[styles.radioOuter, selected === 'card' && styles.radioOuterSelected]}>
                {selected === 'card' && <View style={styles.radioInner} />}
              </View>
            </View>

            {/* Optional Expandable Card Entry Form */}
            {selected === 'card' && showCardForm && (
              <View style={styles.cardFormContainer}>
                <Text style={styles.inputLabel}>Cardholder Name</Text>
                <TextInput
                  value={cardName}
                  onChangeText={setCardName}
                  placeholder="e.g. Sam Lee"
                  placeholderTextColor="#9CA3AF"
                  style={styles.textInput}
                />

                <Text style={[styles.inputLabel, { marginTop: 10 }]}>Card Number</Text>
                <TextInput
                  value={cardNumber}
                  onChangeText={(val) => {
                    const clean = val.replace(/\D/g, '').slice(0, 16);
                    const formatted = clean.match(/.{1,4}/g)?.join(' ') || clean;
                    setCardNumber(formatted);
                  }}
                  keyboardType="number-pad"
                  placeholder="•••• •••• •••• 2907"
                  placeholderTextColor="#9CA3AF"
                  style={styles.textInput}
                />

                <View style={styles.formRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.inputLabel, { marginTop: 10 }]}>Expiry Date</Text>
                    <TextInput
                      value={cardExpiry}
                      onChangeText={(val) => {
                        const clean = val.replace(/\D/g, '').slice(0, 4);
                        if (clean.length >= 3) {
                          setCardExpiry(`${clean.slice(0, 2)}/${clean.slice(2)}`);
                        } else {
                          setCardExpiry(clean);
                        }
                      }}
                      keyboardType="number-pad"
                      placeholder="MM/YY"
                      placeholderTextColor="#9CA3AF"
                      style={styles.textInput}
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.inputLabel, { marginTop: 10 }]}>CVV / CVC</Text>
                    <TextInput
                      value={cardCvc}
                      onChangeText={(val) => setCardCvc(val.replace(/\D/g, '').slice(0, 4))}
                      keyboardType="number-pad"
                      secureTextEntry
                      placeholder="•••"
                      placeholderTextColor="#9CA3AF"
                      style={styles.textInput}
                    />
                  </View>
                </View>
              </View>
            )}
          </Pressable>

          <View style={styles.divider} />

          {/* Option 2: Apple Pay */}
          <Pressable
            onPress={() => handleSelect('apple_pay')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'apple_pay' }}
            style={({ pressed }) => [
              styles.optionCard,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.optionMainRow}>
              <View style={styles.applePayBadge}>
                <Ionicons name="logo-apple" size={15} color="#000000" style={{ marginRight: 2 }} />
                <Text style={styles.applePayText}>Pay</Text>
              </View>
              <View style={[styles.optionDetails, { marginLeft: 14 }]}>
                <Text style={styles.optionTitle}>Apple Pay</Text>
                <Text style={styles.optionSubtitle}>Instant checkout using your Apple Wallet.</Text>
              </View>

              {/* Radio Indicator */}
              <View style={[styles.radioOuter, selected === 'apple_pay' && styles.radioOuterSelected]}>
                {selected === 'apple_pay' && <View style={styles.radioInner} />}
              </View>
            </View>
          </Pressable>

          <View style={styles.divider} />

          {/* Option 3: Cash on Delivery (COD) */}
          <Pressable
            onPress={() => handleSelect('cod')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'cod' }}
            style={({ pressed }) => [
              styles.optionCard,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.optionMainRow}>
              <View style={styles.iconContainer}>
                <Feather name="package" size={20} color={colors.ink} />
              </View>
              <View style={styles.optionDetails}>
                <Text style={styles.optionTitle}>Cash on Delivery</Text>
                <Text style={styles.optionSubtitle}>
                  Pay with cash when the parcel is delivered to your door.
                </Text>
              </View>

              {/* Radio Indicator */}
              <View style={[styles.radioOuter, selected === 'cod' && styles.radioOuterSelected]}>
                {selected === 'cod' && <View style={styles.radioInner} />}
              </View>
            </View>
          </Pressable>
        </ScrollView>

        {/* Bottom Proceed Action Button */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleProceed}
            style={({ pressed }) => [
              styles.proceedButton,
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text style={styles.proceedButtonText}>Proceed</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    fontFamily: 'Inter_700Bold',
  },
  headerRightPlaceholder: {
    width: 36,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  optionCard: {
    paddingVertical: 14,
  },
  optionMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 38,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionDetails: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    fontFamily: 'Inter_700Bold',
    marginBottom: 3,
  },
  optionSubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  cardBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  mcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
  },
  mcCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  visaBadge: {
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visaText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1A1F71',
    letterSpacing: 0.5,
    fontStyle: 'italic',
  },
  genericCardBadge: {
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 3,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genericCardText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4B5563',
    letterSpacing: 0.3,
  },
  applePayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#111111',
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    marginTop: 2,
  },
  applePayText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Inter_700Bold',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioOuterSelected: {
    borderColor: TEAL,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TEAL,
  },
  cardFormContainer: {
    marginTop: 14,
    marginLeft: 38,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    fontFamily: 'Inter_600SemiBold',
  },
  textInput: {
    height: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13.5,
    color: '#111111',
    fontFamily: 'Inter_500Medium',
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EBEBEB',
    marginVertical: 6,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 12 : 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#FFFFFF',
  },
  proceedButton: {
    height: 48,
    backgroundColor: TEAL,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
});
