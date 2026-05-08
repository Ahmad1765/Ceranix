import '../global.css';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Asset } from 'expo-asset';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // On web: don't block render — fonts load via CSS @font-face in background
      Font.loadAsync({ ...Ionicons.font, ...Feather.font, ...MaterialCommunityIcons.font }).catch(console.warn);
      setReady(true);
      SplashScreen.hideAsync();
      return;
    }

    // On native: preload fonts + local image assets before first paint
    Promise.all([
      Font.loadAsync({ ...Ionicons.font, ...Feather.font, ...MaterialCommunityIcons.font }),
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
