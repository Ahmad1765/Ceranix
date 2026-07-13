// Buyer Protection breakdown — opens from the price row on the product page.
// Shows exactly how the total is built (item + protection) and what the fee
// buys, so the number the buyer sees is never a mystery. Read-only; the actual
// charge is computed server-side from the same lib/fees math.

import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { priceBreakdown, formatPrice } from '@/lib/fees';
import { IS_IOS, tap, BRAND_PURPLE, BRAND_PURPLE_SOFT, BRAND_INK, INK_700, HAIRLINE } from './shared';

const COVERAGE = [
  { icon: 'refresh-ccw' as const, text: 'A refund if your item never arrives or isn’t as described' },
  { icon: 'lock' as const, text: 'Secure payments, held until you get your order' },
  { icon: 'message-circle' as const, text: 'Dedicated support if anything goes wrong' },
];

export function BuyerProtectionSheet({
  visible,
  itemPrice,
  onClose,
}: {
  visible: boolean;
  itemPrice: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { item, protection, total } = priceBreakdown(itemPrice);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end' }}>
        {IS_IOS ? (
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        )}

        {/* Inner Pressable swallows taps so a press inside doesn't close. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: 'white',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 24,
            paddingTop: 10,
            paddingBottom: (insets.bottom || 16) + 12,
          }}
        >
          {/* Grab handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 5,
              borderRadius: 3,
              backgroundColor: 'rgba(15,15,15,0.14)',
              marginBottom: 20,
            }}
          />

          {/* Shield badge */}
          <View
            style={{
              alignSelf: 'center',
              width: 62,
              height: 62,
              borderRadius: 20,
              backgroundColor: BRAND_PURPLE_SOFT,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Feather name="shield" size={28} color={BRAND_PURPLE} />
          </View>

          <Text
            style={{
              fontSize: 24,
              fontFamily: 'Inter_700Bold',
              color: BRAND_INK,
              textAlign: 'center',
              letterSpacing: -0.4,
              marginBottom: 8,
            }}
          >
            Buyer Protection
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: 'Inter_400Regular',
              color: INK_700,
              textAlign: 'center',
              lineHeight: 21,
              marginBottom: 22,
              paddingHorizontal: 6,
            }}
          >
            Every order is covered for a small fee, so you can buy with confidence.
          </Text>

          {/* Breakdown card */}
          <View
            style={{
              borderRadius: 18,
              borderWidth: HAIRLINE,
              borderColor: 'rgba(15,15,15,0.10)',
              paddingHorizontal: 16,
              paddingVertical: 4,
              marginBottom: 20,
            }}
          >
            <BreakdownRow label="Item price" value={formatPrice(item)} />
            <View style={{ height: HAIRLINE, backgroundColor: 'rgba(15,15,15,0.06)' }} />
            <BreakdownRow label="Buyer Protection" value={formatPrice(protection)} />
            <View style={{ height: HAIRLINE, backgroundColor: 'rgba(15,15,15,0.06)' }} />
            <BreakdownRow label="Total" value={formatPrice(total)} emphasize />
          </View>

          {/* What it covers */}
          <View style={{ gap: 14, marginBottom: 24, paddingHorizontal: 2 }}>
            {COVERAGE.map((c) => (
              <View key={c.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    backgroundColor: BRAND_PURPLE_SOFT,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name={c.icon} size={15} color={BRAND_PURPLE} />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontFamily: 'Inter_500Medium',
                    color: INK_700,
                    lineHeight: 20,
                  }}
                >
                  {c.text}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => {
              tap('selection');
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            style={({ pressed }) => ({
              height: 54,
              borderRadius: 16,
              backgroundColor: BRAND_INK,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: 'white', letterSpacing: 0.2 }}>
              Got it
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BreakdownRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontSize: emphasize ? 15 : 14,
          fontFamily: emphasize ? 'Inter_700Bold' : 'Inter_500Medium',
          color: emphasize ? BRAND_INK : INK_700,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: emphasize ? 17 : 14,
          fontFamily: 'Inter_700Bold',
          color: BRAND_INK,
          letterSpacing: emphasize ? -0.3 : 0,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
