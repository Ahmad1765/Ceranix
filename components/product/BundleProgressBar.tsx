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
  onPress?: () => void;
}) {
  const { theme, isDark } = useTheme();
  const selectedItems = sellerItems.filter((s) => selectedIds.has(s.id));
  const { itemCount, pct, qualifies, progress, nextTier } = computeBundlePricing(
    listing.price,
    selectedItems.map((s) => Number(s.price ?? 0)),
  );
  const maxPct = BUNDLE_TIERS[BUNDLE_TIERS.length - 1].pct;
  const remaining = nextTier ? nextTier.count - itemCount : 0;

  const headline = qualifies
    ? `${pct}% bundle discount unlocked!`
    : `Bundle & save up to ${maxPct}%`;

  const guidance = nextTier
    ? `Add ${remaining} more ${remaining === 1 ? 'item' : 'items'} to save ${nextTier.pct}%`
    : qualifies
      ? 'Maximum discount reached for this order'
      : sellerItems.length > 0
        ? 'Select items below to unlock discounts'
        : `@${listing.seller.username} has 1 item listed`;

  // High-contrast, theme-aware background colors for the track
  const trackBgColor = isDark ? 'rgba(255, 255, 255, 0.14)' : '#E5E7EB';
  const trackBorderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const unreachedPipBg = isDark ? '#2C2C2E' : '#D1D5DB';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${guidance}.`}
      style={({ pressed }) => ({
        marginHorizontal: 16,
        backgroundColor: theme.white,
        borderRadius: 18,
        borderWidth: HAIRLINE,
        borderColor: theme.border,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 14,
        opacity: pressed && onPress ? 0.92 : 1,
      })}
    >
      {/* Header Info */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: qualifies ? BRAND_PURPLE : 'rgba(108,71,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name="pricetags"
            size={18}
            color={qualifies ? '#FFFFFF' : BRAND_PURPLE}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: '800',
              color: theme.ink,
              letterSpacing: -0.2,
            }}
          >
            {headline}
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: qualifies ? BRAND_PURPLE : theme.mute,
              fontWeight: qualifies ? '700' : '500',
              marginTop: 2,
              lineHeight: 17,
            }}
          >
            {guidance}
          </Text>
        </View>
      </View>

      {/* Visible Progress Bar Track Container */}
      <View style={{ marginTop: 4, marginBottom: 8, paddingHorizontal: 4 }}>
        {/* The Track with visible background & border */}
        <View
          style={{
            height: 8,
            borderRadius: 999,
            backgroundColor: trackBgColor,
            borderWidth: 1,
            borderColor: trackBorderColor,
            position: 'relative',
            justifyContent: 'center',
          }}
        >
          {/* Filled Progress Segment */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.max(0, Math.min(100, progress * 100))}%`,
              backgroundColor: BRAND_PURPLE,
              borderRadius: 999,
            }}
          />

          {/* Tier Milestone Step Markers (Pips) */}
          {BUNDLE_TIERS.map((tier, i) => {
            const reached = itemCount >= tier.count;
            const isCurrent = itemCount === tier.count;
            const positionPct = (i / (BUNDLE_TIERS.length - 1)) * 100;

            return (
              <View
                key={tier.count}
                style={{
                  position: 'absolute',
                  left: `${positionPct}%`,
                  width: 14,
                  height: 14,
                  marginLeft: -7,
                  borderRadius: 7,
                  backgroundColor: reached
                    ? BRAND_PURPLE
                    : isCurrent
                      ? theme.white
                      : unreachedPipBg,
                  borderWidth: 2.5,
                  borderColor: reached || isCurrent ? BRAND_PURPLE : theme.white,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                {reached && tier.pct > 0 ? (
                  <Feather name="check" size={8} color="#FFFFFF" />
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Milestone Labels below the Track */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 10,
          }}
        >
          {BUNDLE_TIERS.map((tier) => {
            const reached = itemCount >= tier.count;
            const isNext = nextTier?.count === tier.count;

            return (
              <View
                key={tier.count}
                style={{
                  alignItems: 'center',
                  minWidth: 44,
                }}
              >
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: reached ? '800' : isNext ? '700' : '600',
                    color: reached
                      ? BRAND_PURPLE
                      : isNext
                        ? theme.ink
                        : theme.mute,
                  }}
                >
                  {tier.pct === 0 ? '1 item' : `${tier.pct}% OFF`}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: reached ? '700' : '500',
                    color: reached
                      ? BRAND_PURPLE
                      : isNext
                        ? theme.ink
                        : theme.muteSoft ?? theme.mute,
                    marginTop: 1,
                  }}
                >
                  {tier.count === 1
                    ? 'Base'
                    : tier.count === 5
                      ? '5+ items'
                      : `${tier.count} items`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
}
