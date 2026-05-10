import { View, Text, Pressable, ScrollView, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';

const SETTINGS_SECTIONS = [
  {
    title: 'My profile',
    subtitle: 'Update profile image, username & describe your shop',
    icon: 'user',
    iconBg: '#f3f4f6',
    iconColor: '#374151',
    route: '/profile/edit',
  },
  {
    title: 'Purchases & Sales',
    subtitle: 'My shop, promotions & discounts',
    icon: 'shopping-bag',
    iconBg: '#111827',
    iconColor: '#ffffff',
    route: null,
  },
  {
    title: 'Verification, payouts & shipping',
    subtitle: 'Settings for purchases & sales',
    icon: 'settings',
    iconBg: '#111827',
    iconColor: '#ffffff',
    route: null,
  },
  {
    title: 'Enhance the experience',
    subtitle: 'Personalization, badges & subscriptions',
    icon: 'sliders',
    iconBg: '#111827',
    iconColor: '#ffffff',
    route: null,
  },
  {
    title: 'Manage account',
    subtitle: 'Account settings',
    icon: 'user',
    iconBg: '#111827',
    iconColor: '#ffffff',
    route: null,
  },
  {
    title: 'Help center',
    subtitle: 'Support & guides',
    icon: 'message-circle',
    iconBg: '#111827',
    iconColor: '#ffffff',
    route: null,
  },
] as const;

export default function SettingsScreen() {
  const { signOut, session } = useAuth();

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 bg-white border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="mr-4">
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text className="text-base font-semibold text-gray-900">Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Profile card */}
        <View className="bg-white rounded-2xl overflow-hidden mb-4">
          <Pressable
            className="flex-row items-center px-4 py-4"
            onPress={() => router.push('/profile/edit')}
          >
            <View className="w-12 h-12 rounded-full bg-gray-200 items-center justify-center mr-3">
              <Feather name="user" size={22} color="#9ca3af" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-gray-900">My profile</Text>
              <Text className="text-xs text-gray-500 mt-0.5">Update profile image, username & describe your shop</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#9ca3af" />
          </Pressable>
        </View>

        {/* Other settings - each in own card */}
        {SETTINGS_SECTIONS.slice(1).map((item, i) => (
          <View key={i} className="bg-white rounded-2xl overflow-hidden mb-3">
            <Pressable
              className="flex-row items-center px-4 py-4"
              onPress={() => {
                if (item.route) router.push(item.route as any);
              }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: item.iconBg }}
              >
                <Feather name={item.icon as any} size={18} color={item.iconColor} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-900">{item.title}</Text>
                <Text className="text-xs text-gray-500 mt-0.5">{item.subtitle}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
          </View>
        ))}

        {/* Log out */}
        {session && (
          <Pressable
            onPress={handleLogout}
            className="bg-gray-900 rounded-2xl py-4 items-center mb-3"
          >
            <Text className="text-white font-bold text-base">Log out</Text>
          </Pressable>
        )}

        <Text className="text-center text-xs text-gray-400">Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
