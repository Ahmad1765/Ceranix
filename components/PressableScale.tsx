import { forwardRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type Props = PressableProps & {
  scaleTo?: number;
  children: React.ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PressableScale = forwardRef<View, Props>(function PressableScale(
  { scaleTo = 0.97, onPressIn, onPressOut, children, style, ...rest },
  ref,
) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      ref={ref as any}
      {...rest}
      onPressIn={(e) => {
        scale.value = withTiming(scaleTo, { duration: 90, easing: Easing.out(Easing.cubic) });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 280, mass: 0.6 });
        onPressOut?.(e);
      }}
      style={[animStyle, style] as any}
    >
      {children}
    </AnimatedPressable>
  );
});
