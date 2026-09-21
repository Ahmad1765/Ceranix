import { memo, useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { radii } from '@/lib/theme';

export const NewsRowSkeleton = memo(function NewsRowSkeleton() {
  const { theme } = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.75,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
      }}
    >
      {/* Avatar circular placeholder */}
      <Animated.View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: theme.hairline,
          opacity: pulseAnim,
        }}
      />

      {/* Text lines */}
      <View style={{ flex: 1, gap: 8 }}>
        <Animated.View
          style={{
            height: 14,
            width: '80%',
            borderRadius: 4,
            backgroundColor: theme.hairline,
            opacity: pulseAnim,
          }}
        />
        <Animated.View
          style={{
            height: 11,
            width: '45%',
            borderRadius: 4,
            backgroundColor: theme.hairline,
            opacity: pulseAnim,
          }}
        />
      </View>

      {/* Thumbnail placeholder */}
      <Animated.View
        style={{
          width: 46,
          height: 46,
          borderRadius: radii.md,
          backgroundColor: theme.hairline,
          opacity: pulseAnim,
        }}
      />
    </View>
  );
});

export const NewsSkeletonList = memo(function NewsSkeletonList({ count = 4 }: { count?: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i}>
          <NewsRowSkeleton />
          {i < count - 1 && (
            <View style={{ height: 1, backgroundColor: theme.border, width: '100%' }} />
          )}
        </View>
      ))}
    </View>
  );
});
