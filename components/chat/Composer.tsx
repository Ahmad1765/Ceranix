// The message composer: circular action button and floating pill input with send button.
//
// The input is measured, not guessed. react-native-web renders a multiline
// TextInput as a <textarea>, which (a) ignores textAlignVertical and (b)
// defaults to rows=2. Both go away once the input is exactly as tall as
// its content: one line of text is one line tall, and the wrapper's
// justifyContent:'center' then has something real to centre. Growth comes from
// the same measurement, capped at MAX_INPUT_HEIGHT before it starts scrolling.

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View, Platform, StyleSheet, type NativeSyntheticEvent, type TextInputContentSizeChangeEventData } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

const PLUS_BUTTON_SIZE = 40;
const SEND_BUTTON_SIZE = 32;
/** One line of text at the input's own lineHeight — the resting height. */
const MIN_INPUT_HEIGHT = 20;
/** Five lines. Past this the input stops growing and starts scrolling. */
const MAX_INPUT_HEIGHT = 100;

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
  const armed = value.trim().length > 0;

  // ── Auto-sizing ────────────────────────────────────────────────────────
  // Native reports its own content size. Web has to be asked: collapse the
  // textarea to zero, read scrollHeight (which is then the content height, not
  // the box height), and write the clamped result back.
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const webNode = useRef<HTMLTextAreaElement | null>(null);

  const measureWeb = useCallback(() => {
    const el = webNode.current;
    if (!el) return;
    const currentScrollTop = el.scrollTop;
    el.style.height = '0px';
    const contentH = el.scrollHeight;
    const clampedH = Math.min(Math.max(contentH, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
    el.style.height = `${clampedH}px`;
    el.scrollTop = currentScrollTop;
    setHeight(clampedH);
  }, []);

  useLayoutEffect(() => {
    if (Platform.OS === 'web') measureWeb();
  }, [value, measureWeb]);

  const onContentSize = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      if (Platform.OS === 'web') return;
      const h = e.nativeEvent.contentSize.height;
      setHeight(Math.min(Math.max(h, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT));
    },
    [],
  );

  const btnShadow = styles.shadow;

  if (disabledReason) {
    return (
      <View style={{ paddingHorizontal: 16, paddingVertical: 18, alignItems: 'center', backgroundColor: 'transparent' }}>
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
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 6,
        paddingBottom: 6,
        backgroundColor: 'transparent',
      }}
    >
      {/* Standalone Circular "+" Button */}
      <PressableScale
        onPress={onPlus}
        scaleTo={0.92}
        accessibilityLabel="More actions"
        style={[
          {
            width: PLUS_BUTTON_SIZE,
            height: PLUS_BUTTON_SIZE,
            borderRadius: PLUS_BUTTON_SIZE / 2,
            backgroundColor: theme.panel,
            borderWidth: 1,
            borderColor: theme.hairline,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 0,
          },
          btnShadow,
        ]}
      >
        <Feather name="plus" size={20} color={theme.ink} />
      </PressableScale>

      {/* Unified Capsule / Rounded Input Container */}
      <View
        style={[
          {
            flex: 1,
            minHeight: PLUS_BUTTON_SIZE,
            maxHeight: MAX_INPUT_HEIGHT + 16,
            backgroundColor: theme.panel,
            borderWidth: 1,
            borderColor: theme.hairline,
            borderRadius: 22,
            paddingLeft: 14,
            paddingRight: armed ? 4 : 14,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'flex-end',
          },
          btnShadow,
        ]}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingVertical: Platform.OS === 'web' ? 6 : 4,
            marginRight: armed ? 6 : 0,
          }}
        >
          <TextInput
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
            {...(Platform.OS === 'web' ? { rows: 1 } : null)}
            accessibilityLabel="Message"
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
                margin: 0,
                ...(Platform.OS === 'web'
                  ? {
                      overflowY: height >= MAX_INPUT_HEIGHT ? 'auto' : 'hidden',
                      scrollbarWidth: 'thin',
                      scrollbarColor: `${theme.muteSoft} transparent`,
                      resize: 'none',
                    }
                  : { height }),
                textAlignVertical: 'center' as const,
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any
            }
          />
        </View>

        {/* Send button with delightful spring popup animation */}
        {armed && (
          <Animated.View
            entering={ZoomIn.springify().damping(12).stiffness(240).mass(0.6)}
            exiting={ZoomOut.duration(120)}
            style={{ marginBottom: 0 }}
          >
            <PressableScale
              onPress={onSend}
              scaleTo={0.90}
              accessibilityLabel="Send message"
              style={{
                width: SEND_BUTTON_SIZE,
                height: SEND_BUTTON_SIZE,
                borderRadius: SEND_BUTTON_SIZE / 2,
                backgroundColor: theme.ink,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="arrow-up" size={18} color={theme.panel} />
            </PressableScale>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    // iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    // Android
    elevation: 2,
    // Web
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.06)',
      } as any,
    }),
  },
});
