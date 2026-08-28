// The message composer: attach button, growing input, send.
//
// The send button cross-fades between its idle and armed states over 160ms
// rather than snapping — it's the one control on this screen that changes
// appearance while you're looking straight at it, so the change should read as
// the button waking up, not as a repaint.
//
// The input is measured, not guessed. react-native-web renders a multiline
// TextInput as a <textarea>, which (a) ignores textAlignVertical — upstream
// closed that wontfix, a textarea just can't centre its own text — and (b)
// defaults to rows=2, so the pill rendered two lines tall with one line of text
// sitting at the top of it. Both go away once the input is exactly as tall as
// its content: one line of text is one line tall, and the wrapper's
// justifyContent:'center' then has something real to centre. Growth comes from
// the same measurement, capped at MAX_INPUT_HEIGHT before it starts scrolling.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Platform, type NativeSyntheticEvent, type TextInputContentSizeChangeEventData } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

const BUTTON = 38;
/** One line of text at the input's own lineHeight — the resting height. */
const MIN_INPUT_HEIGHT = 20;
/** Five lines. Past this the input stops growing and starts scrolling. */
const MAX_INPUT_HEIGHT = 100;
const INPUT_PAD_V = 9;

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
  const { theme } = useTheme();
  // Sends are optimistic: the message appears in the thread immediately and
  // reports its own delivery state there, so the button just disarms.
  const armed = value.trim().length > 0;
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(armed ? 1 : 0, { duration: 160, easing: Easing.out(Easing.quad) });
  }, [armed, t]);

  // ── Auto-sizing ────────────────────────────────────────────────────────
  // Native reports its own content size. Web has to be asked: collapse the
  // textarea to zero, read scrollHeight (which is then the content height, not
  // the box height), and write the clamped result back. Reading scrollHeight
  // without the collapse only ever grows — a textarea already 3 lines tall
  // reports 3 lines even when you delete back down to one.
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const webNode = useRef<HTMLTextAreaElement | null>(null);

  const measureWeb = useCallback(() => {
    const el = webNode.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT)}px`;
  }, []);

  // Runs on every value change, so a send that clears the input collapses it
  // back to one line — an onChange-only hook would leave it stuck open, since
  // clearing state isn't typing.
  useLayoutEffect(() => {
    if (Platform.OS === 'web') measureWeb();
  }, [value, measureWeb]);

  const onContentSize = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      if (Platform.OS === 'web') return; // web is driven by measureWeb
      const h = e.nativeEvent.contentSize.height;
      setHeight(Math.min(Math.max(h, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT));
    },
    [],
  );

  const sendStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [theme.panel, theme.purple]),
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
            color: theme.muteSoft,
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
        paddingTop: 14,
        paddingBottom: 8,
        backgroundColor: theme.surface,
      }}
    >
      <PressableScale
        onPress={onPlus}
        accessibilityLabel="More actions"
        style={{
          width: BUTTON,
          height: BUTTON,
          borderRadius: BUTTON / 2,
          backgroundColor: theme.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="plus" size={20} color={theme.background} />
      </PressableScale>

      <View
        style={{
          flex: 1,
          minHeight: BUTTON,
          maxHeight: MAX_INPUT_HEIGHT + INPUT_PAD_V * 2,
          backgroundColor: theme.panel,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radii['2xl'],
          paddingHorizontal: 14,
          paddingVertical: INPUT_PAD_V,
          justifyContent: 'center',
        }}
      >
        <TextInput
          // On web this ref is the <textarea> itself; `e.target` from the first
          // keystroke is the same node and backs it up if the ref never lands.
          ref={(node: any) => {
            if (Platform.OS === 'web') webNode.current = (node as HTMLTextAreaElement) ?? null;
          }}
          placeholder={placeholder}
          placeholderTextColor={theme.muteSoft}
          value={value}
          onChangeText={onChangeText}
          onChange={
            Platform.OS === 'web'
              ? (e: any) => {
                  webNode.current = e?.target ?? webNode.current;
                  measureWeb();
                }
              : undefined
          }
          onContentSizeChange={onContentSize}
          multiline
          // Without this the browser gives a textarea two rows by default, so
          // the pill opens a line taller than it should and never settles.
          {...(Platform.OS === 'web' ? { rows: 1 } : null)}
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
              lineHeight: MIN_INPUT_HEIGHT,
              color: theme.ink,
              padding: 0,
              // Web's height is owned by measureWeb via the DOM, so React must
              // not also write one here or the two fight every keystroke.
              ...(Platform.OS === 'web' ? null : { height }),
              // Android still top-aligns inside whatever box it's given.
              textAlignVertical: 'center' as const,
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
          <Ionicons name="arrow-up" size={20} color={theme.muteSoft} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute' }, armedIcon]}>
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </Animated.View>
      </PressableScale>
    </View>
  );
}
