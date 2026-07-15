// LEGACY product-page action bar — the pre-2026-07-15 design, kept verbatim so
// the simplified Plick/Vinted-style bar can be backed out with a one-line import
// swap in app/product/[id].tsx:
//
//   import { ProductActionBar } from '@/components/product/ProductActionBar.legacy';
//
// and restoring the <OfferSheet> call site (components/product/OfferSheet.tsx is
// still on disk and unmodified apart from the removed safety banner).
//
// This bar pairs a small outlined "Offer" button — which opens the OfferSheet
// modal — with a full-width ink "Buy now", under a "Secure checkout" trust line.

import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HAIRLINE, BRAND_INK } from './shared';
import { formatPrice } from '@/lib/currency';

export function ProductActionBar({
  price,
  buyTotal,
  bpFee,
  bottomInset,
  onOfferPress,
  onBuyPress,
}: {
  price: number;
  buyTotal: number;
  bpFee: number;
  bottomInset: number;
  onOfferPress: () => void;
  onBuyPress: () => void;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTopWidth: HAIRLINE,
        borderTopColor: 'rgba(15,15,15,0.08)',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: bottomInset || 16,
        // Soft lift off the content above it. boxShadow renders on iOS + web;
        // Android falls back to the hairline top border.
        boxShadow: '0px -4px 10px rgba(0,0,0,0.05)',
      }}
    >
      {/* Reassurance at the point of decision — answers "is this safe?"
          right where the buyer commits, reinforcing the value proposition. */}
      <View
        accessibilityRole="text"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginBottom: 10,
        }}
      >
        <Feather name="lock" size={12} color="rgba(15,15,15,0.62)" />
        <Text style={{ fontSize: 12, fontWeight: '500', color: 'rgba(15,15,15,0.62)' }}>
          Secure checkout · Buyer Protection included
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Pressable
          onPress={onOfferPress}
          accessibilityRole="button"
          accessibilityLabel="Make an offer"
          accessibilityHint="Opens a sheet to send the seller a price suggestion"
          style={({ pressed }) => ({
            paddingHorizontal: 18,
            height: 52,
            minWidth: 88,
            borderRadius: 14,
            borderWidth: HAIRLINE,
            borderColor: 'rgba(15,15,15,0.14)',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            backgroundColor: 'white',
            opacity: pressed ? 0.7 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Feather name="tag" size={15} color={BRAND_INK} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_INK }}>Offer</Text>
        </Pressable>
        <Pressable
          onPress={onBuyPress}
          accessibilityRole="button"
          accessibilityLabel={`Buy now for ${formatPrice(buyTotal)}, Buyer Protection included`}
          accessibilityHint="Proceeds to secure checkout"
          style={({ pressed }) => ({
            flex: 1,
            height: 52,
            backgroundColor: BRAND_INK,
            borderRadius: 14,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '800', color: 'white', letterSpacing: 0.2 }}>
            Buy now · {bpFee > 0 ? formatPrice(buyTotal) : formatPrice(price)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
