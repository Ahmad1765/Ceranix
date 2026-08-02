import { useEffect, useState } from 'react';
import { View, Animated, Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

// JS-driven on web (no RCTAnimation native module), native-driven elsewhere.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function SkeletonCard() {
  const [opacity] = useState(() => new Animated.Value(0.4));
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Respect the OS "reduce motion" setting: hold a steady mid opacity instead
    // of pulsing, so the placeholder stays visible without animating.
    if (reduceMotion) {
      opacity.setValue(0.7);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity, reduceMotion]);

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <View style={{ aspectRatio: 1 / 1.33, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 6 }} />
      <View style={{ height: 11, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 4, marginTop: 8, width: '65%' }} />
      <View style={{ height: 11, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 4, marginTop: 5, width: '45%' }} />
    </Animated.View>
  );
}
