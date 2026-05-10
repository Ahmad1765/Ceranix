import { useEffect, useRef, useState } from 'react';
import { View, Text, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type Props = {
  value: number;
  style?: StyleProp<TextStyle>;
  height?: number;
};

/**
 * Slot-machine-style animated counter. When `value` changes, the new number
 * slides up from below and the previous slides up out of view.
 *
 * Implementation: keeps two numbers in state and animates a translateY
 * shared-value between them. After the animation lands, swaps the lower
 * slot to the new value and resets translateY to 0 instantly.
 */
export function AnimatedNumber({ value, style, height = 18 }: Props) {
  const [current, setCurrent] = useState(value);
  const [next, setNext] = useState(value);
  const translateY = useSharedValue(0);
  const lastValue = useRef(value);

  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    setNext(value);
    translateY.value = 0;
    translateY.value = withTiming(
      -height,
      { duration: 360, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          // Snap: current becomes next, reset translateY without animation
          translateY.value = 0;
        }
      },
    );
    // Update `current` after the slide finishes so React state matches.
    const t = setTimeout(() => setCurrent(value), 360);
    return () => clearTimeout(t);
  }, [value, height, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={animStyle}>
        <Text style={[{ height, lineHeight: height }, style]}>{current}</Text>
        <Text style={[{ height, lineHeight: height }, style]}>{next}</Text>
      </Animated.View>
    </View>
  );
}
