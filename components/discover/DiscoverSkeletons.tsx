// ─────────────────────────────────────────────────────────────────────────────
// DISCOVER SKELETONS & ROW VIRTUALIZATION
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Preserving Visual Weight During Async Transitions
// Skeleton placeholders replicate the exact physical dimensions and padding of the
// loaded content cards (avatar discs, 4:5 cards, aesthetics tags) to eliminate
// Cumulative Layout Shift (CLS) during network fetches.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { colors, radii } from '@/lib/theme';
import { ListingCard } from '@/components/ListingCard';
import type { Listing } from '@/types';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const RAIL_CARD_WIDTH = 160;

export function PeopleSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 18 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.divider }} />
          <View style={{ flex: 1, gap: 7 }}>
            <View style={{ width: '45%', height: 12, borderRadius: 6, backgroundColor: colors.divider }} />
            <View style={{ width: '30%', height: 10, borderRadius: 5, backgroundColor: colors.divider }} />
          </View>
          <View style={{ width: 76, height: 32, borderRadius: radii.pill, backgroundColor: colors.divider }} />
        </View>
      ))}
    </View>
  );
}

export function BrandsSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 14, marginTop: 10 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ height: 250, borderRadius: radii['3xl'], backgroundColor: colors.divider }} />
      ))}
    </View>
  );
}

export function AestheticsSkeleton() {
  const { width: winWidth } = useWindowDimensions();
  const tileWidth = (winWidth - 16 * 2 - 10) / 2;
  return (
    <View style={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{ width: tileWidth, height: 95, borderRadius: radii.xl, backgroundColor: colors.divider }} />
      ))}
    </View>
  );
}

export function SkeletonTile({ width }: { width: number }) {
  return (
    <View style={{ width }}>
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: radii.md,
          backgroundColor: colors.divider,
        }}
      />
    </View>
  );
}

export function RailSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: GRID_GAP, paddingHorizontal: HORIZONTAL_PAD }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonTile key={i} width={RAIL_CARD_WIDTH} />
      ))}
    </View>
  );
}

export function GridSkeleton({ columns, cardW }: { columns: number; cardW: number }) {
  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}>
      {Array.from({ length: 2 }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: GRID_GAP }}>
          {Array.from({ length: columns }).map((_, i) => (
            <SkeletonTile key={i} width={cardW} />
          ))}
        </View>
      ))}
    </View>
  );
}

type DiscoverGridRowProps = {
  row: Listing[];
  columns: number;
  cardW: number;
};

export const DiscoverGridRow = memo(function DiscoverGridRow({
  row,
  columns,
  cardW,
}: DiscoverGridRowProps) {
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
