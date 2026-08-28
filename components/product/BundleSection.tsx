import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { getOptimizedImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import type { Listing } from '@/types';
import { colors } from '@/lib/theme';
import { BundleProgressBar } from './BundleProgressBar';
import {
  computeBundlePricing,
  BRAND_PURPLE,
  CARD_OUTER_PAD,
  CARD_GAP,
  CARD_WIDTH,
  CARD_IMAGE_HEIGHT,
  listingToRelated,
} from './shared';

export function BundleSection({
  listing,
  sellerItems,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  onSendBundleOffer,
}: {
  listing: Listing;
  sellerItems: Listing[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onClearAll?: () => void;
  onSendBundleOffer: (totalAfterDiscount: number) => void;
}) {
  const username = listing.seller.username;
  const baseItem = listingToRelated(listing);
  const selectedItems = sellerItems.filter((s) => selectedIds.has(s.id));
  // All bundle money math lives in lib/bundle.ts (pure + unit-tested).
  const {
    itemCount: bundleItemCount,
    subtotal,
    pct: bundlePct,
    qualifies,
    savings,
    total,
  } = computeBundlePricing(
    listing.price,
    selectedItems.map((s) => Number(s.price ?? 0)),
  );

  return (
    <View style={{ paddingTop: 18 }}>
      {/* Bundle Progress Banner */}
      <View style={{ marginBottom: 18 }}>
        <BundleProgressBar
          listing={listing}
          sellerItems={sellerItems}
          selectedIds={selectedIds}
        />
      </View>

      {/* Selectable seller items grid */}
      {sellerItems.length === 0 ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center' }}>
          <Feather name="package" size={22} color="rgba(15,15,15,0.3)" />
          <Text
            style={{
              fontSize: 13,
              color: 'rgba(15,15,15,0.62)',
              marginTop: 8,
              textAlign: 'center',
              lineHeight: 19,
            }}
          >
            @{username} has nothing else listed right now.{'\n'}Follow them to catch their next drop.
          </Text>
        </View>
      ) : (
        <View
          style={{
            width: '100%',
            flexDirection: 'row',
            flexWrap: 'wrap',
            paddingHorizontal: CARD_OUTER_PAD,
            columnGap: CARD_GAP,
          }}
        >
          {/* The item being viewed is always part of the bundle — pin it first
              so the "N items" count and total are never a mystery. */}
          <BaseItemCard item={baseItem} />
          {sellerItems.map((row) => {
            const item = listingToRelated(row);
            const isSelected = selectedIds.has(row.id);
            return (
              <BundleSelectCard
                key={item.id}
                item={item}
                selected={isSelected}
                onToggle={() => onToggle(row.id)}
                onOpen={() => router.push(`/product/${item.id}`)}
              />
            );
          })}
        </View>
      )}

      {/* Summary + CTA — only once the buyer has added something. With nothing
          selected the guidance line above is the whole story; an empty checkout
          card is just noise. Selecting any add-on always clears the discount
          gate (base + 1 = 2 items), so the CTA here is always live. */}
      {selectedItems.length > 0 ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 18,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 18,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
              Your bundle
            </Text>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.mute }}>
              {bundleItemCount} items
            </Text>
          </View>

          {/* Line-item breakdown so the discount is explicit, not just implied
              by a struck-through number. */}
          <SummaryRow label="Subtotal" value={formatPrice(subtotal)} />
          {qualifies ? (
            <SummaryRow
              label={`Bundle discount · ${bundlePct}%`}
              value={`− ${formatPrice(savings)}`}
              accent
            />
          ) : null}
          <View style={{ height: HAIRLINE_COLOR_H, backgroundColor: colors.border, marginVertical: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>Total</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 }}>
              {formatPrice(total)}
            </Text>
          </View>

          <Pressable
            onPress={() => onSendBundleOffer(total)}
            accessibilityRole="button"
            accessibilityLabel={`Send a bundle offer of ${formatPrice(total)} to the seller`}
            style={({ pressed }) => ({
              marginTop: 14,
              backgroundColor: BRAND_PURPLE,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 7,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Feather name="send" size={14} color="white" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: 'white' }}>
              Send bundle offer · {formatPrice(total)}
            </Text>
          </Pressable>

          <Text
            style={{
              fontSize: 11.5,
              color: colors.mute,
              textAlign: 'center',
              marginTop: 10,
            }}
          >
            The seller reviews your offer. Buyer Protection is added at checkout.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const HAIRLINE_COLOR_H = 1;

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ fontSize: 13, color: accent ? BRAND_PURPLE : colors.mute, fontWeight: accent ? '700' : '500' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 13, color: accent ? BRAND_PURPLE : colors.ink, fontWeight: '700' }}>
        {value}
      </Text>
    </View>
  );
}

