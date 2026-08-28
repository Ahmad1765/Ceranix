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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';

const COURIER_PRESETS = ['TCS', 'Leopards', 'Trax', 'M&P', 'PostEx', 'USPS', 'FedEx', 'Other'];

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
  const { theme } = useTheme();
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
      onRequestClose={saving ? undefined : onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.overlay,
          justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
          alignItems: 'center',
          paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
        }}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={saving ? undefined : onClose}
          accessibilityLabel="Dismiss"
        />

        <View
          style={[
            {
              width: '100%',
              maxWidth: 480,
              maxHeight: '85%',
              backgroundColor: theme.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderRadius: Platform.OS === 'web' ? 24 : 0,
              borderWidth: 1,
              borderColor: theme.border,
              paddingTop: 18,
              paddingHorizontal: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 10,
              overflow: 'hidden',
            },
            {
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  letterSpacing: -0.3,
                }}
              >
                Mark as shipped
              </Text>
              <Text
                style={{
                  fontSize: 12.5,
                  color: theme.mute,
                  fontFamily: typography.family.sans,
                  marginTop: 4,
                  lineHeight: 17,
                }}
              >
                Provide tracking details to keep the buyer updated on their parcel.
              </Text>
            </View>
            <Pressable
              disabled={saving}
              onPress={onClose}
              hitSlop={HIT_SLOP_8}
              style={({ pressed }) => [
                {
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 10,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Feather name="x" size={18} color={theme.ink} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
            {/* Quick Courier Select */}
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: '600',
                color: theme.mute,
                fontFamily: typography.family.sansSemibold,
                marginBottom: 8,
              }}
            >
              Select Courier
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {COURIER_PRESETS.map((c) => {
                const active = courier === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      tap('light');
                      setCourier(c);
                    }}
                    style={[
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 20,
                        backgroundColor: active ? theme.purpleSoft : theme.panel,
                        borderWidth: 1,
                        borderColor: active ? theme.purple : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: active ? '700' : '600',
                        color: active ? theme.purple : theme.mute,
                        fontFamily: active ? typography.family.sansBold : typography.family.sansSemibold,
                      }}
                    >
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
                  placeholderTextColor={theme.muteSoft}
                  style={{
                    height: 44,
                    backgroundColor: theme.panel,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sansMedium,
                  }}
                />
              </View>
            )}

            {/* Tracking Number Input */}
            <View style={{ marginTop: 8, marginBottom: 14 }}>
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '600',
                  color: theme.mute,
                  fontFamily: typography.family.sansSemibold,
                  marginBottom: 8,
                }}
              >
                Tracking / Consignment # (Optional)
              </Text>
              <TextInput
                value={trackingNumber}
                onChangeText={setTrackingNumber}
                placeholder="e.g. 7748920193"
                placeholderTextColor={theme.muteSoft}
                style={{
                  height: 44,
                  backgroundColor: theme.panel,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  fontSize: 14,
                  color: theme.ink,
                  fontFamily: typography.family.sansMedium,
                }}
              />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
            <Pressable
              disabled={saving}
              onPress={handleConfirm}
              style={({ pressed }) => [
                {
                  height: 48,
                  backgroundColor: theme.ink,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={theme.background} size="small" />
              ) : (
                <Text
                  style={{
                    fontSize: 14.5,
                    fontWeight: '700',
                    color: theme.background,
                    fontFamily: typography.family.sansBold,
                  }}
                >
                  Confirm Shipment
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
