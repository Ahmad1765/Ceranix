import { useEffect, useRef, useState } from 'react';
import { View, Platform, LayoutChangeEvent, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  useReducedMotion,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '../lib/theme';

// Clean Instagram-style dock: white pill, icon-only, a single soft-purple disc
// that slides behind the active tab. Palette-locked (purple accent, ink icons,
// white surface). No labels, no ghost word — just a smooth, quiet bar.
const ACCENT = colors.primary; // #6C47FF
const INACTIVE = colors.ink; // near-black line icons, Instagram-clean
const DISC_FILL = colors.primarySofter; // purple @18%

const BAR_HEIGHT = 62;
const ICON = 26;
const DISC = 46; // sliding highlight diameter
// Snappy, premium settle for the slide + morph.
const SLIDE = { damping: 18, stiffness: 260, mass: 0.9 } as const;
const POP = { damping: 12, stiffness: 220, mass: 0.7 } as const;

const ICONS: Record<
  string,
  { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }
> = {
  index: { outline: 'home-outline', filled: 'home' },
  feed: { outline: 'grid-outline', filled: 'grid' },
  discover: { outline: 'search-outline', filled: 'search' },
  wardrobe: { outline: 'shirt-outline', filled: 'shirt' },
  upload: { outline: 'add-circle-outline', filled: 'add-circle' },
  profile: { outline: 'person-outline', filled: 'person' },
};

type ItemLayout = { x: number; width: number };

export function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const routes = state.routes.filter(
    (r) => StyleSheet.flatten(descriptors[r.key].options.tabBarItemStyle)?.display !== 'none',
  );
  const activeKey = state.routes[state.index].key;
  const activePos = routes.findIndex((r) => r.key === activeKey);

  const [layouts, setLayouts] = useState<Record<number, ItemLayout>>({});
  const [previewPos, setPreviewPos] = useState<number | null>(null);

  // Refs so gesture callbacks (runOnJS) always read fresh values.
  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;
  const activePosRef = useRef(activePos);
  activePosRef.current = activePos;
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const draggingRef = useRef(false);
  const previewRef = useRef<number | null>(null);
  const committedRef = useRef(false);

  // Disc tracks the CENTER of the active item; translateX is derived below.
  const discX = useSharedValue(0);
  const pressV = useSharedValue(1); // disc squish on touch
  const mount = useSharedValue(0); // entrance
  const didInit = useRef(false);

  useEffect(() => {
    mount.value = reduced ? 1 : withDelay(60, withSpring(1, { damping: 16, stiffness: 150 }));
  }, [mount, reduced]);

  // Keep the disc on the real active tab whenever selection changes externally.
  useEffect(() => {
    const l = layouts[activePos];
    if (!l) return;
    const cx = l.x + l.width / 2 - DISC / 2;
    if (!didInit.current || reduced) {
      discX.value = cx;
      didInit.current = true;
    } else if (!draggingRef.current) {
      discX.value = withSpring(cx, SLIDE);
    }
  }, [activePos, layouts, reduced, discX]);

  // ---- helpers (JS thread) ----
  const itemAtX = (x: number) => {
    const ls = layoutsRef.current;
    const n = routesRef.current.length;
    for (let i = 0; i < n; i++) {
      const l = ls[i];
      if (l && x >= l.x && x <= l.x + l.width) return i;
    }
    if (ls[0] && x < ls[0].x) return 0;
    return n - 1;
  };

  const moveTo = (pos: number, animate = true) => {
    const l = layoutsRef.current[pos];
    if (!l) return;
    const cx = l.x + l.width / 2 - DISC / 2;
    discX.value = animate && !reduced ? withSpring(cx, SLIDE) : cx;
  };

  const select = (pos: number) => {
    const route = routesRef.current[pos];
    if (!route) return;
    const focused = pos === activePosRef.current;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate(route.name);
    }
    setPreviewPos(null);
  };

  // ---- gesture callbacks ----
  const onBegin = (x: number) => {
    committedRef.current = false;
    pressV.value = withTiming(0.9, { duration: 110 });
    moveTo(itemAtX(x));
  };
  const onDragStart = () => {
    draggingRef.current = true;
    previewRef.current = null;
  };
  const onDragMove = (x: number) => {
    if (!draggingRef.current) return;
    const pos = itemAtX(x);
    if (pos !== previewRef.current) {
      previewRef.current = pos;
      if (Platform.OS !== 'web') Haptics.selectionAsync();
      moveTo(pos);
      setPreviewPos(pos);
    }
  };
  const onDragEnd = (x: number) => {
    const pos = previewRef.current ?? itemAtX(x);
    committedRef.current = true;
    select(pos);
  };
  const onTap = (x: number) => {
    committedRef.current = true;
    select(itemAtX(x));
  };
  const onFinalize = () => {
    pressV.value = withSpring(1, POP);
    draggingRef.current = false;
    previewRef.current = null;
    if (!committedRef.current) {
      setPreviewPos(null);
      moveTo(activePosRef.current);
    }
  };

  // Drag engages after a few px of travel; a quick stationary touch falls
  // through to the Tap gesture and selects.
  const pan = Gesture.Pan()
    .minDistance(6)
    .onBegin((e) => runOnJS(onBegin)(e.x))
    .onStart(() => runOnJS(onDragStart)())
    .onUpdate((e) => runOnJS(onDragMove)(e.x))
    .onEnd((e) => runOnJS(onDragEnd)(e.x))
    .onFinalize(() => runOnJS(onFinalize)());

  const tap = Gesture.Tap()
    .maxDistance(14)
    .onEnd((e) => runOnJS(onTap)(e.x));

  const gesture = Gesture.Race(pan, tap);

  const discStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateX: discX.value }, { scale: pressV.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 20 }],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 14) : 22,
        },
        barStyle,
      ]}
    >
      <GestureDetector gesture={gesture}>
        <View
          nativeID="tab-dock"
          style={{
            flexDirection: 'row',
            height: BAR_HEIGHT,
            borderRadius: BAR_HEIGHT / 2,
            borderCurve: 'continuous',
            paddingHorizontal: 6,
            backgroundColor: 'rgba(255,255,255,0.86)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.7)',
            boxShadow:
              '0px 2px 6px rgba(0,0,0,0.05), 0px 14px 30px rgba(0,0,0,0.12)',
            elevation: 16,
          }}
        >
          {/* Frosted glass fill */}
          <BlurView
            tint="light"
            intensity={Platform.OS === 'android' ? 28 : 44}
            experimentalBlurMethod="dimezisBlurView"
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: BAR_HEIGHT / 2,
              borderCurve: 'continuous',
              overflow: 'hidden',
            }}
          />

          {/* Sliding highlight disc */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: (BAR_HEIGHT - DISC) / 2,
                left: 0,
                width: DISC,
                height: DISC,
                borderRadius: DISC / 2,
                backgroundColor: DISC_FILL,
              },
              discStyle,
            ]}
          />

          {routes.map((route, pos) => {
            const { options } = descriptors[route.key];
            const highlighted = (previewPos ?? activePos) === pos;
            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : (options.title ?? route.name);
            return (
              <TabItem
                key={route.key}
                routeName={route.name}
                focused={highlighted}
                reduced={reduced}
                label={label}
                onLayout={(e: LayoutChangeEvent) => {
                  const { x, width } = e.nativeEvent.layout;
                  setLayouts((prev) => {
                    const cur = prev[pos];
                    if (cur && cur.x === x && cur.width === width) return prev;
                    return { ...prev, [pos]: { x, width } };
                  });
                }}
              />
            );
          })}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

function TabItem({
  routeName,
  focused,
  reduced,
  label,
  onLayout,
}: {
  routeName: string;
  focused: boolean;
  reduced: boolean;
  label: string;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const active = useSharedValue(focused ? 1 : 0);
  const icon = ICONS[routeName] ?? ICONS.index;

  useEffect(() => {
    active.value = reduced
      ? focused
        ? 1
        : 0
      : focused
        ? withSpring(1, POP)
        : withTiming(0, { duration: 180 });
  }, [focused, reduced, active]);

  // Whole icon grows a touch when active.
  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + active.value * 0.06 }],
  }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - active.value }));
  const filledStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: 0.55 + active.value * 0.45 }],
  }));

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={[{ width: ICON, height: ICON }, wrapStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, outlineStyle]}>
          <Ionicons name={icon.outline} size={ICON} color={INACTIVE} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, filledStyle]}>
          <Ionicons name={icon.filled} size={ICON} color={ACCENT} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
