import { Tabs } from 'expo-router';
import { AnimatedTabBar } from '../../components/AnimatedTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="feed" options={{ title: 'My Feed' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      {/* Wardrobe tab hidden 2026-07-04. Route file app/(tabs)/wardrobe.tsx is untouched.
          To restore: swap options back to { title: 'Wardrobe' }. */}
      <Tabs.Screen name="wardrobe" options={{ href: null }} />
      <Tabs.Screen name="upload" options={{ title: 'Sell' }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'My profile' }} />
    </Tabs>
  );
}
