import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Listing } from '@/types';
import {
  BUNDLE_TIERS,
  computeBundlePricing,
  BRAND_PURPLE,
  HAIRLINE,
} from './shared';
import { useTheme } from '@/context/ThemeContext';

export function BundleProgressBar({
  listing,
  sellerItems,
  selectedIds,
  onPress,
}: {
  listing: Listing;
  sellerItems: Listing[];
  selectedIds: Set<string>;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const selectedItems = sellerItems.filter((s) => selectedIds.has(s.id));
  const { itemCount, pct, qualifies, progress, nextTier } = computeBundlePricing(
    listing.price,
    selectedItems.map((s) => Number(s.price ?? 0)),
  );
  const maxPct = BUNDLE_TIERS[BUNDLE_TIERS.length - 1].pct;
  const remaining = nextTier ? nextTier.count - itemCount : 0;

  const headline = qualifies ? `${pct}% bundle discount applied` : `Bundle & save up to ${maxPct}%`;
  const guidance = nextTier
    ? `Add ${remaining} more ${remaining === 1 ? 'item' : 'items'} to save ${nextTier.pct}%`
    : qualifies
      ? 'Maximum discount reached'
      : `${sellerItems.length} more from @${listing.seller.username}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${guidance}. Opens the bundle builder.`}
      style={({ pressed }) => ({
        marginHorizontal: 16,
        backgroundColor: theme.surface,
        borderRadius: 16,
        borderWidth: HAIRLINE,
        borderColor: theme.border,
        paddingHorizontal: 14,
        paddingVertical: 14,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: 'rgba(108,71,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="pricetags" size={15} color={BRAND_PURPLE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '800', color: theme.ink, letterSpacing: -0.2 }}
            numberOfLines={1}
          >
            {headline}
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: qualifies ? BRAND_PURPLE : theme.mute,
              fontWeight: qualifies ? '700' : '500',
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {guidance}
          </Text>
        </View>
        <Feather name="chevron-down" size={18} color={theme.mute} />
      </View>

      {/* Threshold track — distinct from the image pagination dots: a filled
          purple bar with a pip at each discount tier. */}
      <View style={{ height: 6, borderRadius: 99, backgroundColor: theme.panel, position: 'relative' }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            backgroundColor: BRAND_PURPLE,
            borderRadius: 99,
          }}
        />
        {BUNDLE_TIERS.map((tier, i) => {
          // Endpoints are implied by the bar's start/end; only render the
          // intermediate discount rungs as pips.
          if (i === 0 || i === BUNDLE_TIERS.length - 1) return null;
          const reached = itemCount >= tier.count;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: `${(i / (BUNDLE_TIERS.length - 1)) * 100}%`,
                top: 0,
                width: 6,
                height: 6,
                marginLeft: -3,
                borderRadius: 3,
                backgroundColor: reached ? theme.white : theme.border,
              }}
            />
          );
        })}
      </View>
    </Pressable>
  );
}
