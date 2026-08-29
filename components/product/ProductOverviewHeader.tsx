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
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import {
  BRAND_PURPLE,
  conditionLabel,
  tap,
  timeAgo,
} from '@/components/product/shared';
import type { Listing } from '@/types';

type ProductOverviewHeaderProps = {
  listing: Listing;
  bpFee: number;
  onOpenBpSheet: () => void;
};

export const ProductOverviewHeader = memo(function ProductOverviewHeader({
  listing,
  bpFee,
  onOpenBpSheet,
}: ProductOverviewHeaderProps) {
  const { theme } = useTheme();
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
                    router.push(`/discover?q=${encodeURIComponent(s.text)}` as any);
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
            fontSize: 22,
            fontFamily: 'Inter_700Bold',
            color: theme.ink,
            letterSpacing: -0.4,
          }}
        >
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        {bpFee > 0 ? (
          <Pressable
            onPress={() => { tap('selection'); onOpenBpSheet(); }}
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
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: theme.mute }}>
              +{formatPrice(bpFee)} Buyer Protection fee
              {/* {BUYER_PROTECTION_MODE === 'percentage'
                ? ` (${BUYER_PROTECTION_PERCENTAGE}%)`
                : ''} */}
            </Text>
            {/* Shield icon matching the reference — purple circle + shield outline + checkmark */}
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Circle cx="12" cy="12" r="12" fill="#F2F3FE" />
              <Path
                d="M12.033 6.80005C12.033 6.80005 9.1033 8.22413 6.2 8.22413V8.39167C6.2 9.22937 6.24402 10.0252 6.35408 10.7582C6.68425 13.2294 7.58671 15.1561 9.08349 16.7686C9.1055 16.7896 9.12751 16.8315 9.14952 16.8524C9.74383 17.4807 10.4042 17.9833 11.0865 18.3812C11.2846 18.5069 12.011 18.8 12.011 18.8C12.011 18.8 12.7374 18.5069 12.9355 18.3812C13.6398 18.0042 14.2782 17.4807 14.8725 16.8524L14.9385 16.7686C15.9731 15.6587 16.7214 14.3812 17.1837 12.8943C17.4038 12.2241 17.5138 11.533 17.6239 10.7582C17.712 10.0252 17.8 9.22937 17.8 8.39167V8.22413C14.9671 8.22413 12.033 6.80005 12.033 6.80005Z"
                stroke="#5356EE"
              />
              <Path
                d="M9.39999 12.0127L11.332 13.8001L15 10.4001"
                stroke="#5356EE"
                strokeLinecap="round"
              />
            </Svg>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
