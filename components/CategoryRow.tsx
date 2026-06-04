import { View, Text, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, radii } from '@/lib/theme';
import type { Category } from '@/types';

const CATEGORIES: { label: string; value: Category; icon: keyof typeof Feather.glyphMap; accent: string }[] = [
  { label: 'Clothing', value: 'clothing', icon: 'shopping-bag', accent: colors.primarySoft },
  { label: 'Shoes', value: 'shoes', icon: 'compass', accent: colors.panel },
  { label: 'Bags', value: 'bags', icon: 'briefcase', accent: colors.primarySoft },
  { label: 'Accessories', value: 'accessories', icon: 'watch', accent: colors.panel },
  { label: 'Electronics', value: 'electronics', icon: 'monitor', accent: colors.primarySoft },
  { label: 'Beauty', value: 'beauty', icon: 'droplet', accent: colors.panel },
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
          onPress={() => router.push({ pathname: '/(tabs)/discover', params: { category: cat.value } } as any)}
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
