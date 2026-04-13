import { View, Text, FlatList, Pressable, SafeAreaView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ListingCard } from '@/components/ListingCard';
import type { User, Listing } from '@/types';

// TODO: fetch from Supabase by id
const MOCK_USER: User = {
  id: 'u1',
  username: 'sara_fashion',
  avatar_url: null,
  full_name: 'Sara Ahmed',
  bio: 'Fashion lover from Karachi 🇵🇰 Selling pre-loved Zara, H&M, Khaadi.',
  location: 'Karachi',
  rating: 4.8,
  total_sales: 34,
  created_at: '',
};

const MOCK_LISTINGS: Listing[] = [];

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams();
  const user = MOCK_USER;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FlatList
        data={MOCK_LISTINGS}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 12 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Profile */}
            <View className="px-4 py-4 border-b border-gray-100">
              <View className="flex-row items-center">
                <View className="w-16 h-16 rounded-full bg-gray-200 items-center justify-center mr-4">
                  <Feather name="user" size={28} color="#9ca3af" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-gray-900">{user.full_name}</Text>
                  <Text className="text-sm text-gray-500">@{user.username}</Text>
                  <View className="flex-row items-center mt-1">
                    <Feather name="map-pin" size={11} color="#9ca3af" />
                    <Text className="text-xs text-gray-500 ml-1">{user.location}</Text>
                  </View>
                </View>
              </View>

              {user.bio && (
                <Text className="text-sm text-gray-600 mt-3">{user.bio}</Text>
              )}
            </View>

            {/* Stats */}
            <View className="flex-row border-b border-gray-100">
              {[
                { label: 'Listings', value: MOCK_LISTINGS.length },
                { label: 'Sales', value: user.total_sales },
                { label: 'Rating', value: user.rating.toFixed(1) },
              ].map((stat, i) => (
                <View key={i} className="flex-1 items-center py-3">
                  <Text className="text-base font-bold text-gray-900">{stat.value}</Text>
                  <Text className="text-xs text-gray-500">{stat.label}</Text>
                </View>
              ))}
            </View>

            <Text className="text-sm font-semibold text-gray-900 px-4 mt-4 mb-2">Listings</Text>
          </View>
        }
        renderItem={({ item }) => <ListingCard listing={item} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}
