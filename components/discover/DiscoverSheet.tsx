// The Discover tab doesn't navigate — it opens this search sheet.
//
// Same primitive as SellSheet (`<Modal animationType="slide">`), so it slides
// up from the bottom over whatever screen is active. It stops short of the top
// edge (SheetShell below) so the screen underneath stays visible — that strip
// is what makes it read as a sheet rather than a page, and it's tappable to
// dismiss. The layout mirrors the reference: grabber, one search field, a
// BROWSE chip row and a TOPICS grid (components/discover/SearchLanding.tsx
// renders the last two, shared with the Discover screen's own focus landing).
//
// Nothing here holds search state. Every tap closes the sheet and navigates to
// /discover with the intent encoded as params, which is what makes the sheet
// disposable: back always returns to where the user opened it from.
//
// ── Android parity ──
// Two Modal-on-Android gotchas are handled explicitly, because without them
// the native build does NOT match web:
//   1. `statusBarTranslucent` + `navigationBarTranslucent` — without these the
//      modal window stops at the system bars, so a "full screen" sheet renders
//      short and letterboxed on Android while looking correct on web.
//   2. A nested <SafeAreaProvider> — insets are measured relative to the
//      nearest provider's view, and the app-root provider is outside this
//      modal's window. Without a provider inside, useSafeAreaInsets() reports
//      zeros on Android and content slides under the status/gesture bars.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Modal,
  InteractionManager,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '@/lib/brand';
import { buildTopicCovers } from '@/lib/discover';
import { useFeedListingsQuery } from '@/lib/queries';
import { colors, radii, type } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { SearchLanding, type BrowseAction, type TopicAction } from './SearchLanding';
import { useSheetSearchFocus } from './useSheetSearchFocus';
import { DummySheetBody, registerDummySkinFont } from './DiscoverSheet.dummy'; // DUMMY SKIN

// ── DUMMY SKIN (temporary) ──────────────────────────────────────────────────
// Swaps the body below for a visual-only reskin matching the reference
// screenshot. Revert with either:
//   • flip this to false, or
//   • delete these three "DUMMY SKIN" lines + components/discover/DiscoverSheet.dummy.tsx
// The real DiscoverSheetBody underneath is unmodified.
const DUMMY_SKIN = true;

