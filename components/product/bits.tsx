import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND_LIME } from './shared';
import { useTheme } from '@/context/ThemeContext';

export function SectionEyebrow({ label, color }: { label: string; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: BRAND_LIME,
          marginRight: 8,
        }}
      />
      <Text
        style={{
          fontSize: 11,
          fontWeight: '800',
          color: color ?? theme.ink,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? 'star' : 'star-outline'}
          size={14}
          color={i < full ? '#6C47FF' : 'rgba(15,15,15,0.18)'}
        />
      ))}
    </View>
  );
}
