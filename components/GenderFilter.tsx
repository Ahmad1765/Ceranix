import { View, Text, Pressable, ScrollView } from 'react-native';
import type { Gender } from '@/types';

const FILTERS: { label: string; value: Gender }[] = [
  { label: 'All', value: 'all' },
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Unisex', value: 'unisex' },
];

interface Props {
  selected: Gender;
  onChange: (gender: Gender) => void;
}

export function GenderFilter({ selected, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="px-4"
      contentContainerStyle={{ gap: 8 }}
    >
      {FILTERS.map((f) => (
        <Pressable
          key={f.value}
          onPress={() => onChange(f.value)}
          className={`px-4 py-1.5 rounded-full border ${
            selected === f.value
              ? 'bg-primary border-primary'
              : 'bg-surface border-ink-hair'
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              selected === f.value ? 'text-white' : 'text-ink'
            }`}
          >
            {f.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