// Every navigation out of the sheet carries a monotonic `n`. Without it,
// picking the same chip twice produces an identical URL, expo-router hands
// back identical params, and the Discover screen's params effect never
// re-runs — so re-picking a chip you'd since cleared would silently do
// nothing. The nonce makes each pick a distinct navigation.
let intentSeq = 0;
function withNonce(path: string) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}n=${++intentSeq}`;
}

// ── Context ─────────────────────────────────────────────────────────────────
type DiscoverSheetApi = { open: () => void };
const Ctx = createContext<DiscoverSheetApi | undefined>(undefined);

export function useDiscoverSheet(): DiscoverSheetApi {
  const ctx = useContext(Ctx);
  // Soft fallback outside the provider: fall back to the Discover screen.
  if (!ctx) return { open: () => router.push('/discover') };
  return ctx;
}

/**
 * Renders `children` only once the browser has painted at least one frame
 * without them.
 *
 * The Discover tab's press handler calls setVisible(true), and everything under
 * the Modal used to mount in that same tick: SafeAreaProvider,
 * GestureHandlerRootView, the shell, and the body — which additionally kicks off
 * a listings query for the Topics covers. Nothing could paint until all of it
 * finished, which measured as a 789ms long task and made this the app's worst
 * interaction by a wide margin (280ms INP unthrottled, 824ms at 4x CPU).
 *
 * Two nested rAFs, not one: a single `requestAnimationFrame` scheduled from an
 * effect still runs BEFORE the next paint, so the body would land in the very
 * frame we are trying to keep clear. The second one fires after that frame has
 * been painted.
 *
 * The sheet's own slide-up runs 240ms, so the body arrives well inside the
 * entry animation — the user sees the sheet start moving on touch, which is the
 * whole point, and never sees an empty sheet come to rest.
 */
function DeferAfterPaint({ children }: { children: ReactNode }) {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, []);
  return painted ? <>{children}</> : null;
}

// Keeps the soft keyboard up across the sheet's mount, on mobile web only.
//
// Mobile browsers raise the on-screen keyboard only for a focus() that runs
// inside the tap's own task, while the page still holds user activation. The
// sheet's real search field can't satisfy that: it doesn't exist yet when the
// tab is pressed, and by the time it mounts and useSheetSearchFocus runs, the
// activation is spent — so the field focuses with the caret blinking and no
// keyboard, which is the bug this fixes.
//
// So focus lands on this always-mounted field DURING the tap, which brings the
// keyboard up, and the real field takes focus a frame later. Browsers keep the
// keyboard raised when focus moves between text inputs, so the handover is
// invisible.
//
// It must stay focusable to do that job: `display:none`, `visibility:hidden`,
// `readOnly` and `disabled` all make focus() a no-op, which is why this is an
// opacity-0 one-pixel field rather than a hidden one. It's removed from the
// accessibility tree instead, since it is not a real control.
function KeyboardPrimer({ inputRef }: { inputRef: RefObject<TextInput | null> }) {
  if (Platform.OS !== 'web') return null;
  return (
    <TextInput
      ref={inputRef}
      // Not a control anyone should reach deliberately.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        opacity: 0,
        padding: 0,
        borderWidth: 0,
      }}
      {...({ tabIndex: -1, 'aria-hidden': true } as any)}
    />
  );
}

export function DiscoverSheetProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  // See <KeyboardPrimer/> below for why this exists.
  const primerRef = useRef<TextInput>(null);
  const open = useCallback(() => {
    // Claim the skin's icon family before its icons mount — see
    // registerDummySkinFont. Synchronous, idempotent, and a no-op once the
    // DUMMY SKIN lines are removed. (DUMMY SKIN)
    if (DUMMY_SKIN) registerDummySkinFont();
    // MUST stay synchronous, and MUST come before setVisible: it has to run
    // inside the tap's own task to count as user-activated. See KeyboardPrimer.
    if (Platform.OS === 'web') primerRef.current?.focus();
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);
  const api = useMemo(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <KeyboardPrimer inputRef={primerRef} />
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={close}
        statusBarTranslucent
        navigationBarTranslucent
      >
        {/* Insets are measured from the nearest provider's view; the app-root
            one lives outside this modal's window (see the Android note up
            top). Mounted only while open — the body runs a listings query for
            the Topics covers, and an always-mounted provider must not fetch. */}
        {visible ? (
          // initialMetrics seeds the first frame with the real device insets
          // instead of zeros, so the header doesn't jump once measurement
          // lands — the jump would otherwise happen mid slide-up.
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            {/* Same reason as the nested SafeAreaProvider: a Modal is its own
                view root on Android, and gesture-handler only sees touches
                below a root view of its own. Without this the drag-to-dismiss
                works on web/iOS and does nothing on Android. */}
            <GestureHandlerRootView style={{ flex: 1 }}>
              <SheetShell onClose={close} skin={DUMMY_SKIN ? DUMMY_SKIN_HANDLE : DEFAULT_HANDLE}>
                {/* Body mounts one painted frame after the shell — see
                    DeferAfterPaint. The shell is what slides up, so the tap
                    gets a visible response immediately instead of waiting on
                    the body's whole subtree and its listings query. */}
                <DeferAfterPaint>
                  {DUMMY_SKIN ? <DummySheetBody onClose={close} /> : <DiscoverSheetBody onClose={close} />}
                </DeferAfterPaint>
              </SheetShell>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

// ── Shell: top gap + grabber + drag-to-dismiss ──────────────────────────────
// The shell owns everything outside the content: the strip of screen left
// showing above the sheet, the sheet's rounded top and background, and the
// grabber. The bodies below render content only.
//
// Why the grabber lives here and not in the bodies: it doubles as the drag
// surface, and the drag has to be scoped to it. A Pan wrapping the whole sheet
// would win against the body's ScrollView the moment it passed its activation
// offset (both engage at ~10px), so dragging the content would move the sheet
// instead of scrolling. Header-only keeps both gestures unambiguous.
type SheetSkin = {
  radius: number;
  handleW: number;
  handleH: number;
  handleColor: string;
  padTop: number;
  gap: number;
};

const DEFAULT_HANDLE: SheetSkin = {
  radius: radii['3xl'],
  handleW: 38,
  handleH: 4,
  handleColor: colors.hairline,
  padTop: 10,
  gap: 14,
};

// Mirrors the mock's .handle (70×5 #ececec) and its 16px/20px spacing.
const DUMMY_SKIN_HANDLE: SheetSkin = {
  radius: 22,
  handleW: 70,
  handleH: 5,
  handleColor: '#ececec',
  padTop: 16,
  gap: 20,
};

// Dismiss on either a deliberate drag or a flick — requiring the full distance
// makes a quick swipe feel like it was ignored.
const DRAG_CLOSE_PX = 96;
const DRAG_CLOSE_VELOCITY = 700;

function SheetShell({
  onClose,
  skin,
  children,
}: {
  onClose: () => void;
  skin: SheetSkin;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const translateY = useSharedValue(0);
  // Scrim fades in rather than arriving with the slide — the Modal animates
  // this whole view up, so a fully-opaque scrim would read as a dark band
  // rising behind the sheet.
  const appear = useSharedValue(0);

  useEffect(() => {
    appear.value = withTiming(1, { duration: 240 });
  }, [appear]);

  // Leave the sheet below the status bar with a little air on top of that.
  // Floored on web/Android tablets, where insets.top can be 0.
  const topGap = Math.max(insets.top, 20) + 12;

  const pan = Gesture.Pan()
    // Down only: a tap never hijacks it, and an upward drag hands the touch
    // back instead of rubber-banding against a wall.
    .activeOffsetY(8)
    .failOffsetY(-8)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (translateY.value > DRAG_CLOSE_PX || e.velocityY > DRAG_CLOSE_VELOCITY) {
        translateY.value = withTiming(
          winHeight,
          { duration: 180, easing: Easing.out(Easing.quad) },
          (done) => {
            if (done) runOnJS(onClose)();
          },
        );
      } else {
        // Snaps back with no bounce — this is a correction, not a flourish.
        translateY.value = withSpring(0, { damping: 26, stiffness: 280, mass: 0.7 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Scrim tracks the drag, so a half-committed swipe already shows the screen
  // beneath coming back.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: appear.value * (1 - Math.min(1, translateY.value / (winHeight * 0.5))),
  }));

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }, scrimStyle]}
      />

      {/* The gap itself — tapping outside a sheet closes it. */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss search"
        style={{ height: topGap }}
      />

      <Animated.View
        style={[
          {
            flex: 1,
            backgroundColor: colors.white,
            borderTopLeftRadius: skin.radius,
            borderTopRightRadius: skin.radius,
            overflow: 'hidden',
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View style={{ paddingTop: skin.padTop, paddingBottom: skin.gap, alignItems: 'center' }}>
            <Pressable
              // Tap closes; a drag must not. On release the Pressable still
              // reports a press (its press rect is generous, and web keeps the
              // responder through the whole drag), so a short drag that should
              // spring back would close the sheet instead. The offset at
              // release tells the two apart — a real tap never moves it.
              onPress={() => {
                if (translateY.value > 4) return;
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close search"
              hitSlop={{ top: 12, bottom: 12, left: 60, right: 60 }}
              style={{
                width: skin.handleW,
                height: skin.handleH,
                borderRadius: 50,
                backgroundColor: skin.handleColor,
              }}
            />
          </View>
        </GestureDetector>

        <View style={{ flex: 1 }}>{children}</View>
      </Animated.View>
    </View>
  );
}

function DiscoverSheetBody({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  // Opening the sheet is unambiguously an intent to search, so the keyboard
  // comes up with it rather than costing a second tap.
  const searchRef = useRef<TextInput>(null);
  useSheetSearchFocus(searchRef);

  // Hold the covers fetch until the slide-up has finished. RN's performance
  // guide is explicit that work competing with a transition is what makes it
  // stutter; the tiles render their taxonomy icon in the meantime and the
  // photos cross-fade in after. Usually a cache hit anyway — Discover's idle
  // grid uses this exact key — so the wait is invisible.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    // Backstop timer alongside the interaction handle: if any animation handle
    // leaks, runAfterInteractions never fires and the Topics tiles would sit
    // on their icons forever. Whichever resolves first wins.
    const task = InteractionManager.runAfterInteractions(() => setSettled(true));
    const timer = setTimeout(() => setSettled(true), 350);
    return () => {
      task.cancel();
      clearTimeout(timer);
    };
  }, []);

  const gridQ = useFeedListingsQuery({ tab: 'popular', limit: 60, enabled: settled });
  const covers = useMemo(() => buildTopicCovers(gridQ.data ?? []), [gridQ.data]);

  const go = useCallback(
    (path: string) => {
      onClose();
      router.push(withNonce(path) as any);
    },
    [onClose],
  );

  const submit = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setQuery('');
    go(`/discover?q=${encodeURIComponent(q)}`);
  }, [query, go]);

  const onBrowse = useCallback(
    (action: BrowseAction) => {
      if (action.kind === 'saved') {
        onClose();
        router.push('/news' as any);
        return;
      }
      if (action.kind === 'tab') {
        go(`/discover?tab=${action.tab}`);
        return;
      }
      go(`/discover?sort=${action.sort}`);
    },
    [go, onClose],
  );

  const onTopic = useCallback(
    (action: TopicAction) => {
      go(action.kind === 'all' ? '/discover' : `/discover?category=${action.category}`);
    },
    [go],
  );

  // Background, rounded top, top inset and the grabber all belong to SheetShell.
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 10 }}>
        <View
          style={{
            flex: 1,
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.hair,
            backgroundColor: colors.panel,
          }}
        >
          <Feather name="search" size={18} color={colors.muteSoft} />
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            placeholder={`Search ${BRAND}...`}
            placeholderTextColor={colors.muteSoft}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={`Search ${BRAND}`}
            style={[
              {
                flex: 1,
                marginLeft: 10,
                fontSize: 14.5,
                fontFamily: type.family.sans,
                color: colors.ink,
                padding: 0,
              },
              // Focus-ring removal is a DOM concern. Kept off native entirely
              // rather than cast through `any` — RN validates style keys, and
              // unknown ones warn on Android.
              Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null,
            ]}
          />
          {query.length > 0 ? (
            <Pressable hitSlop={HIT_SLOP_8} onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <Feather name="x" size={16} color={colors.muteSoft} />
            </Pressable>
          ) : null}
        </View>
        {/* Explicit way out, alongside the grabber, the gap above and Android's
            back button — the keyboard covers the other three while typing. */}
        <Pressable hitSlop={HIT_SLOP_8} onPress={onClose} accessibilityRole="button">
          <Text style={{ fontSize: 14, fontFamily: type.family.sansBold, color: colors.purple }}>
            Cancel
          </Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      >
        <SearchLanding covers={covers} onBrowse={onBrowse} onTopic={onTopic} />
      </ScrollView>
    </View>
  );
}
