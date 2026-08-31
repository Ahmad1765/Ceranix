// A small bottom sheet of actions, shared by the composer's "+" and the
// thread header's overflow button with swipe-down and scroll-down-to-dismiss.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
} from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { PressableScale } from '@/components/PressableScale';

export type ChatAction = {
  id: string;
  label: string;
  /** Optional second line — say what the action does when it isn't obvious. */
  hint?: string;
  icon: keyof typeof Feather.glyphMap;
  /** `primary` tints purple, `destructive` tints red. Everything else stays ink. */
  tone?: 'default' | 'primary' | 'destructive';
  onPress: () => void;
};

export function ChatActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: ChatAction[];
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [internalVisible, setInternalVisible] = useState(visible);
  const translateY = useRef(new Animated.Value(450)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 450,
        duration: 180,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => {
      setInternalVisible(false);
      isClosingRef.current = false;
      onClose();
    });
  }, [translateY, backdropOpacity, onClose]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setInternalVisible(true);
      translateY.setValue(450);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 22,
          mass: 0.8,
          stiffness: 260,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    } else if (internalVisible && !isClosingRef.current) {
      dismiss();
    }
  }, [visible, internalVisible, dismiss, translateY, backdropOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 4;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 50 || gestureState.vy > 0.3) {
          dismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 18,
            mass: 0.8,
            stiffness: 240,
            useNativeDriver: Platform.OS !== 'web',
          }).start();
        }
      },
    }),
  ).current;

  if (!internalVisible) return null;

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View
          style={styles.container}
          {...(Platform.OS === 'web'
            ? {
                onWheel: (e: any) => {
                  if (e?.deltaY > 10) {
                    dismiss();
                  }
                },
              }
            : null)}
        >
          {/* Backdrop Scrim */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: theme.overlay,
                opacity: backdropOpacity,
              },
            ]}
          >
            <Pressable
              accessibilityLabel="Close"
              onPress={dismiss}
              style={{ flex: 1 }}
            />
          </Animated.View>

          {/* Animated Draggable Bottom Sheet */}
          <Animated.View
            style={[
              styles.sheetWrapper,
              {
                transform: [{ translateY }],
              },
            ]}
            {...panResponder.panHandlers}
          >
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.panel }}>
              <View
                style={[
                  styles.sheetContent,
                  {
                    backgroundColor: theme.panel,
                    borderColor: theme.hairline,
                  },
                ]}
              >
                {/* Drag Indicator Handle */}
                <Pressable
                  onPress={dismiss}
                  accessibilityRole="button"
                  accessibilityLabel="Swipe or click to close"
                  style={styles.handleContainer}
                >
                  <View style={[styles.handleBar, { backgroundColor: theme.hairline }]} />
                </Pressable>

                {title && (
                  <Text
                    style={{
                      fontFamily: typography.family.sansBold,
                      fontSize: 12,
                      letterSpacing: 0.3,
                      color: theme.muteSoft,
                      paddingHorizontal: 20,
                      marginBottom: 6,
                    }}
                  >
                    {title}
                  </Text>
                )}

                {actions.map((a) => (
                  <PressableScale
                    key={a.id}
                    scaleTo={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                    onPress={() => {
                      dismiss();
                      a.onPress();
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                    }}
                  >
                    <Feather
                      name={a.icon}
                      size={19}
                      color={
                        a.tone === 'destructive'
                          ? '#DC2626'
                          : a.tone === 'primary'
                          ? theme.primary
                          : theme.ink
                      }
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: typography.family.sansSemibold,
                          fontSize: 15,
                          color: a.tone === 'destructive' ? '#DC2626' : theme.ink,
                        }}
                      >
                        {a.label}
                      </Text>
                      {a.hint && (
                        <Text
                          style={{
                            fontFamily: typography.family.sans,
                            fontSize: 12,
                            color: theme.muteSoft,
                            marginTop: 1,
                          }}
                        >
                          {a.hint}
                        </Text>
                      )}
                    </View>
                  </PressableScale>
                ))}
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrapper: {
    width: '100%',
    zIndex: 10,
  },
  sheetContent: {
    borderTopLeftRadius: radii['3xl'],
    borderTopRightRadius: radii['3xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
      default: {
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  handleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    cursor: 'pointer' as any,
  },
  handleBar: {
    width: 42,
    height: 5,
    borderRadius: 2.5,
  },
});
