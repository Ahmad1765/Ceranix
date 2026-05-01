import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Asset } from 'expo-asset';
import { Ionicons, Feather } from '@expo/vector-icons';

SplashScreen.preventAutoHideAsync();

async function preloadAssets() {
  await Promise.all([
    // Bundle all icon fonts
    Font.loadAsync({
      ...Ionicons.font,
      ...Feather.font,
    }),
    // Bundle local image assets
    Asset.loadAsync([
      require('../assets/images/icon.png'),
      require('../assets/images/splash.png'),
      require('../assets/images/adaptive-icon.png'),
      require('../assets/images/favicon.png'),
    ]),
  ]);
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    preloadAssets()
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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="product/[id]"
          options={{ headerShown: true, title: '', headerBackTitle: '' }}
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
      </Stack>
    </GestureHandlerRootView>
  );
}
