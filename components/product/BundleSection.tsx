import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getOptimizedImageUrl } from '@/lib/images';
import type { Listing } from '@/types';
import {
  BUNDLE_TIERS,
  BUNDLE_MIN_ITEMS,
  computeBundlePricing,
  BRAND_INK,
  BRAND_PURPLE,
  BRAND_PURPLE_SOFT,
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
  onSendBundleOffer,
}: {
  listing: Listing;
  sellerItems: Listing[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSendBundleOffer: (totalAfterDiscount: number) => void;
}) {
  const username = listing.seller.username;
  const selectedItems = sellerItems.filter((s) => selectedIds.has(s.id));
  // All bundle money math lives in lib/bundle.ts (pure + unit-tested).
  const {
    itemCount: bundleItemCount,
    subtotal,
    pct: bundlePct,
    qualifies,
    savings,
    total,
    progress: progressFraction,
    nextTier,
  } = computeBundlePricing(
    listing.price,
    selectedItems.map((s) => Number(s.price ?? 0)),
  );
  const guidance = qualifies
    ? nextTier
      ? `${bundlePct}% off unlocked · add ${nextTier.count - bundleItemCount} more for ${nextTier.pct}%`
      : `${bundlePct}% off unlocked · max discount`
    : nextTier
      ? `Add ${nextTier.count - bundleItemCount} more ${nextTier.count - bundleItemCount === 1 ? 'item' : 'items'} to save ${nextTier.pct}%`
      : '';

  const brands = Array.from(
    new Set(
      [listing, ...sellerItems]
        .map((l) => (l.brand ?? '').trim())
        .filter((b) => b.length > 0),
    ),
  );
  const brandLabel =
    brands.length === 0
      ? `${sellerItems.length + 1} items`
      : brands.length <= 3
        ? brands.join(' · ').toUpperCase()
        : `${brands.slice(0, 3).join(' · ').toUpperCase()} + MORE`;

  const collageImages = [listing, ...sellerItems]
    .map((l) => l.images?.[0])
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .slice(0, 5);
  const extraCount = Math.max(0, 1 + sellerItems.length - collageImages.length);

  return (
    <View style={{ paddingTop: 18 }}>
      {/* Composition header — GRAILED-style collage. The editorial moment of
          the section; the decluttering lives below it (slim progress strip,
          summary only after selection). */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.4,
            color: 'rgba(15,15,15,0.62)',
            marginBottom: 6,
          }}
          numberOfLines={1}
        >
          {brandLabel}
        </Text>
        <Text
          style={{
            fontSize: 26,
            fontWeight: '900',
            color: BRAND_INK,
            letterSpacing: -0.8,
            marginBottom: 14,
          }}
        >
          Bundle from @{username}
        </Text>
        <BundleCollage images={collageImages} extraCount={extraCount} />
      </View>

      {/* Slim progress strip: the bar carries the tier ladder via pips; one
          dynamic line replaces the old five-column tier table. */}
      <View style={{ marginHorizontal: 16, marginBottom: 18 }}>
        <View style={{ height: 8, position: 'relative' }}>
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(108,71,255,0.16)',
              borderRadius: 99,
            }}
          />
          {BUNDLE_TIERS.map((tier, i) => {
            if (i === 0 || i === BUNDLE_TIERS.length - 1) return null;
            const reached = bundleItemCount >= tier.count;
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: `${(i / (BUNDLE_TIERS.length - 1)) * 100}%`,
                  top: 1,
                  width: 6,
                  height: 6,
                  marginLeft: -3,
                  borderRadius: 3,
                  backgroundColor: reached ? 'rgba(255,255,255,0.85)' : 'rgba(108,71,255,0.4)',
                  zIndex: 2,
                }}
              />
            );
          })}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progressFraction * 100}%`,
              backgroundColor: BRAND_PURPLE,
              borderRadius: 99,
            }}
          />
        </View>
        {guidance ? (
          <Text
            style={{
              fontSize: 12.5,
              fontWeight: qualifies ? '700' : '600',
              color: qualifies ? BRAND_PURPLE : 'rgba(15,15,15,0.62)',
              marginTop: 8,
            }}
          >
            {guidance}
          </Text>
        ) : null}
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

      {/* Summary + CTA — only once the buyer has actually selected something.
          With nothing selected the guidance line above is the whole story;
          an empty checkout card is just noise. */}
      {selectedItems.length > 0 ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 18,
            backgroundColor: BRAND_PURPLE_SOFT,
            borderRadius: 18,
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <View>
              <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.62)' }}>
                {bundleItemCount} items
                {qualifies ? ` · you save $${savings.toFixed(2)}` : ''}
              </Text>
              {qualifies ? (
                <Text
                  style={{
                    fontSize: 12,
                    color: 'rgba(15,15,15,0.45)',
                    textDecorationLine: 'line-through',
                    marginTop: 2,
                  }}
                >
                  ${subtotal.toFixed(2)}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 20, fontWeight: '900', color: BRAND_INK, letterSpacing: -0.4 }}>
              ${total.toFixed(2)}
            </Text>
          </View>

          <Pressable
            disabled={!qualifies}
            onPress={() => onSendBundleOffer(total)}
            style={({ pressed }) => ({
              backgroundColor: qualifies ? BRAND_PURPLE : 'rgba(15,15,15,0.18)',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Feather name="send" size={14} color="white" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: 'white' }}>
              {qualifies
                ? `Send bundle offer · $${total.toFixed(2)}`
                : `Add ${BUNDLE_MIN_ITEMS - bundleItemCount} more to unlock`}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function BundleCollage({ images, extraCount }: { images: string[]; extraCount: number }) {
  if (images.length === 0) {
    return (
      <View
        style={{
          height: 200,
          borderRadius: 16,
          backgroundColor: 'rgba(15,15,15,0.04)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.45)' }}>No items yet</Text>
      </View>
    );
  }

  const top = images.slice(0, 2);
  const bottom = images.slice(2, 5);
  const LARGE_H = 220;
  const SMALL_H = 120;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {top.map((u, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: LARGE_H,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: 'rgba(15,15,15,0.04)',
            }}
          >
            <Image
              source={{ uri: getOptimizedImageUrl(u, { width: 600 }) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </View>
        ))}
      </View>
      {bottom.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {bottom.map((u, i) => {
            const isLast = i === bottom.length - 1 && extraCount > 0;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: SMALL_H,
                  borderRadius: 14,
                  overflow: 'hidden',
                  backgroundColor: 'rgba(15,15,15,0.04)',
                }}
              >
                <Image
                  source={{ uri: getOptimizedImageUrl(u, { width: 400 }) }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                {isLast && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(15,15,15,0.55)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: 'white',
                        letterSpacing: 1.2,
                      }}
                    >
                      + {extraCount} more
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
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
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => ({
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: 'rgba(15,15,15,0.04)',
          opacity: pressed ? 0.92 : 1,
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
        <Pressable
          onPress={onToggle}
          hitSlop={10}
          style={({ pressed }) => ({
            position: 'absolute',
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: selected ? BRAND_PURPLE : 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          <Feather
            name={selected ? 'check' : 'plus'}
            size={16}
            color={selected ? 'white' : BRAND_INK}
          />
        </Pressable>
        {selected && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: BRAND_PURPLE,
            }}
          />
        )}
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: BRAND_INK }} numberOfLines={1}>
          {item.brand}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND_INK }}>
          ${item.price.toFixed(0)}
        </Text>
      </View>
      {/* Size · condition — buyers shouldn't have to open each item to know
          whether it even fits before adding it to a bundle. */}
      {item.meta ? (
        <Text
          style={{ fontSize: 11.5, color: 'rgba(15,15,15,0.55)', marginTop: 2 }}
          numberOfLines={1}
        >
          {item.meta}
        </Text>
      ) : null}
    </View>
  );
}
