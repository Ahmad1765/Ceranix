import { useEffect } from 'react';
import { View, Pressable, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

type Props = {
  liked: boolean;
  onPress?: () => void;
  size?: number;
  color?: string;
  inactiveColor?: string;
  style?: ViewStyle;
};

const PARTICLES = 6;
const PARTICLE_DISTANCE = 26;

function Particle({
  index,
  liked,
  color,
}: {
  index: number;
  liked: boolean;
  color: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (liked) {
      progress.value = 0;
      progress.value = withDelay(
        index * 18,
        withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      progress.value = 0;
    }
  }, [liked, index, progress]);

  const angle = (index / PARTICLES) * Math.PI * 2 - Math.PI / 2;
  const dx = Math.cos(angle) * PARTICLE_DISTANCE;
  const dy = Math.sin(angle) * PARTICLE_DISTANCE;

  const animStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const opacity = t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9;
    return {
      opacity: liked ? opacity : 0,
      transform: [
        { translateX: dx * t },
        { translateY: dy * t },
        { scale: liked ? 1 - t * 0.4 : 0 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
}

export function LikeBurst({
  liked,
  onPress,
  size = 22,
  color = '#6C47FF',
  inactiveColor = '#0F0F0F',
  style,
}: Props) {
  const scale = useSharedValue(1);
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    if (liked) {
      scale.value = withSequence(
        withTiming(0.85, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(1.25, { damping: 6, stiffness: 220 }),
        withSpring(1, { damping: 12, stiffness: 200 }),
      );
      ringScale.value = 0;
      ringOpacity.value = 0.55;
      ringScale.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
      ringOpacity.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) });
    } else {
      scale.value = withSequence(
        withTiming(0.9, { duration: 80 }),
        withSpring(1, { damping: 14, stiffness: 200 }),
      );
    }
  }, [liked, scale, ringScale, ringOpacity]);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: 0.5 + ringScale.value * 1.4 }],
  }));

  const visual = (
    <View style={{ width: size + 24, height: size + 24, alignItems: 'center', justifyContent: 'center' }}>
      {/* Expanding ring on like */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: size + 8,
            height: size + 8,
            borderRadius: (size + 8) / 2,
            borderWidth: 2,
            borderColor: color,
          },
          ringStyle,
        ]}
      />

      {/* Particles */}
      {Array.from({ length: PARTICLES }).map((_, i) => (
        <Particle key={i} index={i} liked={liked} color={i % 2 === 0 ? color : '#6C47FF'} />
      ))}

      {/* Heart */}
      <Animated.View style={heartStyle}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={size}
          color={liked ? color : inactiveColor}
        />
      </Animated.View>
    </View>
  );

  if (!onPress) return <View style={style}>{visual}</View>;

  return (
    <Pressable onPress={onPress} hitSlop={8} style={style}>
      {visual}
    </Pressable>
  );
}
