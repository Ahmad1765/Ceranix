import { View, Text, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, radii } from '@/lib/theme';
import type { Category } from '@/types';

const CATEGORIES: { label: string; value: Category; icon: keyof typeof Feather.glyphMap; accent: string }[] = [
  { label: 'Clothing', value: 'clothing', icon: 'shopping-bag', accent: '#f1edff' },
  { label: 'Shoes', value: 'shoes', icon: 'compass', accent: '#fef9c3' },
  { label: 'Bags', value: 'bags', icon: 'briefcase', accent: '#fce7f3' },
  { label: 'Accessories', value: 'accessories', icon: 'watch', accent: '#dbeafe' },
  { label: 'Electronics', value: 'electronics', icon: 'monitor', accent: '#e0f2fe' },
  { label: 'Beauty', value: 'beauty', icon: 'droplet', accent: '#fae8ff' },
];

export function CategoryRow() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
    >
      {CATEGORIES.map((cat) => (
        <Pressable
          key={cat.value}
          onPress={() => router.push('/(tabs)/discover' as any)}
          style={({ pressed }) => ({
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radii.xl,
              backgroundColor: cat.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={cat.icon} size={20} color={colors.ink} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, marginTop: 6 }}>
            {cat.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
