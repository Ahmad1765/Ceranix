import '../global.css';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { withFontDisplay } from '@/lib/fonts';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_700Bold_Italic } from '@expo-google-fonts/inter/700Bold_Italic';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/queryClient';
import { initOnlineManager } from '@/lib/offline';
import { attachResponseListener, configureNotifications } from '@/lib/notifications';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { GuestGateProvider } from '@/components/GuestGate';
import { SellSheetProvider } from '@/components/sell/SellSheet';
import { DiscoverSheetProvider } from '@/components/discover/DiscoverSheet';
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
// Foreground presentation + the Android notification channel. Never prompts for
// permission — that happens contextually (first conversation) or from Settings.
// No-ops on web.
configureNotifications();

// React-native-web ships Alert.alert as a no-op, so every validation /
// confirm path that calls Alert.alert silently dies on web. The shim swaps
// in a window-backed implementation that honours the standard RN signature.
installAlertShim();

// NOTE: Android's TextInput underline / selection-handle colour is set in
// lib/rnText.tsx, where every app-level TextInput already funnels through.
// It used to be assigned here by mutating `TextInput.defaultProps`, which
// React 19 ignores entirely for function components — so it silently did
// nothing and Android painted the default black underline.

// Both maps are tagged FontDisplay.BLOCK — see lib/fonts.ts for the reasoning.
// Short version: without it the browser paints a fallback face while these are
// still downloading, which showed up as tofu boxes for every icon and as body
// text flashing from the system serif to Inter. BLOCK keeps the glyphs
// invisible until the real file lands. Web-only; native ignores the field.
const ICON_FONTS = withFontDisplay(
  { ...Ionicons.font, ...Feather.font },
  Font.FontDisplay.BLOCK,
);

const AESTHETIC_FONTS = withFontDisplay(
  {
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_700Bold_Italic,
  },
  Font.FontDisplay.BLOCK,
);

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

  // Notification taps → deep link. Mounted here (not at module scope) because
  // routing a tap needs a mounted navigator; this also covers the cold-start
  // case where the tap is what launched the app.
  useEffect(() => attachResponseListener(), []);

  useEffect(() => {
    // Gate first paint on the icon fonts. Note this is a best-effort gate, not
    // a guarantee: the `.finally` below releases it even when loadAsync
    // *rejects*, and it does reject on slow links — Ionicons is 381 KB and
    // FontFaceObserver gives it a fixed 6s. What actually stops boxes from
    // being painted in that case is FontDisplay.BLOCK on ICON_FONTS, not this.
    const iconFonts = Font.loadAsync(ICON_FONTS);
    const interFonts = Font.loadAsync(AESTHETIC_FONTS);

    if (Platform.OS === 'web') {
      // Inter stays off the critical path — 5 weights at ~335 KB each is far
      // too much to hold first paint on. It no longer *flashes* through the
      // system serif on the way in, though: FontDisplay.BLOCK keeps that text
      // invisible until Inter resolves rather than painting the wrong face.
      interFonts.catch(console.warn);
      iconFonts
        .catch(console.warn)
        .finally(() => {
          setReady(true);
          SplashScreen.hideAsync();
        });
      return;
    }

    // Native MUST block on Inter — this is NOT the same tradeoff as web.
    // Android does not repaint a mounted <Text> when a font registers after
    // the fact, so anything painted before Inter resolves keeps rendering in
    // the system font for the life of that view. Releasing the gate early
    // meant the whole app came up in Roboto on Android while web looked right.
    Promise.all([
      iconFonts,
      interFonts,
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
        <SellSheetProvider>
        <DiscoverSheetProvider>
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
        </DiscoverSheetProvider>
        </SellSheetProvider>
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
