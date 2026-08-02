import { useEffect, useState } from 'react';
import { View, Animated, Easing, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { colors } from '@/lib/theme';

// Shown while the app boots (icon fonts + assets). On native the OS splash
// covers this window; on web there's no splash, so without it users stared at
// a blank white page until the bundle was ready. Deliberately uses the system
// font — Inter hasn't loaded yet at this point.

const BAR_WIDTH = 150;
const SEGMENT = 48;

export function Preloader() {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.cubic),
        // Native driver is unsupported on web; harmless to disable there.
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-SEGMENT, BAR_WIDTH],
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: -1.2, color: colors.ink }}>
          Carrinex
        </Text>
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.purple,
            marginLeft: 4,
          }}
        />
      </View>

      {/* Indeterminate progress — a purple segment sweeping a faint track. */}
      <View
        style={{
          marginTop: 24,
          width: BAR_WIDTH,
          height: 3,
          borderRadius: 3,
          backgroundColor: colors.purpleSoft,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            width: SEGMENT,
            height: 3,
            borderRadius: 3,
            backgroundColor: colors.purple,
            transform: [{ translateX }],
          }}
        />
      </View>
    </View>
  );
}
