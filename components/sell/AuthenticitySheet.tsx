import { useState, useEffect } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { BottomSheet } from './BottomSheet';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { isStrictTrademarkBrand, isHighValueDesigner } from '@/lib/taxonomy';
import type { Authenticity } from '@/types';
import * as Haptics from 'expo-haptics';

const DISPLAY_BOLD = typography.family.sansBold;

interface AuthenticityOption {
  value: Authenticity;
  label: string;
  badge?: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}

const AUTH_OPTIONS: AuthenticityOption[] = [
  {
    value: 'original',
    label: 'Original',
    badge: '100% Genuine',
    description: 'Item is an authentic, genuine product manufactured by the brand.',
    icon: 'check-circle',
  },
  {
    value: 'inspired',
    label: 'Master Copy / Inspired',
    badge: 'Alternative',
    description: 'Local artisan recreation, master copy, or inspired design alternative.',
    icon: 'copy',
  },
  {
    value: 'not_sure',
    label: 'Not Sure',
    badge: 'Unverified',
    description: 'Authenticity cannot be confirmed (e.g. received as a gift or second-hand).',
    icon: 'help-circle',
  },
];

export function AuthenticitySheet({
  visible,
  brandName,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  brandName?: string | null;
  value: Authenticity | null | undefined;
  onChange: (v: Authenticity) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<Authenticity | null | undefined>(value);
  const [luxuryWarning, setLuxuryWarning] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSelected(value);
      setLuxuryWarning(null);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTrademark = isStrictTrademarkBrand(brandName);
  const isDesigner = isHighValueDesigner(brandName);

  const handleSelectOption = (optValue: Authenticity) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    // Trademark policy guardrail: Apple Guideline 5.2.3 and Google Play Counterfeit Policy
    if (optValue === 'inspired' && isTrademark) {
      setLuxuryWarning(
        `Registered international luxury items (${brandName}) cannot be listed as "Inspired" under the brand's trademark name. To comply with platform policies, please select "Unbranded / Local Tailor" for inspired designs or verify authenticity as "Original".`,
      );
      return;
    }

    setLuxuryWarning(null);
    setSelected(optValue);
    onChange(optValue);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Item Authenticity" onClose={onClose}>
      {/* Brand Context Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          borderRadius: radii.xl,
          backgroundColor: theme.panel,
          borderWidth: 1,
          borderColor: theme.border,
          marginBottom: 16,
        }}
      >
        <ShieldCheckIcon size={24} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, fontFamily: DISPLAY_BOLD, color: theme.ink }}>
            Declaring authenticity for {brandName || 'this item'}
          </Text>
          <Text style={{ fontSize: 11.5, color: theme.mute, marginTop: 1 }}>
            Mandatory disclosure to ensure trust and transparency for buyers
          </Text>
        </View>
      </View>

      {/* Luxury Trademark Hard Guard Alert */}
      {luxuryWarning ? (
        <View
          style={{
            padding: 14,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: theme.danger ?? '#EF4444',
            backgroundColor: theme.surface,
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Feather name="alert-triangle" size={15} color={theme.danger ?? '#EF4444'} />
            <Text style={{ fontSize: 13, fontFamily: DISPLAY_BOLD, color: theme.danger ?? '#EF4444' }}>
              Trademark Policy Advisory
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.ink, lineHeight: 17 }}>
            {luxuryWarning}
          </Text>
        </View>
      ) : null}

      {/* Options List */}
      <View style={{ gap: 10, marginBottom: 12 }}>
        {AUTH_OPTIONS.map((opt) => {
          const isActive = (selected || value) === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => handleSelectOption(opt.value)}
              style={({ pressed }) => ({
                padding: 14,
                borderRadius: radii.xl,
                borderWidth: 1,
                borderColor: isActive ? theme.ink : theme.border,
                backgroundColor: isActive ? (theme.primarySoft ?? 'rgba(0,0,0,0.06)') : theme.panel,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name={opt.icon} size={15} color={isActive ? theme.ink : theme.mute} />
                  <Text style={{ fontSize: 14.5, fontFamily: DISPLAY_BOLD, color: theme.ink }}>
                    {opt.label}
                  </Text>
                </View>
                {isActive ? (
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: theme.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="check" size={13} color={theme.background} />
                  </View>
                ) : (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 10,
                      backgroundColor: theme.surface,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: typography.family.sansMedium, color: theme.mute }}>
                      {opt.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 12, color: theme.mute, lineHeight: 17, paddingLeft: 23 }}>
                {opt.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* High-value Designer Proof Notice */}
      {isDesigner && (
        <View
          style={{
            padding: 12,
            borderRadius: radii.lg,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 12, color: theme.mute, lineHeight: 17 }}>
            <Text style={{ fontFamily: DISPLAY_BOLD, color: theme.ink }}>Designer Note: </Text>
            For luxury brands, buyers verify authenticity via close-up photos of tags, serial codes, stitching, and dust bags.
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}
