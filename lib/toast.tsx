import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View, Text, Animated, Easing, Platform, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

// JS-driven on web (no RCTAnimation), native-driven on iOS/Android.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

type ToastVariant = 'default' | 'success' | 'info';
type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
  icon?: keyof typeof Feather.glyphMap;
};

type ToastApi = {
  show: (message: string, opts?: { variant?: ToastVariant; icon?: keyof typeof Feather.glyphMap; durationMs?: number }) => void;
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
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
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
      const duration = opts?.durationMs ?? 1800;

      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setToast({ id, message, variant, icon });
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

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const v = toast ? variantStyles(toast.variant) : null;

  return (
    <ToastContext.Provider value={{ show }}>
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
            pointerEvents: 'none',
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
            {toast.icon && (
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
            )}
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
