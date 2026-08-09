import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Platform, LayoutChangeEvent, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  useAnimatedRef,
  measure,
  withSpring,
  withTiming,
  withDelay,
  useReducedMotion,
  runOnJS,
} from 'react-native-reanimated';
import type { DerivedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector, PointerType } from 'react-native-gesture-handler';
import type { GestureStateChangeEvent, GestureUpdateEvent } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '../lib/theme';

// Clean Instagram-style dock: white pill, icon-only, a single soft-purple disc
// that slides behind the active tab. Palette-locked (purple accent, ink icons,
// white surface). No labels, no ghost word — just a smooth, quiet bar.
//
// ---------------------------------------------------------------------------
// Threading model — the thing to preserve if you edit this file.
//
// This bar renders on every screen in the app, and its gesture runs on top of
// whatever list is scrolling underneath. So NOTHING about a touch is allowed to
// reach React. Reanimated's own performance guide is explicit about this:
// "avoid calling runOnJS in onUpdate", and don't sync worklet callbacks with
// React state in frequently-updated handlers.
//
// Concretely:
//   • Item geometry lives in `layouts` (a shared value), written once per
//     onLayout — not in useState. Measuring the bar therefore costs zero
//     renders instead of one render per tab.
//   • Hit-testing (`indexAtX`) is a worklet, so a drag resolves which tab is
//     under the finger on the UI thread.
//   • The highlighted tab is `highlight` (a derived shared value). Each TabItem
//     reads it inside useAnimatedStyle, so dragging across the bar animates six
//     icons and the disc without re-rendering a single React component.
//   • The JS thread is crossed exactly twice per interaction: a selection
//     haptic when the previewed tab changes, and `select()` on release. Both
//     are per-event, never per-frame.
//
// React state here would mean a full tab-bar render every frame of every drag,
// on top of the list already scrolling behind it.
// ---------------------------------------------------------------------------
const ACCENT = colors.ink; // active icon stays dark (ink), like the reference
const INACTIVE = colors.ink; // near-black line icons, Instagram-clean
const DISC_FILL = 'rgba(15,15,15,0.08)'; // neutral grey disc (ink @8%)

// The dock's translucent fill. Two values because only iOS still layers a real
// blur behind it (see BLUR_ENABLED below); on Android/web the fill has to carry
// the frosted look on its own, so it composites to the same opacity the
// blur+fill stack used to produce.
//
// Derivation, so this isn't a magic number: expo-blur's own
// `getBackgroundColor(44, 'light')` is rgba(249,249,249,0.343), and it sat on
// top of a 0.86 white fill. Composited that is 1 - (1 - 0.86) * (1 - 0.343)
// = 0.908. Hence 0.91 on the platforms that drop the blur layer.
const FILL_WITH_BLUR = 'rgba(255,255,255,0.86)';
const FILL_SOLO = 'rgba(255,255,255,0.91)';

// Blur is iOS-only, on purpose, and it is a performance decision rather than a
// design one — the dock is composited over a scrolling FlashList on every
// screen in the app.
//
//   • iOS — kept. UIVisualEffectView is GPU-composited and genuinely cheap.
//     This is also where the glass reads best.
//   • Android — dropped. expo-blur's Android support is documented as
//     experimental and "may cause performance and graphical issues";
//     `dimezisBlurView` re-snapshots the view tree below it every frame. It was
//     also barely visible: intensity 28 with the default `blurReductionFactor`
//     of 4 is an effective radius of ~7, underneath a 0.86-opaque white fill.
//   • Web — dropped. It compiled to `backdrop-filter: blur(8.8px)
//     saturate(180%)`, which re-reads the pixels beneath the dock on every
//     frame the backdrop changes — i.e. the entire time the feed is scrolling —
//     and backdrop-filter on a viewport-pinned element is a known scroll-jank
//     source in Safari. Only ~9% of the backdrop was visible through it.
//
// To put the frosted layer back on a platform, add it here and swap that
// platform's fill to FILL_WITH_BLUR. Nothing else needs to change.
const BLUR_ENABLED = Platform.OS === 'ios';
const BAR_FILL = BLUR_ENABLED ? FILL_WITH_BLUR : FILL_SOLO;

const BAR_HEIGHT = 62;
const ICON = 26;
const DISC = 46; // sliding highlight diameter
// Snappy, premium settle for the slide + morph.
const SLIDE = { damping: 18, stiffness: 260, mass: 0.9 } as const;
const POP = { damping: 12, stiffness: 220, mass: 0.7 } as const;
const FADE_OUT = { duration: 180 } as const;

const HAPTICS = Platform.OS !== 'web';

const ICONS: Record<
  string,
  { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }
> = {
  index: { outline: 'home-outline', filled: 'home' },
  discover: { outline: 'search-outline', filled: 'search' },
  wardrobe: { outline: 'shirt-outline', filled: 'shirt' },
  upload: { outline: 'add-circle-outline', filled: 'add-circle' },
  chat: { outline: 'chatbubble-outline', filled: 'chatbubble' },
  profile: { outline: 'person-outline', filled: 'person' },
};

