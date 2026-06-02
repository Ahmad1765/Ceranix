import '../global.css';
import { useEffect, useState } from 'react';
import { Platform, TextInput } from 'react-native';
import { installAlertShim } from '@/lib/alertShim';

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
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Asset } from 'expo-asset';
import { Ionicons, Feather } from '@expo/vector-icons';
import {
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_400Regular_Italic,
  Fraunces_700Bold_Italic,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';

const AESTHETIC_FONTS = {
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_400Regular_Italic,
  Fraunces_700Bold_Italic,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
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

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useFocusOutOfAriaHidden();

  useEffect(() => {
    // Icon fonts are tiny — always block first paint on these so glyphs never
    // render as boxes. Aesthetic fonts (Inter/Fraunces) are large; load in
    // background so they don't delay the UI.
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

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <AuthProvider>
        <ToastProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="product/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="user/[id]"
            options={{ headerShown: true, title: '', headerBackTitle: '' }}
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
        </ToastProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
