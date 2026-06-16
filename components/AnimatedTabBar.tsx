import { useEffect, useRef, useState } from 'react';
import { View, Text, Platform, LayoutChangeEvent, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  useReducedMotion,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, tintedPurple } from '../lib/theme';

// Palette-locked: white dock, purple accent, black-at-opacity for muted.
const ACCENT = colors.primary; // #6C47FF
const INACTIVE = colors.muteSoft; // rgba(15,15,15,0.45)
const PILL_FILL = colors.primarySofter; // purple @18%
const PILL_BORDER = tintedPurple; // purple @45%

const BAR_HEIGHT = 68;
const PILL_INSET = 8;
const PILL_H = BAR_HEIGHT - PILL_INSET * 2;
// Snappy, premium settle for the slide.
const SLIDE = { damping: 16, stiffness: 260, mass: 0.9 } as const;
// Bouncier spring for the icon morph (a little overshoot = life).
const POP = { damping: 11, stiffness: 200, mass: 0.7 } as const;

const ICONS: Record<
  string,
  { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap; ghost: string }
> = {
  index: { outline: 'home-outline', filled: 'home', ghost: 'HOME' },
  feed: { outline: 'grid-outline', filled: 'grid', ghost: 'MY FEED' },
  discover: { outline: 'search-outline', filled: 'search', ghost: 'DISCOVER' },
  upload: { outline: 'add-circle-outline', filled: 'add-circle', ghost: 'SELL' },
  profile: { outline: 'person-outline', filled: 'person', ghost: 'PROFILE' },
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
  const activeRoute = routes[activePos];

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

  const indX = useSharedValue(0);
  const indW = useSharedValue(0);
  const prevX = useSharedValue(0); // for velocity-based liquid stretch
  const floatV = useSharedValue(0); // pill lift while dragging
  const pressV = useSharedValue(1); // pill squish on touch
  const mount = useSharedValue(0); // entrance choreography
  const didInit = useRef(false);

  useEffect(() => {
    mount.value = reduced ? 1 : withDelay(60, withSpring(1, { damping: 15, stiffness: 140 }));
  }, [mount, reduced]);

  // Keep the pill on the real active tab whenever selection changes externally.
  useEffect(() => {
    const l = layouts[activePos];
    if (!l) return;
    if (!didInit.current || reduced) {
      indX.value = l.x;
      indW.value = l.width;
      prevX.value = l.x;
      didInit.current = true;
    } else if (!draggingRef.current) {
      indX.value = withSpring(l.x, SLIDE);
      indW.value = withSpring(l.width, SLIDE);
    }
  }, [activePos, layouts, reduced, indX, indW, prevX]);

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
    if (animate && !reduced) {
      indX.value = withSpring(l.x, SLIDE);
      indW.value = withSpring(l.width, SLIDE);
    } else {
      indX.value = l.x;
      indW.value = l.width;
    }
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
    pressV.value = withTiming(0.95, { duration: 120 });
    moveTo(itemAtX(x));
  };
  const onDragStart = () => {
    draggingRef.current = true;
    floatV.value = withTiming(1, { duration: 160 });
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
    floatV.value = withTiming(0, { duration: 200 });
    pressV.value = withSpring(1, POP);
    draggingRef.current = false;
    previewRef.current = null;
    if (!committedRef.current) {
      setPreviewPos(null);
      moveTo(activePosRef.current);
    }
  };

  // Drag engages as soon as the finger travels a few px (works for an
  // immediate drag AND a hold-then-drag). A quick stationary touch falls
  // through to the Tap gesture below and selects.
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

  // Pill: slides, stretches toward its direction of travel (liquid), lifts on drag.
  const pillStyle = useAnimatedStyle(() => {
    const dx = indX.value - prevX.value;
    prevX.value = indX.value;
    const speed = Math.min(Math.abs(dx), 22);
    const sx = 1 + interpolate(speed, [0, 22], [0, 0.22], Extrapolation.CLAMP);
    const sy = 1 - interpolate(speed, [0, 22], [0, 0.1], Extrapolation.CLAMP);
    return {
      width: indW.value,
      opacity: mount.value,
      transform: [
        { translateX: indX.value },
        { translateY: -floatV.value * 3 },
        { scaleX: sx },
        { scaleY: sy * (1 + floatV.value * 0.1) },
        { scale: pressV.value },
      ],
    };
  });

  const barStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 24 }],
  }));

  return (
    <>
      <GhostLabel text={activeRoute ? ICONS[activeRoute.name]?.ghost : undefined} reduced={reduced} />

      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 16) : 24,
          },
          barStyle,
        ]}
      >
        <GestureDetector gesture={gesture}>
          <View
            style={{
              flexDirection: 'row',
              height: BAR_HEIGHT,
              borderRadius: 34,
              paddingHorizontal: 8,
              backgroundColor: 'rgba(255,255,255,0.70)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.6)',
              // Layered depth + a faint purple ambient = premium float.
              boxShadow:
                '0px 2px 6px rgba(0,0,0,0.05), 0px 12px 28px rgba(0,0,0,0.10), 0px 20px 44px rgba(108,71,255,0.12)',
              elevation: 16,
            }}
          >
            {/* Frosted glass fill */}
            <BlurView
              tint="light"
              intensity={Platform.OS === 'android' ? 24 : 40}
              experimentalBlurMethod="dimezisBlurView"
              pointerEvents="none"
              style={{ ...StyleSheet.absoluteFillObject, borderRadius: 34, overflow: 'hidden' }}
            />
            {/* Glass top-edge highlight */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: '12%',
                right: '12%',
                height: 1,
                borderRadius: 1,
                backgroundColor: 'rgba(255,255,255,0.9)',
              }}
            />

            {/* Sliding glossy pill */}
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: PILL_INSET,
                  height: PILL_H,
                  left: 0,
                  borderRadius: PILL_H / 2,
                  backgroundColor: PILL_FILL,
                  borderWidth: 1,
                  borderColor: PILL_BORDER,
                  overflow: 'hidden',
                  boxShadow: '0px 6px 16px rgba(108,71,255,0.28)',
                },
                pillStyle,
              ]}
            >
              {/* Top sheen for a glossy, raised feel */}
              <View
                style={{
                  position: 'absolute',
                  top: 1,
                  left: 5,
                  right: 5,
                  height: '46%',
                  borderRadius: PILL_H / 2,
                  backgroundColor: 'rgba(255,255,255,0.40)',
                }}
              />
            </Animated.View>

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
                  index={pos}
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
    </>
  );
}

