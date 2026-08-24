import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { HIT_SLOP_8 } from '@/lib/responsive';

export const CANCELLATION_REASONS = [
  'Changed my mind',
  'Selected wrong delivery address',
  'Seller agreed to cancel',
  'Ordered by mistake / duplicate',
  'Taking too long to ship',
  'Other reason',
] as const;

export const SELLER_CANCELLATION_REASONS = [
  'Item damaged or unavailable',
  'Buyer requested cancellation',
  'Unable to ship in time',
  'Pricing error',
  'Other reason',
] as const;

interface CancelOrderModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmCancel: (reason: string) => Promise<void>;
  isSeller?: boolean;
}

export function CancelOrderModal({
  visible,
  onClose,
  onConfirmCancel,
  isSeller = false,
}: CancelOrderModalProps) {
  const insets = useSafeAreaInsets();
  const reasons = isSeller ? SELLER_CANCELLATION_REASONS : CANCELLATION_REASONS;
  const [selectedReason, setSelectedReason] = useState<string>(
    isSeller ? SELLER_CANCELLATION_REASONS[0] : CANCELLATION_REASONS[0],
  );
  const [customReason, setCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedReason(isSeller ? SELLER_CANCELLATION_REASONS[0] : CANCELLATION_REASONS[0]);
      setCustomReason('');
    }
  }, [visible, isSeller]);

  const handleConfirm = async () => {
    tap('medium');
    const finalReason =
      selectedReason === 'Other reason' && customReason.trim()
        ? customReason.trim()
        : selectedReason;

    setCancelling(true);
    try {
      await onConfirmCancel(finalReason);
      onClose();
    } catch {
      // Handled cleanly; toast shown by caller
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />

        <View
          style={[
            styles.sheetContainer,
            {
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{isSeller ? 'Cancel sale' : 'Cancel order'}</Text>
              <Text style={styles.subtitle}>
                {isSeller
                  ? 'The buyer will be notified and this listing will be unlocked.'
                  : 'Please select a reason. The item will be relisted and the seller will be notified.'}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={HIT_SLOP_8}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="x" size={18} color="#111111" />
            </Pressable>
          </View>

          {/* Reason Selection List */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {reasons.map((r) => {
              const active = selectedReason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    tap('light');
                    setSelectedReason(r);
                  }}
                  style={({ pressed }) => [
                    styles.reasonRow,
                    active && styles.reasonRowActive,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                    {active && <View style={styles.radioInner} />}
                  </View>
                  <Text style={[styles.reasonText, active && styles.reasonTextActive]}>{r}</Text>
                </Pressable>
              );
            })}

            {/* Optional Custom Input if 'Other' */}
            {selectedReason === 'Other reason' && (
              <View style={styles.customInputContainer}>
                <TextInput
                  value={customReason}
                  onChangeText={setCustomReason}
                  placeholder="Please specify why you are cancelling..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={2}
                  style={styles.customInput}
                />
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <Pressable
              disabled={cancelling}
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.confirmBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
              ]}
            >
              {cancelling ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {isSeller ? 'Confirm Cancellation' : 'Cancel Order'}
                </Text>
              )}
            </Pressable>

            <Pressable
              disabled={cancelling}
              onPress={onClose}
              style={({ pressed }) => [styles.keepBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.keepBtnText}>Keep order</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
  } as ViewStyle,
  sheetContainer: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderRadius: Platform.OS === 'web' ? 24 : 0,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingTop: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  } as ViewStyle,
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  } as TextStyle,
  subtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
    lineHeight: 17,
  } as TextStyle,
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  } as ViewStyle,
  scrollContent: {
    paddingBottom: 10,
  } as ViewStyle,
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  } as ViewStyle,
  reasonRowActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  } as ViewStyle,
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.8,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  } as ViewStyle,
  radioOuterActive: {
    borderColor: '#EF4444',
  } as ViewStyle,
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  } as ViewStyle,
  reasonText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#374151',
    fontFamily: 'Inter_500Medium',
  } as TextStyle,
  reasonTextActive: {
    fontWeight: '700',
    color: '#DC2626',
    fontFamily: 'Inter_700Bold',
  } as TextStyle,
  customInputContainer: {
    marginTop: 6,
    marginBottom: 10,
  } as ViewStyle,
  customInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 13.5,
    color: '#111111',
    fontFamily: 'Inter_400Regular',
    minHeight: 60,
    textAlignVertical: 'top',
  } as TextStyle,
  actionsContainer: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  } as ViewStyle,
  confirmBtn: {
    height: 48,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  } as ViewStyle,
  confirmBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
  } as TextStyle,
  keepBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  keepBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#6B7280',
    fontFamily: 'Inter_600SemiBold',
  } as TextStyle,
});
