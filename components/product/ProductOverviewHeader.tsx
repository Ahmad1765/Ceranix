// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT OVERVIEW HEADER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Clean Title, Meta & Price Hierarchy
// Renders the product title, like counts, category/brand metadata, price and
// buyer protection fee badge directly beneath the hero image.
// ─────────────────────────────────────────────────────────────────────────────

import { memo, useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import {
  BRAND_PURPLE,
  conditionLabel,
  tap,
  timeAgo,
} from '@/components/product/shared';
import { BUNDLE_TIERS } from '@/lib/bundle';
import type { Listing } from '@/types';

type ProductOverviewHeaderProps = {
  listing: Listing;
  bpFee: number;
  onOpenBpSheet: () => void;
  hasBundleItems?: boolean;
  onScrollToBundle?: () => void;
};

export const ProductOverviewHeader = memo(function ProductOverviewHeader({
  listing,
  bpFee,
  onOpenBpSheet,
  hasBundleItems = false,
  onScrollToBundle,
}: ProductOverviewHeaderProps) {
  const { theme, isDark } = useTheme();
  const heartCount = Math.max(0, Number(listing.likes ?? 0));
  const itemPrice = Number(listing.price ?? 0);

  // Metadata segments (only non-empty values)
  const metaSegments = useMemo(() => {
    const cond = conditionLabel(listing.condition);
    const uploaded = listing.created_at ? timeAgo(listing.created_at) : '';
    const sizeVal = listing.size?.trim();
    const brandVal = listing.brand?.trim();
    const locationVal = listing.seller?.location?.trim();

    return [
      sizeVal ? { text: `Size ${sizeVal}` } : null,
      cond ? { text: cond } : null,
      brandVal ? { text: brandVal, link: true } : null,
      locationVal ? { text: locationVal } : null,
      uploaded ? { text: `Uploaded ${uploaded}` } : null,
    ].filter(Boolean) as { text: string; link?: boolean }[];
  }, [listing.size, listing.condition, listing.brand, listing.seller?.location, listing.created_at]);

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 14 }}>
      {heartCount > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
          <Feather name="heart" size={12} color={theme.mute} />
          <Text style={{ fontSize: 12, color: theme.mute, fontFamily: 'Inter_500Medium' }}>
            Liked by <Text style={{ fontFamily: 'Inter_700Bold', color: theme.ink }}>{heartCount} {heartCount === 1 ? 'person' : 'people'}</Text>
          </Text>
        </View>
      )}

      <Text
        style={{
          fontSize: 28,
          fontFamily: 'Inter_700Bold',
          color: theme.ink,
          lineHeight: 33,
          letterSpacing: -0.7,
        }}
        numberOfLines={2}
      >
        {listing.title}
      </Text>

      {metaSegments.length > 0 && (
        <Text
          numberOfLines={2}
          style={{ marginTop: 10, fontSize: 14, lineHeight: 20, color: theme.mute, fontFamily: 'Inter_500Medium' }}
        >
          {metaSegments.map((s, i) => (
            <Text key={i}>
              {i > 0 ? <Text style={{ color: theme.muteSoft }}>{' · '}</Text> : null}
              {s.link ? (
                <Text
                  style={{
                    color: BRAND_PURPLE,
                    fontFamily: 'Inter_600SemiBold',
                    textDecorationLine: 'underline',
                  }}
                  accessibilityRole="link"
                  accessibilityLabel={`Shop more from ${s.text}`}
                  onPress={() => {
                    tap('selection');
                    router.push(`/?q=${encodeURIComponent(s.text)}` as any);
                  }}
                >
                  {s.text}
                </Text>
              ) : (
                s.text
              )}
            </Text>
          ))}
        </Text>
      )}

      <View style={{ marginTop: 18 }}>
        <Text
          style={{
            fontSize: 28,
            fontFamily: 'Inter_700Bold',
            color: theme.ink,
            lineHeight: 34,
            letterSpacing: -0.6,
          }}
        >
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        {bpFee > 0 ? (
          <Pressable
            onPress={() => {
              tap('selection');
              onOpenBpSheet();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Plus ${formatPrice(bpFee)} Buyer Protection fee. See the breakdown.`}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
              alignSelf: 'flex-start',
              minHeight: 28,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontSize: 15, fontFamily: 'Inter_400Regular', color: theme.ink }}>
              +{formatPrice(bpFee)} Buyer Protection fee
            </Text>
            <ShieldCheckIcon size={22} />
          </Pressable>
        ) : null}

        {hasBundleItems && (
          <Pressable
            onPress={() => {
              tap('selection');
              onScrollToBundle?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Up to ${BUNDLE_TIERS[BUNDLE_TIERS.length - 1].pct}% off when you bundle items from this seller`}
            style={({ pressed }) => ({
              backgroundColor: isDark ? 'rgba(83, 86, 238, 0.16)' : '#F2F3FE',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              marginTop: 14,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                fontFamily: 'Inter_400Regular',
                color: theme.ink,
              }}
            >
              Up to{' '}
              <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#5356EE' }}>
                {BUNDLE_TIERS[BUNDLE_TIERS.length - 1].pct}% off
              </Text>{' '}
              when you bundle items from this seller
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});
