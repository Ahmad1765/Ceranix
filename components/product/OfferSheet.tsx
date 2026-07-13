// Bottom-sheet "price suggestion" surface for the product page. Replaces the
// old flow that jumped straight into a chat thread — the buyer now proposes a
// number here, and only on submit do we hand off to /conversation/new with the
// amount pre-filled (same backend path the bundle offer uses).
//
// Slides up from the bottom. Mounting is cheap; the sheet only does work while
// `visible` is true.

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IS_IOS,
  SCREEN_HEIGHT,
  tap,
  BRAND_PURPLE,
  BRAND_PURPLE_SOFT,
  BRAND_INK,
} from './shared';
import { SafetyBanner } from '@/components/SafetyBanner';

// Discount presets the buyer can tap to pre-fill a sensible offer instead of
// typing from scratch. Ordered gentlest-first.
const QUICK_OFFERS = [0.1, 0.15, 0.2] as const;

function roundOffer(n: number) {
  // Nudge to a whole dollar — cleaner than "127.5" and reads like a real offer.
  return Math.max(1, Math.round(n));
}

export function OfferSheet({
  visible,
  askingPrice,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  askingPrice: number;
  onClose: () => void;
  // Fires with the chosen amount (whole units) once the buyer commits.
  onSubmit: (amount: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');

  // Drag-to-dismiss offset. Reset to resting position each time the sheet
  // opens; cleared field on close.
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) translateY.value = 0;
    else setAmount('');
  }, [visible, translateY]);

  // Downward pan on the sheet. `activeOffsetY(12)` means a tap or a small
  // wobble never hijacks the gesture — only a deliberate drag down engages,
  // so the input and buttons stay tappable. Release past the threshold (or
  // with a flick) animates it off-screen and closes; otherwise it springs back.
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (translateY.value > 120 || e.velocityY > 800) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 220 }, (done) => {
          if (done) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const parsed = useMemo(() => {
    const n = parseFloat(amount.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  const valid = parsed > 0;
  // Gentle nudge, never a hard block — sellers can still receive a high offer.
  const overAsking = parsed > askingPrice && askingPrice > 0;

  const applyQuick = (pct: number) => {
    tap('selection');
    setAmount(String(roundOffer(askingPrice * (1 - pct))));
  };

  const handleSubmit = () => {
    if (!valid) return;
    tap('medium');
    onSubmit(roundOffer(parsed));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap outside to dismiss */}
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end' }}>
        {IS_IOS ? (
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        )}

        <KeyboardAvoidingView behavior={IS_IOS ? 'padding' : undefined}>
          {/* Drag-to-dismiss surface. The inner Pressable swallows taps so a
              press inside the sheet doesn't fall through to the backdrop. */}
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                {
                  backgroundColor: 'white',
                  borderTopLeftRadius: 28,
                  borderTopRightRadius: 28,
                  paddingHorizontal: 24,
                  paddingTop: 10,
                  paddingBottom: (insets.bottom || 16) + 12,
                },
                sheetStyle,
              ]}
            >
              <Pressable onPress={() => {}}>
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

            {/* Icon badge */}
            <View
              style={{
                alignSelf: 'center',
                width: 62,
                height: 62,
                borderRadius: 20,
                backgroundColor: BRAND_PURPLE,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 26, fontFamily: 'Inter_700Bold', color: 'white' }}>
                $?
              </Text>
            </View>

            <Text
              style={{
                fontSize: 24,
                fontFamily: 'Inter_700Bold',
                color: BRAND_INK,
                textAlign: 'center',
                letterSpacing: -0.4,
                marginBottom: 22,
              }}
            >
              Send a price suggestion
            </Text>

            {/* Amount input */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'center',
                borderBottomWidth: 2,
                borderBottomColor: BRAND_PURPLE,
                paddingBottom: 8,
                marginBottom: 18,
              }}
            >
              <Text
                style={{
                  fontSize: 34,
                  fontFamily: 'Inter_700Bold',
                  color: 'rgba(15,15,15,0.28)',
                  marginRight: 4,
                  marginBottom: 4,
                }}
              >
                $
              </Text>
              <TextInput
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder={String(roundOffer(askingPrice))}
                placeholderTextColor="rgba(15,15,15,0.28)"
                autoFocus
                maxLength={7}
                style={{
                  minWidth: 90,
                  fontSize: 46,
                  fontFamily: 'Inter_700Bold',
                  color: BRAND_INK,
                  textAlign: 'center',
                  padding: 0,
                }}
              />
            </View>

            {/* Quick-offer chips — one-tap common discounts off the asking price */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 18,
              }}
            >
              {QUICK_OFFERS.map((pct) => {
                const value = roundOffer(askingPrice * (1 - pct));
                const active = parsed === value;
                return (
                  <Pressable
                    key={pct}
                    onPress={() => applyQuick(pct)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 999,
                      backgroundColor: active ? BRAND_PURPLE : BRAND_PURPLE_SOFT,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: 'Inter_700Bold',
                        color: active ? 'white' : BRAND_PURPLE,
                      }}
                    >
                      {Math.round(pct * 100)}% off · ${value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={{
                fontSize: 13,
                fontFamily: 'Inter_500Medium',
                color: overAsking ? BRAND_PURPLE : 'rgba(15,15,15,0.55)',
                textAlign: 'center',
                lineHeight: 19,
                marginBottom: 20,
                paddingHorizontal: 8,
              }}
            >
              {overAsking
                ? "That's above the asking price — you can offer less."
                : 'Enter the price you want to pay. Shipping and buyer protection are added at checkout.'}
            </Text>

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={!valid}
              accessibilityRole="button"
              accessibilityLabel="Send price suggestion"
              style={({ pressed }) => ({
                height: 54,
                borderRadius: 16,
                backgroundColor: BRAND_INK,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !valid ? 0.35 : pressed ? 0.9 : 1,
                transform: [{ scale: pressed && valid ? 0.99 : 1 }],
              })}
            >
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: 'white', letterSpacing: 0.2 }}>
                Send price suggestion
              </Text>
            </Pressable>

            <SafetyBanner bare style={{ marginTop: 16 }} />
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
