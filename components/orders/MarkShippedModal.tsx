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

const COURIER_PRESETS = ['TCS', 'Leopards', 'Trax', 'M&P', 'PostEx', 'USPS', 'FedEx', 'Other'];
const TEAL = '#007782';

interface MarkShippedModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmShipped: (courier: string, trackingNumber: string) => Promise<void>;
}

export function MarkShippedModal({
  visible,
  onClose,
  onConfirmShipped,
}: MarkShippedModalProps) {
  const insets = useSafeAreaInsets();
  const [courier, setCourier] = useState<string>(COURIER_PRESETS[0]);
  const [customCourier, setCustomCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setCourier(COURIER_PRESETS[0]);
      setCustomCourier('');
      setTrackingNumber('');
      setSaving(false);
    }
  }, [visible]);

  const handleConfirm = async () => {
    tap('medium');
    setSaving(true);
    try {
      const finalCourier = courier === 'Other' ? (customCourier.trim() || 'Other') : courier;
      await onConfirmShipped(finalCourier.trim() || 'Standard Delivery', trackingNumber.trim());
      onClose();
    } catch {
      // Handled cleanly; sheet stays open
    } finally {
      setSaving(false);
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
              <Text style={styles.title}>Mark as shipped</Text>
              <Text style={styles.subtitle}>
                Provide tracking details to keep the buyer updated on their parcel.
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Quick Courier Select */}
            <Text style={styles.label}>Select Courier</Text>
            <View style={styles.courierRow}>
              {COURIER_PRESETS.map((c) => {
                const active = courier === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      tap('light');
                      setCourier(c);
                    }}
                    style={[styles.courierPill, active && styles.courierPillActive]}
                  >
                    <Text style={[styles.courierPillText, active && styles.courierPillTextActive]}>
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Custom Courier if needed */}
            {courier === 'Other' && (
              <View style={{ marginBottom: 12 }}>
                <TextInput
                  value={customCourier}
                  onChangeText={setCustomCourier}
                  placeholder="Enter courier name"
                  placeholderTextColor="#9CA3AF"
                  style={styles.textInput}
                />
              </View>
            )}

            {/* Tracking Number Input */}
            <View style={{ marginTop: 8, marginBottom: 14 }}>
              <Text style={styles.label}>Tracking / Consignment # (Optional)</Text>
              <TextInput
                value={trackingNumber}
                onChangeText={setTrackingNumber}
                placeholder="e.g. 7748920193"
                placeholderTextColor="#9CA3AF"
                style={styles.textInput}
              />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <Pressable
              disabled={saving}
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.confirmBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Shipment</Text>
              )}
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
    maxHeight: '85%',
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
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#4B5563',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
  } as TextStyle,
  courierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  } as ViewStyle,
  courierPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  } as ViewStyle,
  courierPillActive: {
    backgroundColor: '#E6F5F6',
    borderColor: TEAL,
  },
  courierPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    fontFamily: 'Inter_600SemiBold',
  } as TextStyle,
  courierPillTextActive: {
    color: TEAL,
    fontWeight: '700',
  } as TextStyle,
  textInput: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111111',
    fontFamily: 'Inter_500Medium',
  } as TextStyle,
  actionsContainer: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  } as ViewStyle,
  confirmBtn: {
    height: 48,
    backgroundColor: '#111111',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  confirmBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
  } as TextStyle,
});
