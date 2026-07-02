import { Text, Pressable, ScrollView } from 'react-native';
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
          className={`px-5 py-2 rounded-full border ${
            selected === f.value
              ? 'bg-primary-soft border-primary'
              : 'bg-surface border-[#E5E5E5]'
          }`}
        >
          <Text
            className={`text-[15px] font-medium ${
              selected === f.value ? 'text-ink' : 'text-ink-mute'
            }`}
          >
            {f.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
