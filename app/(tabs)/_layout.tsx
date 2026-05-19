import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';

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
        tabBarActiveTintColor: '#000000',
        tabBarInactiveTintColor: '#000000',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
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
              {focused && (
                <View className="absolute bg-[#e4ff3a] rounded-full w-10 h-10 blur-xl opacity-80" style={{ shadowColor: '#e4ff3a', shadowOpacity: 1, shadowRadius: 15, elevation: 10 }} />
              )}
              <Feather name="home" size={24} color={focused ? "#000" : "#666"} style={{fontWeight: focused ? 'bold' : 'normal'}} />
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
              {focused && (
                <View className="absolute bg-[#e4ff3a] rounded-full w-10 h-10 blur-xl opacity-80" style={{ shadowColor: '#e4ff3a', shadowOpacity: 1, shadowRadius: 15, elevation: 10 }} />
              )}
              <MyFeedIcon size={22} color={focused ? "#000" : "#666"} />
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
              {focused && (
                <View className="absolute bg-[#e4ff3a] rounded-full w-10 h-10 blur-xl opacity-80" style={{ shadowColor: '#e4ff3a', shadowOpacity: 1, shadowRadius: 15, elevation: 10 }} />
              )}
              <Feather name="search" size={24} color={focused ? "#000" : "#666"} strokeWidth={focused ? 3 : 2} />
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
              {focused && (
                <View className="absolute bg-[#e4ff3a] rounded-full w-10 h-10 blur-xl opacity-80" style={{ shadowColor: '#e4ff3a', shadowOpacity: 1, shadowRadius: 15, elevation: 10 }} />
              )}
              <Feather name="plus-circle" size={24} color={focused ? "#000" : "#666"} strokeWidth={focused ? 2 : 1.5} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused, color, size }) => (
            <View className="items-center justify-center relative">
              {focused && (
                <View className="absolute bg-[#e4ff3a] rounded-full w-10 h-10 blur-xl opacity-80" style={{ shadowColor: '#e4ff3a', shadowOpacity: 1, shadowRadius: 15, elevation: 10 }} />
              )}
              <Feather name="message-circle" size={24} color={focused ? "#000" : "#666"} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />


      <Tabs.Screen
        name="profile"
        options={{
          title: 'My profile',
          tabBarIcon: ({ focused, color, size }) => (
            <View className="items-center justify-center relative">
              {focused && (
                <View className="absolute bg-[#e4ff3a] rounded-full w-10 h-10 blur-xl opacity-80" style={{ shadowColor: '#e4ff3a', shadowOpacity: 1, shadowRadius: 15, elevation: 10 }} />
              )}
              <Feather name="smile" size={24} color={focused ? "#000" : "#666"} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
