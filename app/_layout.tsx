import '../global.css';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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

export default function RootLayout() {
  const [ready, setReady] = useState(false);

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
