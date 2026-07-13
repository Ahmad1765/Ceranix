// Reusable "Shop and sell safely" trust banner. One surface, used on the
// product page, checkout, offer sheet, sell flow, and chat so buyer/seller
// protection reads identically everywhere. Palette-compliant: neutral panel
// with a single purple accent (icon + link), no off-brand colours.
import { View, Text, Alert, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { colors, radii, type as typography } from '@/lib/theme';

type Props = {
  /** Override the wrapper style (e.g. drop the panel background on a card). */
  style?: StyleProp<ViewStyle>;
  /** Custom link handler. Defaults to an in-app coverage explainer. */
  onLinkPress?: () => void;
  /** Hide the soft panel background and render the row bare. */
  bare?: boolean;
};

const DEFAULT_BODY =
  'Every purchase is covered by our refund policy, secure payments, and support.';

function explainCoverage() {
  Alert.alert(
    "How you're covered",
    'Refund policy — If an item never arrives or isn’t as described, you’re eligible for a full refund.\n\n' +
      'Secure payments — Card details are handled by our payment provider and are never stored on your device.\n\n' +
      'Support — Our team steps in to help resolve any issue between buyer and seller.',
  );
}

export function SafetyBanner({ style, onLinkPress, bare = false }: Props) {
  const onLink = () => {
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    (onLinkPress ?? explainCoverage)();
  };

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 14,
          padding: bare ? 0 : 16,
          borderRadius: radii.xl,
          backgroundColor: bare ? 'transparent' : colors.panel,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.primarySofter,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: typography.size.lg,
            color: colors.ink,
            marginBottom: 3,
            letterSpacing: -0.2,
          }}
        >
          Shop and sell safely
        </Text>
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 13.5,
            lineHeight: 19,
            color: colors.mute,
          }}
        >
          {DEFAULT_BODY}{' '}
          <Text
            onPress={onLink}
            accessibilityRole="link"
            accessibilityLabel="How you're covered"
            style={{ color: colors.primary, fontFamily: typography.family.sansSemibold }}
          >
            How you&apos;re covered
          </Text>
        </Text>
      </View>
    </View>
  );
}
