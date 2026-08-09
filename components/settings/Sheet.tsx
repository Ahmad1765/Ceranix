// Bottom-sheet shell and form primitives shared by the four settings sheets.
//
// SheetLabel, SheetChoice and SheetDestructive are new: each one replaces a
// block that had been pasted into two to four of those sheets with only the
// text changed. Their styling is reproduced exactly, so this is a relocation,
// not a restyle.
import { useState } from 'react';
import {
  View,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors } from '@/lib/theme';
import { tap } from '@/lib/haptics';

export function SheetModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(15,15,15,0.55)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 12,
              paddingHorizontal: 20,
              paddingBottom: Platform.OS === 'ios' ? 32 : 20,
              maxHeight: '88%',
            }}
          >
            {/* Handle */}
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.hairline,
                marginBottom: 12,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, letterSpacing: -0.6 }}>
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: 'white',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.hairline,
                }}
              >
                <Feather name="x" size={16} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/**
 * The uppercase micro-label above a field or a choice group.
 *
 * Was pasted in four places: SheetField's own label, the payout "Type" heading,
 * the verification "Document type" heading, and the account section's "Email".
 * `tone` reproduces SheetField's focus/error colouring; the standalone headings
 * always used the muted tone.
 */
export function SheetLabel({
  children,
  tone = 'mute',
  style,
}: {
  children: React.ReactNode;
  tone?: 'mute' | 'focus' | 'error';
  style?: { marginBottom?: number; marginLeft?: number };
}) {
  const color =
    tone === 'error' ? colors.danger : tone === 'focus' ? colors.ink : colors.smoke;
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

export function SheetField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address';
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.ink : colors.hairline;
  return (
    <View style={{ marginBottom: 12 }}>
      <SheetLabel
        tone={error ? 'error' : focused ? 'focus' : 'mute'}
        style={{ marginBottom: 6, marginLeft: 4 }}
      >
        {label}
      </SheetLabel>
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor,
          paddingHorizontal: 14,
          minHeight: 48,
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor="rgba(15,15,15,0.55)"
          keyboardType={keyboardType}
          accessibilityLabel={label}
          style={{ fontSize: 15, color: colors.ink, padding: 0 }}
        />
      </View>
      {error && (
        <Text
          style={{
            fontSize: 11,
            color: colors.danger,
            marginTop: 4,
            marginLeft: 4,
            fontWeight: '600',
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

/**
 * A single-select group of options.
 *
 * Replaces three hand-rolled copies — the bundle percentages, the payout
 * bank/wallet segment, and the verification document types — which differed
 * only in radius and whether the options shared the row width.
 *
 *  - `pill`  : content-width, fully rounded (bundle percentages, document types)
 *  - `block` : equal-width, 14px radius  (payout type segmented control)
 */
export function SheetChoice<T extends string | number>({
  options,
  value,
  onChange,
  renderLabel,
  shape = 'pill',
  style,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  renderLabel: (option: T) => string;
  shape?: 'pill' | 'block';
  style?: { marginBottom?: number };
}) {
  const block = shape === 'block';
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: block ? 'nowrap' : 'wrap',
        gap: 8,
        ...style,
      }}
    >
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={String(option)}
            onPress={() => {
              tap('light');
              onChange(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              flex: block ? 1 : undefined,
              alignItems: block ? 'center' : undefined,
              paddingHorizontal: block ? 0 : 16,
              paddingVertical: block ? 12 : 12,
              borderRadius: block ? 14 : 999,
              backgroundColor: active ? colors.ink : 'white',
              borderWidth: 1.5,
              borderColor: active ? colors.ink : colors.hairline,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontSize: block ? 13 : 14,
                fontWeight: '800',
                color: active ? 'white' : colors.ink,
              }}
            >
              {renderLabel(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SheetPrimary({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => ({
        height: 54,
        borderRadius: 16,
        backgroundColor: disabled ? colors.ink : colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * The "Remove …" footer link under a sheet's primary button. Was byte-identical
 * in the address and payout sheets, differing only in its label.
 */
export function SheetDestructive({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}
    >
      <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
