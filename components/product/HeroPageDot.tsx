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
    // Inactive pages read as round 6px dots; the active page stretches into a
    // short pill. Standard carousel pagination, not a progress bar.
    const w = 6 + proximity * 12;
    const opacity = 0.45 + proximity * 0.55;
    return {
      width: w,
      backgroundColor: `rgba(255,255,255,${opacity})`,
    };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3 }, animStyle]} />;
}
