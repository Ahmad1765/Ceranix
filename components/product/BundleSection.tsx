import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { getOptimizedImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { priceBreakdown } from '@/lib/fees';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { ListingCard } from '@/components/ListingCard';
import type { Listing } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { BundleProgressBar } from './BundleProgressBar';
import {
  computeBundlePricing,
  BRAND_PURPLE,
  CARD_OUTER_PAD,
  CARD_GAP,
  CARD_WIDTH,
  CARD_IMAGE_HEIGHT,
  conditionLabel,
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
  const { theme } = useTheme();
  const username = listing.seller.username;
  const isSold = listing.is_sold;

  // Ensure sold items never appear in the bundle offers
  const activeSellerItems = sellerItems.filter((s) => !s.is_sold);
  const selectedItems = activeSellerItems.filter((s) => selectedIds.has(s.id));

  // If the current listing is already sold, bundling is unavailable — show other available items to browse
  if (isSold) {
    return (
      <View style={{ paddingTop: 18 }}>
        {activeSellerItems.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center' }}>
            <Feather name="package" size={22} color={theme.mute} />
            <Text
              style={{
                fontSize: 13,
                color: theme.mute,
                marginTop: 8,
                textAlign: 'center',
                lineHeight: 19,
              }}
            >
              @{username} has no other available items right now.
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
              rowGap: 16,
            }}
          >
            {activeSellerItems.map((item) => (
              <View key={item.id} style={{ width: CARD_WIDTH }}>
                <ListingCard listing={item} width={CARD_WIDTH} />
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

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
          sellerItems={activeSellerItems}
          selectedIds={selectedIds}
        />
      </View>

      {/* Selectable seller items grid */}
      {activeSellerItems.length === 0 ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center' }}>
          <Feather name="package" size={22} color={theme.mute} />
          <Text
            style={{
              fontSize: 13,
              color: theme.mute,
              marginTop: 8,
              textAlign: 'center',
              lineHeight: 19,
            }}
          >
            @{username} has nothing else available to bundle right now.{'\n'}Follow them to catch their next drop.
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
            rowGap: 16,
          }}
        >
          {/* The item being viewed is always part of the bundle — pin it first */}
          <BaseItemCard item={listing} />
          {activeSellerItems.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <BundleSelectCard
                key={item.id}
                item={item}
                selected={isSelected}
                onToggle={() => onToggle(item.id)}
                onOpen={() => router.push(`/product/${item.id}`)}
              />
            );
          })}
        </View>
      )}

      {/* Summary + CTA — only once the buyer has added something. */}
      {selectedItems.length > 0 ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 18,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 18,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink, letterSpacing: -0.2 }}>
              Your bundle
            </Text>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.mute }}>
              {bundleItemCount} items
            </Text>
          </View>

          <SummaryRow label="Subtotal" value={formatPrice(subtotal)} />
          {qualifies ? (
            <SummaryRow
              label={`Bundle discount · ${bundlePct}%`}
              value={`− ${formatPrice(savings)}`}
              accent
            />
          ) : null}
          <View style={{ height: HAIRLINE_COLOR_H, backgroundColor: theme.border, marginVertical: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink }}>Total</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.ink, letterSpacing: -0.5 }}>
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
              color: theme.mute,
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
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ fontSize: 13, color: accent ? BRAND_PURPLE : theme.mute, fontWeight: accent ? '700' : '500' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 13, color: accent ? BRAND_PURPLE : theme.ink, fontWeight: '700' }}>
        {value}
      </Text>
    </View>
  );
}

function BaseItemCard({ item }: { item: Listing }) {
  const { theme } = useTheme();
  const meta = [item.size, conditionLabel(item.condition)].filter(Boolean).join(' · ');
  const itemPrice = Number(item.price ?? 0);
  const { total: totalPrice } = priceBreakdown(itemPrice);

  return (
    <View style={{ width: CARD_WIDTH, marginBottom: 4 }}>
      <View
        style={{
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: theme.panel,
          borderWidth: 2,
          borderColor: BRAND_PURPLE,
        }}
      >
        {item.images?.[0] ? (
          <Image
            source={{ uri: getOptimizedImageUrl(item.images[0], { width: 500 }) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}
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

      <View style={{ marginTop: 6, width: '100%' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink }} numberOfLines={1}>
          {item.brand || item.title}
        </Text>
        {!!meta && (
          <Text style={{ fontSize: 11, color: theme.mute, marginTop: 2 }} numberOfLines={1}>
            {meta}
          </Text>
        )}
        <Text style={{ fontSize: 11, color: theme.mute, marginTop: 4 }}>
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink }}>
            {formatPrice(totalPrice, { whole: true })} incl.
          </Text>
          <ShieldCheckIcon size={12} />
        </View>
      </View>
    </View>
  );
}

function BundleSelectCard({
  item,
  selected,
  onToggle,
  onOpen,
}: {
  item: Listing;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const meta = [item.size, conditionLabel(item.condition)].filter(Boolean).join(' · ');
  const itemPrice = Number(item.price ?? 0);
  const { total: totalPrice } = priceBreakdown(itemPrice);

  return (
    <View style={{ width: CARD_WIDTH, marginBottom: 4 }}>
      <View
        style={{
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: theme.panel,
          borderWidth: 2,
          borderColor: selected ? BRAND_PURPLE : 'transparent',
          position: 'relative',
        }}
      >
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${item.brand || item.title} ${selected ? 'from' : 'to'} bundle`}
          style={({ pressed }) => ({
            width: '100%',
            height: '100%',
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          {item.images?.[0] ? (
            <Image
              source={{ uri: getOptimizedImageUrl(item.images[0], { width: 500 }) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
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

        <Pressable
          onPress={onOpen}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.brand || item.title}`}
          style={({ pressed }) => ({
            position: 'absolute',
            top: 8,
            left: 8,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
            zIndex: 10,
          })}
        >
          <Feather name="maximize-2" size={13} color={theme.ink} />
        </Pressable>

        <Pressable
          onPress={onToggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${item.brand || item.title}`}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: selected ? BRAND_PURPLE : theme.surface,
            borderWidth: selected ? 0 : 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Feather name={selected ? 'check' : 'plus'} size={16} color={selected ? 'white' : theme.ink} />
        </Pressable>
      </View>

      <View style={{ marginTop: 6, width: '100%' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink }} numberOfLines={1}>
          {item.brand || item.title}
        </Text>
        {!!meta && (
          <Text style={{ fontSize: 11, color: theme.mute, marginTop: 2 }} numberOfLines={1}>
            {meta}
          </Text>
        )}
        <Text style={{ fontSize: 11, color: theme.mute, marginTop: 4 }}>
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink }}>
            {formatPrice(totalPrice, { whole: true })} incl.
          </Text>
          <ShieldCheckIcon size={12} />
        </View>
      </View>
    </View>
  );
}
