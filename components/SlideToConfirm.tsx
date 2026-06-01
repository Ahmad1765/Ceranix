import { useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';

type Props = {
  label?: string;
  loadingLabel?: string;
  doneLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
};

const TRACK_HEIGHT = 64;
const THUMB_SIZE = 48;
const PADDING = 8;

function tapMedium() {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function tapLight() {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function SlideToConfirm({
  label = 'Slide to pay',
  loadingLabel = 'Processing…',
  doneLabel = 'Done',
  loading = false,
  onConfirm,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const confirmedRef = useRef(false);

  const maxTravel = Math.max(0, trackWidth - THUMB_SIZE - PADDING * 2);
  const threshold = maxTravel * 0.85;

  const fireConfirm = () => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    tapMedium();
    onConfirm();
  };

  const resetThumb = () => {
    confirmedRef.current = false;
  };

  const pan = Gesture.Pan()
    .enabled(!loading)
    .activeOffsetX([-8, 8])
    .onBegin(() => {
      if (Platform.OS === 'ios') runOnJS(tapLight)();
    })
    .onUpdate((e) => {
      if (loading || maxTravel <= 0) return;
      const next = Math.min(Math.max(e.translationX, 0), maxTravel);
      translateX.value = next;
    })
    .onEnd(() => {
      if (loading || maxTravel <= 0) return;
      if (translateX.value >= threshold) {
        translateX.value = withTiming(maxTravel, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
        });
        runOnJS(fireConfirm)();
      } else {
        translateX.value = withTiming(0, {
          duration: 260,
          easing: Easing.out(Easing.exp),
        });
      }
    });

  // External reset: if the parent flips `loading` back to false without the
  // confirm having actually completed (e.g. a thrown error), slide back.
  if (!loading && confirmedRef.current && translateX.value === maxTravel) {
    // nothing — the parent is responsible for unmounting on success
  }

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const labelStyle = useAnimatedStyle(() => {
    const progress = maxTravel > 0 ? translateX.value / maxTravel : 0;
    return { opacity: 1 - progress * 1.4 };
  });

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value + THUMB_SIZE + PADDING,
  }));

  return (
    <GestureHandlerRootView>
      <View
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        style={{
          height: TRACK_HEIGHT,
          borderRadius: 999,
          backgroundColor: colors.primary,
          paddingHorizontal: PADDING,
          flexDirection: 'row',
          alignItems: 'center',
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 6,
        }}
      >
        {/* Fill — gives a satisfying "filling up" feedback as you drag */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(255,255,255,0.14)',
            },
            fillStyle,
          ]}
        />

        {/* Label */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              alignItems: 'center',
              justifyContent: 'center',
            },
            labelStyle,
          ]}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '900',
              color: colors.white,
              letterSpacing: 0.4,
            }}
          >
            {loading ? loadingLabel : label}
          </Text>
        </Animated.View>

        {/* Subtle chevrons hinting motion */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 26,
            top: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Feather name="chevrons-right" size={18} color="rgba(255,255,255,0.45)" />
        </View>

        {/* Thumb — only this captures gestures */}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: THUMB_SIZE / 2,
                backgroundColor: colors.white,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              },
              thumbStyle,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather name="arrow-right" size={20} color={colors.primary} />
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}
