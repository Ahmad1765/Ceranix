import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

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
