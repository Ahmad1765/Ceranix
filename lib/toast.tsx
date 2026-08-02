import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View, Pressable, Animated, Easing, Platform, StyleSheet } from 'react-native';
// Text comes from the rnText shim, not react-native, so toast copy renders in
// Inter on native instead of falling back to the OS system font.
import { Text } from './rnText';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

// JS-driven on web (no RCTAnimation), native-driven on iOS/Android.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

type ToastVariant = 'default' | 'success' | 'info';
type ToastAction = { label: string; onPress: () => void };
type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
  icon?: keyof typeof Feather.glyphMap;
  action?: ToastAction;
};

type ToastApi = {
  show: (
    message: string,
    opts?: {
      variant?: ToastVariant;
      icon?: keyof typeof Feather.glyphMap;
      durationMs?: number;
      // Optional trailing button (e.g. "Undo"). Tapping it runs onPress and
      // dismisses the toast. Toasts with an action linger longer by default.
      action?: ToastAction;
    },
  ) => void;
};

const ToastContext = createContext<ToastApi | undefined>(undefined);

const INK = '#0F0F0F';
const PURPLE = '#6C47FF';

function variantStyles(v: ToastVariant) {
  if (v === 'success') return { bg: INK, fg: 'white', accent: PURPLE, accentFg: 'white' };
  if (v === 'info') return { bg: INK, fg: 'white', accent: PURPLE, accentFg: 'white' };
  return { bg: INK, fg: 'white', accent: 'rgba(255,255,255,0.12)', accentFg: 'white' };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  // `useState(() => ...)` rather than `useRef(new Animated.Value(x)).current`.
  // Reading `.current` during render is a Rules-of-React violation that makes
  // React Compiler bail out of the whole component — and ToastProvider wraps the
  // entire app. The useRef form also builds a throwaway Animated.Value on every
  // render (useRef keeps only the first); the lazy initializer runs once.
  // Semantics are identical: one instance per component lifetime.
  const [translateY] = useState(() => new Animated.Value(-120));
  const [opacity] = useState(() => new Animated.Value(0));
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: USE_NATIVE_DRIVER,
        damping: 18,
        stiffness: 220,
        mass: 0.7,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [opacity, translateY]);

  const animateOut = useCallback(
    (cb?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (finished && cb) cb();
      });
    },
    [opacity, translateY],
  );

  const show: ToastApi['show'] = useCallback(
    (message, opts) => {
      const id = ++counter.current;
      const variant = opts?.variant ?? 'default';
      const icon = opts?.icon;
      const action = opts?.action;
      // Actionable toasts linger so the user has time to hit the button.
      const duration = opts?.durationMs ?? (action ? 4200 : 1800);

      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setToast({ id, message, variant, icon, action });
      setVisible(true);

      // If a toast is already on screen, jump-replace (skip slide-out)
      requestAnimationFrame(() => animateIn());

      dismissTimer.current = setTimeout(() => {
        animateOut(() => {
          // Only clear if no newer toast queued.
          if (counter.current === id) {
            setVisible(false);
            setToast(null);
          }
        });
      }, duration);
    },
    [animateIn, animateOut],
  );

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    animateOut(() => {
      setVisible(false);
      setToast(null);
    });
  }, [animateOut]);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const v = toast ? variantStyles(toast.variant) : null;

  // Stable context value. This provider wraps the entire <Stack>, and it
  // re-renders on every show / dismiss / animation callback. Allocating a
  // fresh `{ show }` on each of those renders changed the context identity,
  // which re-rendered EVERY useToast() consumer — including all ~60
  // <ListingCard>s in a feed grid, whose React.memo cannot block context
  // propagation. `show` is already a stable useCallback, so the value only
  // needs to be pinned to it. Same fix every other provider in the tree
  // (Auth / GuestGate / SellSheet / DiscoverSheet) already carries.
  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {visible && toast && v && (
        <Animated.View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            right: 16,
            zIndex: 10000,
            transform: [{ translateY }],
            opacity,
            // Let the action button receive taps; the rest stays pass-through.
            pointerEvents: toast.action ? 'box-none' : 'none',
          }}
        >
          <View
            style={{
              backgroundColor: v.bg,
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 14,
              paddingRight: 6,
              paddingVertical: 6,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.25,
                  shadowRadius: 16,
                },
                android: { elevation: 6 },
                default: { boxShadow: '0px 8px 16px rgba(0,0,0,0.25)' },
              }),
            }}
          >
            <Text
              style={{
                flex: 1,
                color: v.fg,
                fontSize: 14,
                fontWeight: '700',
                letterSpacing: 0.1,
                paddingVertical: 8,
              }}
              numberOfLines={1}
            >
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                onPress={() => {
                  toast.action?.onPress();
                  dismiss();
                }}
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                hitSlop={8}
                style={({ pressed }) => ({
                  marginLeft: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 10,
                  backgroundColor: PURPLE,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '800', letterSpacing: 0.2 }}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : toast.icon ? (
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: v.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 10,
                }}
              >
                <Feather name={toast.icon} size={16} color={v.accentFg as string} />
              </View>
            ) : null}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft fallback: allow components to call show() outside of provider in dev
    // without crashing. In production, provider is always mounted.
    return { show: () => {} };
  }
  return ctx;
}

// styles kept inline; this file owns everything
StyleSheet.create({});
