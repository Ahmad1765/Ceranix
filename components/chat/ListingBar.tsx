// The listing a thread is about, pinned to the bottom of the screen just above
// the composer.
//
// It sits at the bottom rather than under the header on purpose: it's the
// thing you look at while you type a price, and at the top it scrolls out of
// mind exactly when the negotiation starts. Plick anchors it the same way.

import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { ListingThumb, type ListingStatus } from './ListingThumb';

export function ListingBar({
  title,
  price,
  thumb,
  status,
  onPress,
}: {
  title: string;
  price: number | null;
  thumb: string | null;
  status: ListingStatus;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open listing ${title}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: pressed ? theme.panel : theme.surface,
      })}
    >
      <ListingThumb uri={thumb} width={52} height={44} status={status} radius={radii.sm} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 13.5,
            letterSpacing: -0.15,
            color: theme.ink,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.family.sans,
            fontSize: 12,
            color: theme.mute,
            marginTop: 2,
          }}
        >
          {status === 'removed'
            ? 'No longer available'
            : `Current price: ${price != null ? formatPrice(price) : '—'}`}
        </Text>
      </View>

      <Feather name="chevron-right" size={18} color={theme.muteSoft} />
    </Pressable>
  );
}
