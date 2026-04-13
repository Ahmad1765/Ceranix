import { View, Text, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { Category } from '@/types';

const CATEGORIES: { label: string; value: Category; icon: string }[] = [
  { label: 'Clothing', value: 'clothing', icon: 'tag' },
  { label: 'Shoes', value: 'shoes', icon: 'package' },
  { label: 'Bags', value: 'bags', icon: 'shopping-bag' },
  { label: 'Accessories', value: 'accessories', icon: 'watch' },
  { label: 'Electronics', value: 'electronics', icon: 'smartphone' },
  { label: 'Beauty', value: 'beauty', icon: 'star' },
];

export function CategoryRow() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="px-4"
      contentContainerStyle={{ gap: 12 }}
    >
      {CATEGORIES.map((cat) => (
        <Pressable
          key={cat.value}
          onPress={() => router.push({ pathname: '/search', params: { category: cat.value } })}
          className="items-center"
        >
          <View className="w-14 h-14 bg-orange-50 rounded-2xl items-center justify-center">
            <Feather name={cat.icon as any} size={22} color="#f97316" />
          </View>
          <Text className="text-xs text-gray-600 mt-1.5">{cat.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
