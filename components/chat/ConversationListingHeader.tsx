// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION LISTING HEADER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Presentational (Dumb) Component
// This component has zero side effects, no network calls, and no local state.
// It receives pure props (listing, prices, callbacks) and purely renders the
// sticky listing context bar. This allows effortless UI testing and reusability.
// ─────────────────────────────────────────────────────────────────────────────

import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii, type as typography } from '@/lib/theme';
import { formatPrice } from '@/lib/currency';
import { buyerProtectionFee } from '@/lib/fees';
import { ThumbButton } from '@/components/ui';
import { ListingThumb, type ListingStatus } from './ListingThumb';
import type { ConversationRow } from '@/lib/chat';

type ConversationListingHeaderProps = {
  listing: ConversationRow['listing'];
  listingId: string | null;
  listingThumb: string | null;
  status: ListingStatus | null;
  isSeller: boolean;
  onPressListing: () => void;
  onPressBuyNow: () => void;
};

export function ConversationListingHeader({
  listing,
  listingId,
  listingThumb,
  status,
  isSeller,
  onPressListing,
  onPressBuyNow,
}: ConversationListingHeaderProps) {
  if (!listingId) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open listing ${listing?.title ?? 'Listing'}`}
      onPress={onPressListing}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: pressed ? colors.panel : colors.surface,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <ListingThumb uri={listingThumb} width={44} height={44} status={status ?? 'active'} radius={radii.sm} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13.5,
              color: colors.ink,
            }}
          >
            {listing?.title ?? 'Listing removed'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 12.5,
                color: colors.ink,
              }}
            >
              {listing?.price != null ? formatPrice(listing.price) : '—'}
            </Text>
            {listing?.price != null && (
              <Text
                style={{
                  fontFamily: typography.family.sans,
                  fontSize: 11.5,
                  color: colors.mute,
                }}
              >
                {`${formatPrice(listing.price + buyerProtectionFee(listing.price))} Includes Buyer Protection 🛡️`}
              </Text>
            )}
          </View>
        </View>
      </View>

      {!isSeller && status === 'active' ? (
        <View style={{ width: 94 }}>
          <ThumbButton
            label="Buy Now"
            variant="primary"
            size="sm"
            onPress={onPressBuyNow}
            accessibilityLabel="Buy now"
          />
        </View>
      ) : (
        <Feather name="chevron-right" size={18} color={colors.muteSoft} />
      )}
    </Pressable>
  );
}