// The item being viewed, shown as a locked-in bundle member. No toggle: it's
// always included, which is exactly why the count/total make sense.
function BaseItemCard({ item }: { item: ReturnType<typeof listingToRelated> }) {
  return (
    <View style={{ width: CARD_WIDTH, marginBottom: 14 }}>
      <View
        style={{
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: colors.panel,
          borderWidth: 2,
          borderColor: BRAND_PURPLE,
        }}
      >
        {item.images[0] && (
          <Image
            source={{ uri: getOptimizedImageUrl(item.images[0], { width: 500 }) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        )}
        {/* "This item" pill instead of a toggle — communicates it's fixed. */}
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 9,
            height: 26,
            borderRadius: 13,
            backgroundColor: BRAND_PURPLE,
          }}
        >
          <Feather name="check" size={12} color="white" />
          <Text style={{ fontSize: 11, fontWeight: '800', color: 'white', letterSpacing: 0.2 }}>
            This item
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
          {item.brand}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>
          {formatPrice(item.price)}
        </Text>
      </View>
      {item.meta ? (
        <Text style={{ fontSize: 11.5, color: colors.mute, marginTop: 2 }} numberOfLines={1}>
          {item.meta}
        </Text>
      ) : null}
    </View>
  );
}


function BundleSelectCard({
  item,
  selected,
  onToggle,
  onOpen,
}: {
  item: ReturnType<typeof listingToRelated>;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={{ width: CARD_WIDTH, marginBottom: 14 }}>
      {/* Primary gesture is add-to-bundle — the whole tile toggles. Opening the
          full listing is the secondary action, moved to its own button as a sibling
          so a tap no longer navigates away and we avoid nested <button> elements. */}
      <View
        style={{
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: colors.panel,
          borderWidth: 2,
          borderColor: selected ? BRAND_PURPLE : 'transparent',
          position: 'relative',
        }}
      >
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${item.brand || 'item'} ${selected ? 'from' : 'to'} bundle`}
          style={({ pressed }) => ({
            width: '100%',
            height: '100%',
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          {item.images[0] && (
            <Image
              source={{ uri: getOptimizedImageUrl(item.images[0], { width: 500 }) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          )}
          {/* Selected wash — reinforces state beyond the border. */}
          {selected ? (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: 'rgba(108,71,255,0.12)',
              }}
            />
          ) : null}
        </Pressable>

        {/* View full listing — the escape hatch to the product page. */}
        <Pressable
          onPress={onOpen}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.brand || 'item'}`}
          style={({ pressed }) => ({
            position: 'absolute',
            top: 8,
            left: 8,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
            zIndex: 10,
          })}
        >
          <Feather name="maximize-2" size={13} color={colors.ink} />
        </Pressable>

        {/* Selection indicator — reflects state; the whole tile drives it. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: selected ? BRAND_PURPLE : colors.surface,
            borderWidth: selected ? 0 : 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Feather name={selected ? 'check' : 'plus'} size={16} color={selected ? 'white' : colors.ink} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
          {item.brand}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>
          {formatPrice(item.price)}
        </Text>
      </View>
      {/* Size · condition — buyers shouldn't have to open each item to know
          whether it even fits before adding it to a bundle. */}
      {item.meta ? (
        <Text
          style={{ fontSize: 11.5, color: colors.mute, marginTop: 2 }}
          numberOfLines={1}
        >
          {item.meta}
        </Text>
      ) : null}
    </View>
  );
}
