import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { colors } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { safeBack } from '@/lib/nav';
import { ActivityFeed } from '@/components/activity';

/**
 * Standalone Activity screen.
 *
 * The primary way in is now the Inbox's "Activity" tab — this route stays for
 * the Discover save-search affordances that push straight here ("Saved — find
 * it under Activity") and for deep links. The body itself is shared with the
 * Inbox via <ActivityFeed>.
 */
export default function NewsScreen() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>Activity</Text>
        <Pressable
          disabled={true}
          accessibilityRole="button"
          accessibilityLabel="Mark all activity as read"
          accessibilityState={{ disabled: true }}
          hitSlop={HIT_SLOP_8}
          style={() => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.25, // Disabled appearance
          })}
        >
          <Feather name="check-square" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ActivityFeed />
    </SafeAreaView>
  );
}
