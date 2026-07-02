import { useEffect, useRef } from 'react';
import { View, Animated, Platform } from 'react-native';

// JS-driven on web (no RCTAnimation native module), native-driven elsewhere.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
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
  }, [opacity]);

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <View style={{ aspectRatio: 1 / 1.33, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 6 }} />
      <View style={{ height: 11, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 4, marginTop: 8, width: '65%' }} />
      <View style={{ height: 11, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 4, marginTop: 5, width: '45%' }} />
    </Animated.View>
  );
}
