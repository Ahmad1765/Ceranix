// The two non-message rows in a thread: the day divider and the safety notice
// that opens it.
//
// Both are deliberately typographic — no card, no panel, no icon. Anything
// that isn't a message should read as a caption printed on the page rather
// than as another object competing with the conversation.

import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { colors, type as typography } from '@/lib/theme';
import { dayLabel } from './format';

export function DateDivider({ iso }: { iso: string }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 4 }}>
      <Text
        style={{
          fontFamily: typography.family.sansBold,
          fontSize: 11,
          letterSpacing: 0.4,
          color: colors.muteSoft,
        }}
      >
        {dayLabel(iso)}
      </Text>
    </View>
  );
}

export function SafetyNote({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ paddingHorizontal: 36, paddingTop: 20, paddingBottom: 6 }}>
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 12,
          lineHeight: 17,
          color: colors.muteSoft,
          textAlign: 'center',
        }}
      >
        Keep payments and messages in the app — that&apos;s what Buyer Protection covers.{' '}
        <Text
          onPress={onPress}
          accessibilityRole="link"
          accessibilityLabel="How you're covered"
          style={{
            fontFamily: typography.family.sansSemibold,
            fontSize: 12,
            color: colors.primary,
          }}
        >
          How you&apos;re covered
        </Text>
      </Text>
    </View>
  );
}
