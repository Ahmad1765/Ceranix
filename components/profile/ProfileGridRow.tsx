// ─────────────────────────────────────────────────────────────────────────────
// PROFILE GRID ROW (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View } from 'react-native';
import { ListingCard } from '@/components/ListingCard';
import type { Listing } from '@/types';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;

type ProfileGridRowProps = {
  row: Listing[];
  columns: number;
  cardW: number;
};

export const ProfileGridRow = memo(function ProfileGridRow({
  row,
  columns,
  cardW,
}: ProfileGridRowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: GRID_GAP,
        paddingHorizontal: HORIZONTAL_PAD,
        marginBottom: GRID_GAP,
      }}
    >
      {row.map((listing) => (
        <View key={listing.id} style={{ width: cardW }}>
          <ListingCard listing={listing} width={cardW} />
        </View>
      ))}
      {row.length < columns &&
        Array.from({ length: columns - row.length }).map((_, i) => (
          <View key={`pad-${i}`} style={{ width: cardW }} />
        ))}
    </View>
  );
});
