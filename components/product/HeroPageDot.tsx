import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

// Animated pagination dot — grows + brightens as its page nears the viewport
// center. Shared by the hero carousel and the fullscreen image viewer.
export function HeroPageDot({
  index,
  offsetX,
  pageWidth,
}: {
  index: number;
  offsetX: SharedValue<number>;
  pageWidth: number;
}) {
  const animStyle = useAnimatedStyle(() => {
    const progress = offsetX.value / pageWidth;
    const dist = Math.min(1, Math.abs(progress - index));
    const proximity = 1 - dist;
    const w = 6 + proximity * 18;
    const opacity = 0.5 + proximity * 0.5;
    return {
      width: w,
      backgroundColor: `rgba(255,255,255,${opacity})`,
    };
  });
  return <Animated.View style={[{ height: 4, borderRadius: 2 }, animStyle]} />;
}
