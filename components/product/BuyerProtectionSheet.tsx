import { View, Pressable, Modal, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { priceBreakdown, formatPrice } from '@/lib/fees';
import { useTheme } from '@/context/ThemeContext';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { IS_IOS, tap, BRAND_PURPLE } from './shared';

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
  const { theme, isDark } = useTheme();
  const { item, protection, total } = priceBreakdown(itemPrice);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end' }}>
        {IS_IOS ? (
          <BlurView intensity={22} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        )}

        {/* Inner Pressable swallows taps so a press inside doesn't close. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTopWidth: 1,
            borderColor: theme.border,
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
              backgroundColor: theme.border,
              marginBottom: 20,
            }}
          />

          {/* Shield badge */}
          <View
            style={{
              alignSelf: 'center',
              marginBottom: 16,
            }}
          >
            <ShieldCheckIcon size={64} />
          </View>


          <Text
            style={{
              fontSize: 24,
              fontFamily: 'Inter_700Bold',
              color: theme.ink,
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
              color: theme.mute,
              textAlign: 'center',
              lineHeight: 21,
              marginBottom: 22,
              paddingHorizontal: 6,
            }}
          >
            {protection > 0
              ? 'Every order is covered for a small fee, so you can buy with confidence.'
              : 'Buyer protection is included on every order, so you can buy with confidence.'}
          </Text>

          {/* Breakdown card */}
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.panel,
              paddingHorizontal: 16,
              paddingVertical: 4,
              marginBottom: 20,
            }}
          >
            <BreakdownRow label="Item price" value={formatPrice(item)} />
            <View style={{ height: 1, backgroundColor: theme.border }} />
            <BreakdownRow
              label="Buyer Protection"
              value={protection > 0 ? formatPrice(protection) : 'Free'}
            />
            <View style={{ height: 1, backgroundColor: theme.border }} />
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
                    backgroundColor: theme.purpleSoft,
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
                    color: theme.mute,
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
              backgroundColor: theme.ink,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: theme.background, letterSpacing: 0.2 }}>
              Got it
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BreakdownRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  const { theme } = useTheme();
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
          color: emphasize ? theme.ink : theme.mute,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: emphasize ? 17 : 14,
          fontFamily: 'Inter_700Bold',
          color: theme.ink,
          letterSpacing: emphasize ? -0.3 : 0,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