type ItemLayout = { x: number; width: number };

const NO_PREVIEW = -1;

// Which tab sits under `x`. A worklet so drags resolve on the UI thread.
function indexAtX(layouts: ItemLayout[], x: number, count: number): number {
  'worklet';
  for (let i = 0; i < count; i++) {
    const l = layouts[i];
    if (l && x >= l.x && x <= l.x + l.width) return i;
  }
  if (layouts[0] && x < layouts[0].x) return 0;
  return count - 1;
}

// Called from worklets via runOnJS — per event, never per frame.
function selectionHaptic() {
  Haptics.selectionAsync();
}

export function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const routes = state.routes.filter(
    (r) => StyleSheet.flatten(descriptors[r.key].options.tabBarItemStyle)?.display !== 'none',
  );
  const count = routes.length;
  const activeKey = state.routes[state.index].key;
  const activePos = routes.findIndex((r) => r.key === activeKey);

  // ---- shared values (UI thread) ----
  // Item geometry. Written from onLayout; read by the hit-test worklet and by
  // the disc reaction. `pendingLayouts` is the JS-side buffer so each onLayout
  // publishes one immutable snapshot rather than mutating in place.
  const layouts = useSharedValue<ItemLayout[]>([]);
  const pendingLayouts = useRef<ItemLayout[]>([]);
  // Measured only on the keyboard path — see resolveIndex.
  const containerRef = useAnimatedRef<Animated.View>();

  const activeIdx = useSharedValue(activePos);
  const previewIdx = useSharedValue(NO_PREVIEW); // tab under the finger mid-drag
  const committed = useSharedValue(false);

  const discX = useSharedValue(0);
  const pressV = useSharedValue(1); // disc squish on touch
  const mount = useSharedValue(0); // entrance

  // Preview wins while dragging; otherwise the real route. Everything visual
  // hangs off this one value, which is also why releasing on a tab whose
  // tabPress is preventDefault-ed (Discover, Sell — they open sheets instead of
  // navigating) now settles the disc back on the active tab instead of
  // stranding it under the tab that was pressed.
  const highlight = useDerivedValue(() =>
    previewIdx.value === NO_PREVIEW ? activeIdx.value : previewIdx.value,
  );

  useEffect(() => {
    activeIdx.value = activePos;
  }, [activePos, activeIdx]);

  useEffect(() => {
    mount.value = reduced ? 1 : withDelay(60, withSpring(1, { damping: 16, stiffness: 150 }));
  }, [mount, reduced]);

  // Slide the disc whenever the highlighted tab — or its measured position —
  // changes. `prev === null` is the first run, i.e. initial measurement, which
  // must land without animating.
  useAnimatedReaction(
    () => {
      const l = layouts.value[highlight.value];
      return l ? l.x + l.width / 2 - DISC / 2 : null;
    },
    (target, prev) => {
      if (target === null) return;
      discX.value = prev == null || reduced ? target : withSpring(target, SLIDE);
    },
    [reduced],
  );

  // ---- JS thread: only ever reached on release ----
  const select = (pos: number) => {
    const route = routes[pos];
    if (!route) {
      previewIdx.value = NO_PREVIEW;
      return;
    }
    const focused = route.key === activeKey;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      if (HAPTICS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate(route.name);
    }
    // Hand the disc back to `activeIdx`. If the press navigated, that value is
    // already the new tab; if it was preventDefault-ed, the disc springs home.
    previewIdx.value = NO_PREVIEW;
  };

  // Latest-ref indirection, so `selectAt` is stable forever and the memoized
  // gesture below never has to be torn down and re-attached just because a
  // navigation changed which route is focused. Written in an effect rather than
  // during render — React Compiler is enabled on this project, and a ref
  // mutated during render is a Rules of React violation it would bail out on.
  // The initial value is already correct, and a gesture cannot fire before the
  // first effect flush.
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });
  const selectAt = useCallback((pos: number) => selectRef.current(pos), []);

  // ---- gesture (worklets only) ----
  // Memoized because a new Gesture object detaches and re-attaches the native
  // handler, and this component re-renders on every navigation. Deps are
  // primitives only, so this is built once per tab-count change.
  const gesture = useMemo(() => {
    // Which tab an event landed on.
    //
    // Pointer events carry an `x` already relative to the dock, so the common
    // path is a straight lookup. Keyboard events do not: react-native-web
    // renders each tab as a real <button tabindex="0">, and RNGH's built-in
    // KeyboardEventManager turns Enter/Space on one into a synthetic tap — but
    // it derives coordinates from the *focused button's* bounding box, so it
    // reports `x = button.width / 2`. On a five-tab dock that constant always
    // falls inside tab 0, which is why keyboard activation used to navigate
    // Home no matter which tab you had focused.
    //
    // `absoluteX` is correct in that case (it is the focused button's viewport
    // centre), so for PointerType.KEY we convert it into dock-local space with
    // a one-off measure. That runs only on the keyboard path — never during a
    // drag, where a per-frame measure would be a layout read every frame.
    const resolveIndex = (
      e:
        | GestureStateChangeEvent<{ x: number; absoluteX: number; pointerType: PointerType }>
        | GestureUpdateEvent<{ x: number; absoluteX: number; pointerType: PointerType }>,
    ) => {
      'worklet';
      if (e.pointerType === PointerType.KEY) {
        const m = measure(containerRef);
        if (m) return indexAtX(layouts.value, e.absoluteX - m.pageX, count);
      }
      return indexAtX(layouts.value, e.x, count);
    };

    // Drag engages after a few px of travel; a quick stationary touch falls
    // through to the Tap gesture and selects.
    const pan = Gesture.Pan()
      .minDistance(6)
      .onBegin((e) => {
        committed.value = false;
        pressV.value = withTiming(0.9, { duration: 110 });
        previewIdx.value = resolveIndex(e);
      })
      .onUpdate((e) => {
        const pos = resolveIndex(e);
        if (pos !== previewIdx.value) {
          previewIdx.value = pos;
          if (HAPTICS) runOnJS(selectionHaptic)();
        }
      })
      .onEnd((e) => {
        const pos = previewIdx.value === NO_PREVIEW ? resolveIndex(e) : previewIdx.value;
        committed.value = true;
        runOnJS(selectAt)(pos);
      })
      .onFinalize(() => {
        pressV.value = withSpring(1, POP);
        if (!committed.value) previewIdx.value = NO_PREVIEW;
      });

    const tap = Gesture.Tap()
      .maxDistance(14)
      .onEnd((e) => {
        committed.value = true;
        runOnJS(selectAt)(resolveIndex(e));
      });

    return Gesture.Race(pan, tap);
  }, [count, committed, containerRef, layouts, pressV, previewIdx, selectAt]);

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
      ref={containerRef}
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: 20,
          right: 20,
          // Android was pinned to a flat 22 here, which predates SDK 54 making
          // edge-to-edge mandatory: insets.bottom is now the real system bar, so
          // a fixed 22 tucks the dock under the navigation bar on 3-button
          // devices (~48dp) while looking fine on gesture nav (~24dp) and on web.
          // Honouring the inset on both platforms clears it; the 22/14 floors
          // keep the resting position identical where the inset is small.
          bottom: Math.max(insets.bottom, Platform.OS === 'android' ? 22 : 14),
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
            backgroundColor: BAR_FILL,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.7)',
            boxShadow: '0px 2px 6px rgba(0,0,0,0.05), 0px 14px 30px rgba(0,0,0,0.12)',
            elevation: 16,
          }}
        >
          {/* Frosted glass fill — iOS only, see BLUR_ENABLED. */}
          {BLUR_ENABLED ? (
            <BlurView
              tint="light"
              intensity={44}
              pointerEvents="none"
              style={{
                ...StyleSheet.absoluteFillObject,
                borderRadius: BAR_HEIGHT / 2,
                borderCurve: 'continuous',
                overflow: 'hidden',
              }}
            />
          ) : null}

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
            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : (options.title ?? route.name);
            return (
              <TabItem
                key={route.key}
                index={pos}
                routeName={route.name}
                highlight={highlight}
                selected={pos === activePos}
                reduced={reduced}
                label={label}
                onLayout={(e: LayoutChangeEvent) => {
                  const { x, width } = e.nativeEvent.layout;
                  const cur = pendingLayouts.current[pos];
                  if (cur && cur.x === x && cur.width === width) return;
                  pendingLayouts.current[pos] = { x, width };
                  // Publish an immutable snapshot: shared values only propagate
                  // to the UI thread on assignment, not on mutation.
                  layouts.value = pendingLayouts.current.slice();
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
  index,
  routeName,
  highlight,
  selected,
  reduced,
  label,
  onLayout,
}: {
  index: number;
  routeName: string;
  highlight: DerivedValue<number>;
  selected: boolean;
  reduced: boolean;
  label: string;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const icon = ICONS[routeName] ?? ICONS.index;

  // Derived from `highlight` on the UI thread, so this item animates during a
  // drag without React knowing the drag is happening.
  const active = useDerivedValue(() => {
    const on = highlight.value === index;
    if (reduced) return on ? 1 : 0;
    return on ? withSpring(1, POP) : withTiming(0, FADE_OUT);
  }, [index, reduced]);

  // Whole icon grows a touch when active.
  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + active.value * 0.06 }],
  }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - active.value }));
  const filledStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: 0.55 + active.value * 0.45 }],
  }));

  // No keyboard handler here on purpose. react-native-web renders this as a
  // real <button tabindex="0">, and RNGH's KeyboardEventManager already turns
  // Enter/Space on it into a tap on the dock's gesture — resolveIndex() above
  // is what makes that land on the right tab. Adding an onKeyDown here would
  // fire a second, competing selection.
  return (
    <View
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
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