function TabItem({
  index,
  routeName,
  focused,
  reduced,
  label,
  onLayout,
}: {
  index: number;
  routeName: string;
  focused: boolean;
  reduced: boolean;
  label: string;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const active = useSharedValue(focused ? 1 : 0);
  const enter = useSharedValue(0);
  const icon = ICONS[routeName] ?? ICONS.index;

  useEffect(() => {
    enter.value = reduced ? 1 : withDelay(120 + index * 55, withSpring(1, { damping: 14, stiffness: 170 }));
  }, [enter, index, reduced]);

  useEffect(() => {
    active.value = reduced
      ? focused
        ? 1
        : 0
      : focused
        ? withSpring(1, POP)
        : withTiming(0, { duration: 180 });
  }, [focused, reduced, active]);

  // Whole icon lifts + grows when active; staggers up on mount.
  const wrapStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: -active.value * 3 + (1 - enter.value) * 10 },
      { scale: (0.9 + enter.value * 0.1) * (1 + active.value * 0.08) },
    ],
  }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - active.value }));
  const filledStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [
      { scale: 0.5 + active.value * 0.5 },
      { rotate: `${(1 - active.value) * -12}deg` },
    ],
  }));
  // Active label gets a touch bolder + brighter; inactive sits back.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: enter.value * (0.55 + active.value * 0.45),
    transform: [{ translateY: (1 - enter.value) * 6 }],
  }));

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}
    >
      <Animated.View style={[{ width: 26, height: 26, marginBottom: 4 }, wrapStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, outlineStyle]}>
          <Ionicons name={icon.outline} size={26} color={INACTIVE} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, filledStyle]}>
          <Ionicons
            name={icon.filled}
            size={26}
            color={ACCENT}
            style={{ textShadowColor: 'rgba(108,71,255,0.45)', textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } }}
          />
        </Animated.View>
      </Animated.View>
      <Animated.Text
        style={[
          {
            fontSize: 10,
            fontWeight: focused ? '600' : '500',
            letterSpacing: 0.3,
            color: focused ? ACCENT : INACTIVE,
          },
          labelStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

// Big faint purple word that fades in behind the screen on each tab change.
function GhostLabel({ text, reduced }: { text?: string; reduced: boolean }) {
  const op = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const first = useRef(true);

  useEffect(() => {
    if (!text) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    op.value = withSequence(
      withTiming(1, { duration: 280 }),
      withDelay(900, withTiming(0, { duration: 500 })),
    );
    scale.value = withSequence(
      withTiming(1, { duration: 600 }),
      withDelay(800, withTiming(0.96, { duration: 400 })),
    );
  }, [text, reduced, op, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: 0, right: 0, bottom: 130, alignItems: 'center', zIndex: -1 },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: 64,
          fontWeight: '800',
          letterSpacing: -2,
          color: colors.primarySoft,
          textTransform: 'uppercase',
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}
