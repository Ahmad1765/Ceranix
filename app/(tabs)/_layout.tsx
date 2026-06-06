import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TabOrb } from '../../components/TabOrb';

// Pure-View icon — no font load, no SVG. Mirrors MCI `view-dashboard`
// (asymmetric 2×2 of rounded squares: large/small/small/large).
function MyFeedIcon({ size, color }: { size: number; color: string }) {
  const big = size * 0.46;
  const small = size * 0.32;
  const radiusBig = big * 0.22;
  const radiusSmall = small * 0.22;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: big, height: big, borderRadius: radiusBig, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: 0, right: 0, width: small, height: small, borderRadius: radiusSmall, backgroundColor: color }} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, width: small, height: small, borderRadius: radiusSmall, backgroundColor: color }} />
      <View style={{ position: 'absolute', bottom: 0, right: 0, width: big, height: big, borderRadius: radiusBig, backgroundColor: color }} />
    </View>
  );
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0F0F0F',
        tabBarInactiveTintColor: 'rgba(15,15,15,0.45)',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          elevation: 3,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          height: 65 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color, size }) => (
            <View className="items-center justify-center relative">
              {focused && <TabOrb />}
              <Feather name="home" size={24} color={focused ? "#0F0F0F" : "rgba(15,15,15,0.45)"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'My Feed',
          tabBarIcon: ({ focused, color, size }) => (
            <View className="items-center justify-center relative">
              {focused && <TabOrb />}
              <MyFeedIcon size={22} color={focused ? "#0F0F0F" : "rgba(15,15,15,0.45)"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused, color, size }) => (
            <View className="items-center justify-center relative">
              {focused && <TabOrb />}
              <Feather name="search" size={24} color={focused ? "#0F0F0F" : "rgba(15,15,15,0.45)"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Upload ad',
          tabBarIcon: ({ focused, color, size }) => (
            <View className="items-center justify-center relative">
              {focused && <TabOrb />}
              <Feather name="plus-circle" size={24} color={focused ? "#0F0F0F" : "rgba(15,15,15,0.45)"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          href: null,
        }}
      />


      <Tabs.Screen
        name="profile"
        options={{
          title: 'My profile',
          tabBarIcon: ({ focused, color, size }) => (
            <View className="items-center justify-center relative">
              {focused && <TabOrb />}
              <Feather name="smile" size={24} color={focused ? "#0F0F0F" : "rgba(15,15,15,0.45)"} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
