import '../global.css';
import { useEffect, useState } from 'react';
import { Platform, TextInput } from 'react-native';
import { installAlertShim } from '@/lib/alertShim';
import { initSentry, wrapWithSentry } from '@/lib/sentry';
import { initAnalytics, screen } from '@/lib/analytics';
import { normalizeScreenName } from '@/lib/analyticsEvents';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Asset } from 'expo-asset';
import { Ionicons, Feather } from '@expo/vector-icons';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_700Bold_Italic,
} from '@expo-google-fonts/inter';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/queryClient';
import { initOnlineManager } from '@/lib/offline';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { GuestGateProvider } from '@/components/GuestGate';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';

// Initialize crash + error reporting before anything else renders so startup
// failures are captured too. No-ops when EXPO_PUBLIC_SENTRY_DSN is unset.
initSentry();
// Initialize PostHog analytics. No-ops when EXPO_PUBLIC_POSTHOG_KEY is unset.
initAnalytics();
// Bridge device connectivity into TanStack Query so fetches pause offline and
// auto-resume on reconnect (rather than hanging on unreachable requests).
initOnlineManager();

// React-native-web ships Alert.alert as a no-op, so every validation /
// confirm path that calls Alert.alert silently dies on web. The shim swaps
// in a window-backed implementation that honours the standard RN signature.
installAlertShim();

// Strip Android's default black TextInput underline and align selection
// handles with the brand purple so focus/select never paints black.
const _TI: any = TextInput;
_TI.defaultProps = _TI.defaultProps || {};
_TI.defaultProps.underlineColorAndroid = 'transparent';
_TI.defaultProps.selectionColor = '#6C47FF';

const AESTHETIC_FONTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_700Bold_Italic,
};

SplashScreen.preventAutoHideAsync();

// Web-only: react-navigation hides off-screen stack/tab screens with
// `display:none; aria-hidden="true"`. If a Pressable inside the leaving
// screen still has focus, Chrome warns "Blocked aria-hidden on an element
// because its descendant retained focus". We watch the DOM for that
// attribute and blur the focused descendant the moment it's flagged
// hidden, which keeps assistive-tech behavior correct and silences the
// console warning. Idempotent + scoped to web so it has zero cost on
// native.
function useFocusOutOfAriaHidden() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName !== 'aria-hidden') continue;
        const target = m.target as HTMLElement;
        if (target.getAttribute('aria-hidden') !== 'true') continue;
        const active = document.activeElement as HTMLElement | null;
        if (active && active !== document.body && target.contains(active)) {
          active.blur();
        }
      }
    });
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-hidden'],
      subtree: true,
    });
    return () => obs.disconnect();
  }, []);
}

function RootLayout() {
  const [ready, setReady] = useState(false);
  useFocusOutOfAriaHidden();
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) screen(normalizeScreenName(pathname));
  }, [pathname]);

  useEffect(() => {
    // Icon fonts are tiny — always block first paint on these so glyphs never
    // render as boxes. Inter is large; load in background so it doesn't
    // delay the UI.
    const iconFonts = Font.loadAsync({ ...Ionicons.font, ...Feather.font });
    Font.loadAsync(AESTHETIC_FONTS).catch(console.warn);

    if (Platform.OS === 'web') {
      iconFonts
        .catch(console.warn)
        .finally(() => {
          setReady(true);
          SplashScreen.hideAsync();
        });
      return;
    }

    Promise.all([
      iconFonts,
      Asset.loadAsync([
        require('../assets/images/adaptive-icon.png'),
        require('../assets/images/favicon.png'),
      ]),
    ])
      .catch(console.warn)
      .finally(() => {
        setReady(true);
        SplashScreen.hideAsync();
      });
  }, []);

  // Preloader disabled — render nothing until boot assets are ready instead of
  // the branded loading screen.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthProvider>
        <ToastProvider>
        <GuestGateProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="product/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="user/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="conversation/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="conversation/new"
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="auth/login"
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="profile/edit"
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="settings"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="news"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ratings"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="invoice/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="payment/[id]"
            options={{ headerShown: false, presentation: 'modal' }}
          />
        </Stack>
        <OfflineBanner />
        </GuestGateProvider>
        </ToastProvider>
      </AuthProvider>
      </PersistQueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds native crash, touch-event, and performance instrumentation
// around the root. No-ops (returns the component unchanged) without a DSN.
export default wrapWithSentry(RootLayout);
