import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { View } from 'react-native';

const TAU = Math.PI * 2;

export function TabOrb() {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(t);
      t.value = 0;
    };
  }, [t]);

  // Outer halo — slow soft breath
  const halo = useAnimatedStyle(() => {
    'worklet';
    const v = t.value;
    const breath = Math.sin(v * TAU * 0.6);
    return {
      opacity: 0.10 + breath * 0.05,
      transform: [{ scale: 1 + breath * 0.08 }],
    };
  });

  // Mid body — medium breath, offset phase
  const body = useAnimatedStyle(() => {
    'worklet';
    const v = t.value;
    const breath = Math.sin(v * TAU * 1.0 + 1.2);
    return {
      opacity: 0.22 + breath * 0.06,
      transform: [{ scale: 1 + breath * 0.05 }],
    };
  });

  // Inner core — faster, brighter pulse
  const core = useAnimatedStyle(() => {
    'worklet';
    const v = t.value;
    const pulse = Math.sin(v * TAU * 1.6 + 0.4);
    return {
      opacity: 0.45 + pulse * 0.18,
      transform: [{ scale: 1 + pulse * 0.12 }],
    };
  });

  return (
    <View pointerEvents="none" className="absolute items-center justify-center w-10 h-10">
      <Animated.View
        style={[
          halo,
          {
            position: 'absolute',
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: '#9B7FFF',
            shadowColor: '#9B7FFF',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.7,
            shadowRadius: 18,
            elevation: 10,
          },
        ]}
      />
      <Animated.View
        style={[
          body,
          {
            position: 'absolute',
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#9B7FFF',
          },
        ]}
      />
      <Animated.View
        style={[
          core,
          {
            position: 'absolute',
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#CDBBFF',
            shadowColor: '#CDBBFF',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 8,
            elevation: 6,
          },
        ]}
      />
    </View>
  );
}
