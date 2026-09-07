import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { safeBack } from '@/lib/nav';
import { ActivityFeed } from '@/components/activity';

/**
 * Standalone Activity / Notifications screen.
 *
 * Pushed directly from the Home screen's top-right notification bell icon
 * and deep links.
 */
export default function NewsScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
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
          borderBottomColor: theme.hairline,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="chevron-left" size={24} color={theme.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink }}>Activity</Text>
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
          <Feather name="check-square" size={18} color={theme.ink} />
        </Pressable>
      </View>

      <ActivityFeed />
    </SafeAreaView>
  );
}
