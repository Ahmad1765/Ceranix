import { View, Text, Pressable, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export default function RatingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="mr-4">
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-gray-900">Ratings</Text>
      </View>

      {/* Rating summary card */}
      <View className="mx-4 mt-4 bg-gray-50 rounded-2xl p-4 flex-row items-center">
        <View className="w-12 h-12 rounded-full bg-red-100 items-center justify-center mr-4">
          <Feather name="heart" size={24} color="#ef4444" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900">0 qty.</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            Ratings can help provide an overview of the seller
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
