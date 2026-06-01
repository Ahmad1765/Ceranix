import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

export function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <View style={{ aspectRatio: 1 / 1.33, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 6 }} />
      <View style={{ height: 11, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 4, marginTop: 8, width: '65%' }} />
      <View style={{ height: 11, backgroundColor: 'rgba(15,15,15,0.08)', borderRadius: 4, marginTop: 5, width: '45%' }} />
    </Animated.View>
  );
}
