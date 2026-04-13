import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
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
        name="nybegagnat"
        options={{
          title: 'Nybegagnat',
          tabBarIcon: ({ focused, color, size }) => (
            <View className="items-center justify-center relative">
              {focused && (
                <View className="absolute bg-[#e4ff3a] rounded-full w-10 h-10 blur-xl opacity-80" style={{ shadowColor: '#e4ff3a', shadowOpacity: 1, shadowRadius: 15, elevation: 10 }} />
              )}
              <View className="relative">
                <Feather name="smartphone" size={24} color={focused ? "#000" : "#666"} />
                <View className="absolute -top-1 -right-1 bg-white rounded-full">
                  <Feather name="check-circle" size={12} color="#4f46e5" />
                </View>
              </View>
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
