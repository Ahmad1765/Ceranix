// The message composer: attach button, growing input, send.
//
// The send button cross-fades between its idle and armed states over 160ms
// rather than snapping — it's the one control on this screen that changes
// appearance while you're looking straight at it, so the change should read as
// the button waking up, not as a repaint.

import { useEffect } from 'react';
import { View, Platform } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { Feather, Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { colors, radii, type as typography } from '@/lib/theme';

const BUTTON = 38;

export function Composer({
  value,
  onChangeText,
  onSend,
  onPlus,
  placeholder = 'Write a message…',
  disabledReason,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onPlus: () => void;
  placeholder?: string;
  /** When set, the composer is replaced by this line — e.g. listing removed. */
  disabledReason?: string | null;
}) {
  // Sends are optimistic: the message appears in the thread immediately and
  // reports its own delivery state there, so the button just disarms.
  const armed = value.trim().length > 0;
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(armed ? 1 : 0, { duration: 160, easing: Easing.out(Easing.quad) });
  }, [armed, t]);

  const sendStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [colors.panel, colors.primary]),
  }));
  const idleIcon = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  const armedIcon = useAnimatedStyle(() => ({ opacity: t.value }));

  if (disabledReason) {
    return (
      <View style={{ paddingHorizontal: 16, paddingVertical: 18, alignItems: 'center' }}>
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 12.5,
            color: colors.muteSoft,
            textAlign: 'center',
          }}
        >
          {disabledReason}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 8,
        backgroundColor: colors.white,
      }}
    >
      <PressableScale
        onPress={onPlus}
        accessibilityLabel="More actions"
        style={{
          width: BUTTON,
          height: BUTTON,
          borderRadius: BUTTON / 2,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="plus" size={20} color={colors.white} />
      </PressableScale>

      <View
        style={{
          flex: 1,
          minHeight: BUTTON,
          maxHeight: 120,
          backgroundColor: colors.panel,
          borderRadius: radii['2xl'],
          paddingHorizontal: 14,
          paddingVertical: 9,
          justifyContent: 'center',
        }}
      >
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={colors.muteSoft}
          value={value}
          onChangeText={onChangeText}
          multiline
          accessibilityLabel="Message"
          // Enter sends on web, where a hardware keyboard is the norm and a
          // newline is the rarer intent. Shift+Enter still breaks the line.
          onKeyPress={
            Platform.OS === 'web'
              ? (e: any) => {
                  if (e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
                    e.preventDefault?.();
                    if (armed) onSend();
                  }
                }
              : undefined
          }
          style={
            {
              fontFamily: typography.family.sans,
              fontSize: 15,
              lineHeight: 20,
              color: colors.ink,
              padding: 0,
              maxHeight: 102,
              // RN-Web: kill the browser's default input focus ring.
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any
          }
        />
      </View>

      <PressableScale
        onPress={onSend}
        disabled={!armed}
        accessibilityLabel="Send message"
        style={[
          {
            width: BUTTON,
            height: BUTTON,
            borderRadius: BUTTON / 2,
            alignItems: 'center',
            justifyContent: 'center',
          },
          sendStyle,
        ]}
      >
        <Animated.View style={[{ position: 'absolute' }, idleIcon]}>
          <Ionicons name="arrow-up" size={20} color={colors.muteSoft} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute' }, armedIcon]}>
          <Ionicons name="arrow-up" size={20} color={colors.white} />
        </Animated.View>
      </PressableScale>
    </View>
  );
}
