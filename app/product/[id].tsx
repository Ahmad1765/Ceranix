import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  Alert,
  Platform,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withRepeat,
  withSequence,
  type SharedValue,
} from 'react-native-reanimated';
import type { Listing } from '@/types';
import {
  deleteListing,
  fetchListingById,
  fetchSellerOtherListings,
  fetchSimilarListings,
  isLiked,
  setListingSold,
  toggleLike,
} from '@/lib/listings';
import { confirm } from '@/lib/confirm';
import { logListingView } from '@/lib/recommendations';
import { getCachedListing } from '@/lib/listingCache';
import { fetchFollowState, getCachedFollowState, toggleFollow } from '@/lib/follows';
import { withTimeout } from '@/lib/async';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { LikeBurst } from '@/components/LikeBurst';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { SaveListSheet } from '@/components/SaveListSheet';
import { isSaved as fetchIsSaved } from '@/lib/saves';

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

const IS_IOS = Platform.OS === 'ios';
const HAIRLINE = StyleSheet.hairlineWidth;

function tap(style: 'light' | 'medium' | 'selection' = 'selection') {
  if (!IS_IOS) return;
  if (style === 'selection') Haptics.selectionAsync();
  else if (style === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

const iosShadow = IS_IOS
  ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
    }
  : {
      shadowColor: '#000',
      elevation: 3,
    };

const { width } = Dimensions.get('window');
const IMAGE_HEIGHT = width * 1.45;

const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  good: 'Very good condition',
  fair: 'Fair',
};

const CATEGORY_LABELS: Record<string, string> = {
  clothing: 'Clothing',
  shoes: 'Shoes',
  bags: 'Bags',
  accessories: 'Accessories',
  electronics: 'Electronics',
  beauty: 'Beauty',
  other: 'Other',
};

const ITEM_COLOR = { name: 'Carrinex purple', hex: '#6C47FF' };

// Unified brand palette (matches home tabs + PromoBanner + LiveActivityTicker)
const BRAND_PURPLE = '#6C47FF';
const BRAND_PURPLE_SOFT = 'rgba(108,71,255,0.10)';
const BRAND_LIME = '#6C47FF';
const BRAND_INK = '#0F0F0F';
const TAG_BG = 'rgba(15,15,15,0.04)';
const TAG_BORDER = 'rgba(15,15,15,0.08)';
const LINK_PURPLE = BRAND_PURPLE;

// Dead "review" / "transaction" / "items listed" / "pin" constants were
// previously hardcoded here as fake static numbers. They masqueraded as real
// data on the seller card; they're gone now. Where the UI still needs a
// value we either derive it from the actual listing/seller row or hide the
// chip when the field is unknown. The fallback `0` paths below are explicit.

// Fallback shape used while the real listing is loading; render is gated on
// `listing` being non-null below, so this is never visible in the UI.
const FALLBACK_SELLER = {
  id: '',
  username: '',
  avatar_url: null,
  full_name: '',
  bio: null,
  location: null,
  rating: 0,
  total_sales: 0,
  created_at: '',
};

type RelatedItem = {
  id: string;
  images: string[];
  brand: string;
  meta: string;
  price: number;
  inclPrice: number;
  likes: number;
};

function conditionLabel(c: Listing['condition']) {
  switch (c) {
    case 'new_with_tags':
      return 'New with tags';
    case 'like_new':
      return 'Like new';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    default:
      return '';
  }
}

function listingToRelated(row: Listing): RelatedItem {
  const meta = [row.size, conditionLabel(row.condition)].filter(Boolean).join(' · ');
  return {
    id: row.id,
    images: row.images && row.images.length > 0 ? row.images : [],
    brand: row.brand || row.title,
    meta: meta || row.category,
    price: Number(row.price ?? 0),
    inclPrice: Number(row.price ?? 0),
    likes: Number(row.likes ?? 0),
  };
}

// Marketplace-wide bundle tiers. The buyer's bundle item count maps to the
// highest tier whose `count` threshold has been reached. Tier `pct` is the
// applied discount. Keeping this a const array (not seller-configurable) so
// the milestone progress bar always shows the same rungs across the app.
const BUNDLE_TIERS = [
  { count: 1, pct: 0, label: '1 item' },
  { count: 2, pct: 5, label: '2 items' },
  { count: 3, pct: 10, label: '3 items' },
  { count: 4, pct: 15, label: '4 items' },
  { count: 5, pct: 20, label: '5+ items' },
] as const;
const BUNDLE_MIN_ITEMS = 2;

const CARD_GAP = 8;
const CARD_OUTER_PAD = 12;
// Floor so 2*CARD_WIDTH + CARD_GAP can never exceed the row width due to
// sub-pixel rounding — otherwise the second card wraps and the grid
// collapses into a single column on certain devices/layout passes.
const CARD_WIDTH = Math.floor((width - CARD_OUTER_PAD * 2 - CARD_GAP) / 2);
const CARD_IMAGE_HEIGHT = Math.round(CARD_WIDTH * 1.25);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function FullscreenImageViewer({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetX = useSharedValue(initialIndex * width);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      offsetX.value = e.contentOffset.x;
    },
  });

  // Sync to the tapped image whenever the viewer (re-)opens.
  useEffect(() => {
    if (!visible) return;
    offsetX.value = initialIndex * width;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * width, y: 0, animated: false });
    });
  }, [visible, initialIndex, offsetX]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar style="light" animated />
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Animated.ScrollView
          ref={scrollRef as any}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {images.map((uri, i) => (
            <Pressable
              key={i}
              onPress={onClose}
              style={{
                width,
                height: SCREEN_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                source={{ uri: getOptimizedImageUrl(uri, { width: thumbWidthFor(width), quality: 80 }) }}
                style={{ width, height: SCREEN_HEIGHT }}
                contentFit="contain"
                cachePolicy="memory-disk"
                recyclingKey={uri}
                transition={0}
                priority={i === initialIndex ? 'high' : 'normal'}
              />
            </Pressable>
          ))}
        </Animated.ScrollView>

        {/* Close button */}
        <Pressable
          onPress={() => { tap('selection'); onClose(); }}
          hitSlop={12}
          style={({ pressed }) => ({
            position: 'absolute',
            top: (IS_IOS ? 54 : 28),
            right: 16,
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: 'rgba(255,255,255,0.14)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="x" size={20} color="#fff" />
        </Pressable>

        {/* Pagination dots */}
        {images.length > 1 && (
          <View
            style={{
              position: 'absolute',
              bottom: IS_IOS ? 44 : 28,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              pointerEvents: 'none',
            }}
          >
            {images.map((_, i) => (
              <HeroPageDot key={i} index={i} offsetX={offsetX} pageWidth={width} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

function RelatedItemCard({ item, onPress }: { item: RelatedItem; onPress: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselArmed, setCarouselArmed] = useState(false);
  const hasMultiple = item.images.length > 1;
  const srcWidth = thumbWidthFor(CARD_WIDTH);
  const armCarousel = () => {
    if (!carouselArmed) setCarouselArmed(true);
  };
  return (
    <Pressable onPress={onPress} style={{ width: CARD_WIDTH, marginBottom: 18 }}>
      <View
        style={{
          position: 'relative',
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: 'rgba(15,15,15,0.04)',
        }}
      >
        {hasMultiple ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            onScroll={(e) =>
              setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH))
            }
            onTouchStart={armCarousel}
            onScrollBeginDrag={armCarousel}
            scrollEventThrottle={16}
            disableIntervalMomentum
          >
            {item.images.map((uri, i) => {
              if (i !== 0 && !carouselArmed) {
                return <View key={i} style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }} />;
              }
              return (
                <Image
                  key={i}
                  source={{ uri: getOptimizedImageUrl(uri, { width: srcWidth }) }}
                  style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  transition={180}
                  priority={i === 0 ? 'normal' : 'low'}
                />
              );
            })}
          </ScrollView>
        ) : (
          <Image
            source={{
              uri: item.images && item.images.length > 0
                ? getOptimizedImageUrl(item.images[0], { width: srcWidth })
                : 'https://placehold.co/400x400/eeeeee/cccccc.png?text=No+Image',
            }}
            style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.images && item.images.length > 0 ? item.images[0] : 'empty-placeholder'}
            transition={180}
          />
        )}

        {hasMultiple && (
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            {item.images.map((_, i) => (
              <View
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: i === activeIndex ? 'white' : 'rgba(255,255,255,0.55)',
                }}
              />
            ))}
          </View>
        )}

        {/* Like chip */}
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            backgroundColor: 'rgba(255,255,255,0.94)',
            borderRadius: 999,
            paddingHorizontal: 9,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Feather name="heart" size={11} color={BRAND_INK} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND_INK }}>{item.likes}</Text>
        </View>
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_INK }} numberOfLines={1}>
          {item.brand}
        </Text>
        <Text style={{ fontSize: 11, color: 'rgba(15,15,15,0.62)', marginTop: 2 }} numberOfLines={1}>
          {item.meta}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND_INK, marginTop: 4 }}>
          ${item.price.toFixed(0)}
        </Text>
      </View>
    </Pressable>
  );
}

function BundleSection({
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
  const bundleItemCount = 1 + selectedItems.length;
  const subtotal = listing.price + selectedItems.reduce((acc, s) => acc + Number(s.price ?? 0), 0);
  // Highest tier the user currently qualifies for. We walk the tiers
  // backwards so the first match is the largest discount.
  const activeTier =
    [...BUNDLE_TIERS].reverse().find((t) => bundleItemCount >= t.count) ?? BUNDLE_TIERS[0];
  const bundlePct = activeTier.pct;
  const qualifies = bundleItemCount >= BUNDLE_MIN_ITEMS && bundlePct > 0;
  const savings = qualifies ? Math.round((subtotal * bundlePct) / 100 * 100) / 100 : 0;
  const total = Math.max(0, subtotal - savings);
  // Progress fill: 0% at 1 item, 100% at 5+ items. Clamped so over-selection
  // doesn't push the thumb past the right edge.
  const progressFraction = Math.max(
    0,
    Math.min(1, (bundleItemCount - 1) / (BUNDLE_TIERS.length - 1)),
  );
  // Next rung above the current count — drives the single guidance line.
  const nextTier = BUNDLE_TIERS.find((t) => t.count > bundleItemCount);
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

function SectionEyebrow({ label, color = BRAND_INK }: { label: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: BRAND_LIME,
          marginRight: 8,
        }}
      />
      <Text
        style={{
          fontSize: 11,
          fontWeight: '800',
          color,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? 'star' : 'star-outline'}
          size={14}
          color={i < full ? '#6C47FF' : 'rgba(15,15,15,0.18)'}
        />
      ))}
    </View>
  );
}

function SkeletonBlock({
  width,
  height,
  radius = 8,
  style,
}: {
  width: number | string;
  height: number;
  radius?: number;
  style?: any;
}) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withTiming(0.5, { duration: 700 }),
      ),
      -1,
      true,
    );
  }, [opacity]);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: 'rgba(15,15,15,0.06)',
        },
        animStyle,
        style,
      ]}
    />
  );
}

function ProductSkeleton({ insetsTop }: { insetsTop: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Header (back button area) */}
      <View
        style={{
          paddingTop: insetsTop + 8,
          paddingHorizontal: 16,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <SkeletonBlock width={40} height={40} radius={20} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SkeletonBlock width={40} height={40} radius={20} />
          <SkeletonBlock width={40} height={40} radius={20} />
        </View>
      </View>

      {/* Hero image */}
      <SkeletonBlock
        width="100%"
        height={420}
        radius={0}
        style={{ marginTop: 4 }}
      />

      {/* Content block */}
      <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
        <SkeletonBlock width={80} height={14} radius={4} />
        <SkeletonBlock width="86%" height={22} radius={6} style={{ marginTop: 10 }} />
        <SkeletonBlock width="60%" height={22} radius={6} style={{ marginTop: 8 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20 }}>
          <SkeletonBlock width={120} height={34} radius={8} />
          <SkeletonBlock width={70} height={20} radius={4} style={{ marginLeft: 12 }} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 24,
            paddingTop: 20,
            borderTopWidth: 1,
            borderTopColor: 'rgba(15,15,15,0.06)',
          }}
        >
          <SkeletonBlock width={44} height={44} radius={22} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <SkeletonBlock width="55%" height={14} radius={4} />
            <SkeletonBlock width="35%" height={11} radius={4} style={{ marginTop: 6 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

function HeroPageDot({
  index,
  offsetX,
  pageWidth,
}: {
  index: number;
  offsetX: SharedValue<number>;
  pageWidth: number;
}) {
  const animStyle = useAnimatedStyle(() => {
    const progress = offsetX.value / pageWidth;
    const dist = Math.min(1, Math.abs(progress - index));
    const proximity = 1 - dist;
    const w = 6 + proximity * 18;
    const opacity = 0.5 + proximity * 0.5;
    return {
      width: w,
      backgroundColor: `rgba(255,255,255,${opacity})`,
    };
  });
  return (
    <Animated.View
      style={[{ height: 4, borderRadius: 2 }, animStyle]}
    />
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const productIdParam = Array.isArray(id) ? id[0] : id;

  const [activeImage, setActiveImage] = useState(0);
  const heroOffsetX = useSharedValue(0);
  const heroScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      heroOffsetX.value = e.contentOffset.x;
    },
  });
  const [liked, setLiked] = useState(false);
  const [likeConfirmedFromServer, setLikeConfirmedFromServer] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  // Prime from cache so re-opens are instant — bypasses any wedged supabase
  // client on web while we refetch in the background.
  const cached = getCachedListing(productIdParam);
  // Seed `followed` from the follow cache so a re-mount under a wedged
  // supabase client doesn't blink the button back to "Follow" before the
  // refetch resolves. The cache is updated on every successful fetchFollowState
  // and toggleFollow.
  const initialFollowed =
    getCachedFollowState(user?.id ?? null, cached?.seller?.id)?.isFollowing ?? false;
  const [followed, setFollowed] = useState(initialFollowed);
  const [followBusy, setFollowBusy] = useState(false);
  const [sellerItems, setSellerItems] = useState<Listing[]>([]);
  const [similarItems, setSimilarItems] = useState<Listing[]>([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState<Set<string>>(new Set());
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [relatedTab, setRelatedTab] = useState<'members' | 'similar'>('members');
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [saveListVisible, setSaveListVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [listing, setListing] = useState<Listing | null>(
    cached ? { ...cached, seller: cached.seller ?? (FALLBACK_SELLER as Listing['seller']) } : null,
  );
  const [loadingListing, setLoadingListing] = useState(!cached);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // The bundle section lives at the bottom of the page (inside the
  // "Seller's items" tab); the teaser pill under the price jumps there.
  const mainScrollRef = useRef<any>(null);

  const retry = () => setRetryToken((n) => n + 1);

  useEffect(() => {
    let active = true;
    if (!productIdParam) {
      setLoadingListing(false);
      setNotFound(true);
      setLoadError(null);
      return;
    }
    const haveCached = !!getCachedListing(productIdParam);
    // Only show the blocking skeleton when we have nothing to render.
    setLoadingListing(!haveCached);
    setNotFound(false);
    setLoadError(null);
    const controller = new AbortController();
    (async () => {
      try {
        // Supabase client already enforces a 12s fetch ceiling via
        // timeoutFetch in lib/supabase.ts, so no outer race is needed.
        // The AbortController here cancels the request when the effect
        // re-runs (HMR, param change, unmount) so stale fetches don't
        // resolve into state we no longer want.
        const row = await fetchListingById(productIdParam, controller.signal);
        if (!active) return;
        if (!row) {
          if (!haveCached) setNotFound(true);
        } else {
          setListing({
            ...row,
            seller: row.seller ?? (FALLBACK_SELLER as Listing['seller']),
          });
        }
      } catch (e: any) {
        // Silently swallow cancellations — they fire on unmount/HMR and
        // are expected, not errors.
        const msg = e?.message ?? '';
        const cancelled =
          controller.signal.aborted ||
          e?.name === 'AbortError' ||
          msg.includes('aborted') ||
          msg.includes('AbortError');
        if (cancelled || !active) return;
        console.warn('[product] load failed', e);
        if (!haveCached) {
          setLoadError(msg || 'Could not load listing');
        }
      } finally {
        if (active) setLoadingListing(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [productIdParam, retryToken]);

  // Feed the recommender: record that this user opened this listing. The RPC
  // dedupes within 30 minutes and skips own listings, so no guards needed.
  useEffect(() => {
    if (productIdParam && user?.id) logListingView(productIdParam);
  }, [productIdParam, user?.id]);

  useEffect(() => {
    let active = true;
    if (!productIdParam || !user?.id) {
      setLiked(false);
      return;
    }
    isLiked(productIdParam, user.id)
      .then((v) => {
        if (active) {
          setLiked(v);
          setLikeConfirmedFromServer(v);
        }
      })
      .catch((e) => {
        console.warn('[product] isLiked failed', e);
      });
    return () => {
      active = false;
    };
  }, [productIdParam, user?.id]);

  // Hydrate the saved/bookmarked state for the bookmark pill. Returns true
  // when the listing is in at least one of the user's save lists.
  useEffect(() => {
    let active = true;
    if (!productIdParam || !user?.id) {
      setSaved(false);
      return;
    }
    fetchIsSaved(productIdParam, user.id).then((v) => {
      if (active) setSaved(v);
    });
    return () => {
      active = false;
    };
  }, [productIdParam, user?.id]);

  // Real follow state — pulls from user_follows and the profile's denormalized
  // counts. Re-fires on focus so a follow performed elsewhere (e.g. on the
  // seller's user profile screen) is reflected when the user comes back to
  // this product. On RPC failure we preserve whatever is on screen (the
  // cached/optimistic value) instead of forcing the button back to "Follow".
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const sellerId = listing?.seller?.id;
      if (!sellerId || sellerId === user?.id) {
        setFollowed(false);
        return () => {
          active = false;
        };
      }
      // Re-seed from cache on focus in case another screen wrote a fresher
      // state since this component last rendered.
      const cachedState = getCachedFollowState(user?.id ?? null, sellerId);
      if (cachedState) setFollowed(cachedState.isFollowing);
      fetchFollowState(user?.id ?? null, sellerId)
        .then((s) => {
          // null = RPC failed; preserve current state rather than wipe it.
          if (active && s) setFollowed(s.isFollowing);
        })
        .catch((e) => console.warn('[product] fetchFollowState', e?.message ?? e));
      return () => {
        active = false;
      };
    }, [listing?.seller?.id, user?.id]),
  );

  // Reset bundle selection whenever the viewed listing changes — selected
  // IDs from a previous seller's items must not bleed into a new product page.
  useEffect(() => {
    setSelectedBundleIds(new Set());
  }, [listing?.id]);

  // Other listings from this seller — ranked by likes desc, freshness tiebreak,
  // excluding the current item + sold rows server-side via RPC.
  useEffect(() => {
    let active = true;
    const sellerId = listing?.seller_id;
    const currentId = listing?.id ?? null;
    if (!sellerId) {
      setSellerItems([]);
      return;
    }
    fetchSellerOtherListings(sellerId, currentId, 6)
      .then((rows) => {
        if (!active) return;
        setSellerItems(rows);
      })
      .catch((e) => console.warn('[product] fetchSellerOtherListings', e?.message ?? e));
    return () => {
      active = false;
    };
  }, [listing?.seller_id, listing?.id]);

  // "You might also like" — weighted similarity (brand, gender, size,
  // condition, price proximity, title trigram, likes, freshness). Filtered
  // server-side to exclude the item itself, sold rows, the same seller, and
  // sellers on vacation.
  useEffect(() => {
    let active = true;
    const currentId = listing?.id;
    if (!currentId) {
      setSimilarItems([]);
      return;
    }
    fetchSimilarListings(currentId, 6)
      .then((rows) => {
        if (!active) return;
        setSimilarItems(rows);
      })
      .catch((e) => console.warn('[product] fetchSimilarListings', e?.message ?? e));
    return () => {
      active = false;
    };
  }, [listing?.id]);

  const handleHeartPress = async () => {
    tap('light');
    if (!user) {
      toast.show('Sign in to like items', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (!productIdParam || likeBusy) return;
    setLikeBusy(true);
    const originalLiked = liked;
    // Optimistic flip — animation runs immediately, even before the round-trip.
    setLiked(!originalLiked);
    setLikeConfirmedFromServer(false);
    try {
      const next = await toggleLike(productIdParam, user.id, originalLiked);
      setLiked(next);
      if (next) toast.show('Added to your favorites', { variant: 'success', icon: 'heart' });
    } catch {
      // Revert optimistic flip.
      setLiked(originalLiked);
      toast.show('Could not update like', { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setLikeBusy(false);
    }
  };

  // Owner-only actions. Both update local state optimistically so the UI
  // doesn't lag behind the supabase round-trip, and roll back on failure.
  const [ownerBusy, setOwnerBusy] = useState<'sold' | 'delete' | null>(null);

  const handleToggleSold = async () => {
    if (!listing || ownerBusy) return;
    const next = !listing.is_sold;
    setOwnerBusy('sold');
    setListing((prev) => (prev ? { ...prev, is_sold: next } : prev));
    try {
      const committed = await setListingSold(listing.id, next);
      if (committed !== next) {
        // Rollback.
        setListing((prev) => (prev ? { ...prev, is_sold: !next } : prev));
        toast.show("Couldn't update the listing", {
          variant: 'default',
          icon: 'alert-triangle',
        });
      } else {
        toast.show(next ? 'Marked as sold' : 'Marked as available', {
          variant: 'success',
          icon: 'check',
        });
      }
    } catch {
      // Rollback.
      setListing((prev) => (prev ? { ...prev, is_sold: !next } : prev));
      toast.show("Couldn't update the listing", {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setOwnerBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!listing || ownerBusy) return;
    const ok = await confirm({
      title: 'Delete listing?',
      message: 'This permanently removes the listing. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setOwnerBusy('delete');
    const success = await deleteListing(listing.id);
    if (!success) {
      toast.show("Couldn't delete the listing", {
        variant: 'default',
        icon: 'alert-triangle',
      });
      setOwnerBusy(null);
      return;
    }
    toast.show('Listing deleted', { variant: 'success', icon: 'check' });
    safeBack();
  };

  const handleFollowPress = async () => {
    tap('selection');
    if (!user) {
      toast.show('Sign in to follow sellers', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    const sellerId = listing?.seller?.id;
    if (!sellerId || sellerId === user.id || followBusy) return;
    setFollowBusy(true);
    const optimistic = !followed;
    setFollowed(optimistic); // optimistic flip
    try {
      const next = await toggleFollow(user.id, sellerId, followed);
      setFollowed(next.isFollowing);
      toast.show(
        next.isFollowing ? `Following @${listing?.seller?.username ?? 'seller'}` : 'Unfollowed',
        { variant: next.isFollowing ? 'info' : 'default', icon: next.isFollowing ? 'user-check' : 'user-x' },
      );
    } catch (e: any) {
      // Roll back optimistic state on failure.
      setFollowed(!optimistic);
      toast.show(e?.message ?? 'Could not update follow', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setFollowBusy(false);
    }
  };

  const openChat = (mode: 'message' | 'offer') => {
    tap('medium');
    if (!user) {
      toast.show('Sign in to message sellers', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (!listing) return;
    if (listing.seller_id === user.id) {
      toast.show("That's your own listing", { variant: 'default', icon: 'info' });
      return;
    }
    router.push({
      pathname: '/conversation/new',
      params: { listing: listing.id, mode },
    } as any);
  };

  const sharedTagId = productIdParam ?? listing?.id ?? '';

  // Vertical scroll-driven parallax + sticky-header toggle
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  useAnimatedReaction(
    () => scrollY.value > IMAGE_HEIGHT - 80,
    (curr, prev) => {
      if (curr !== prev) runOnJS(setShowStickyHeader)(curr);
    }
  );

  // iOS-style hero stretch on pull-to-refresh.
  // Only transforms the image carousel — floating buttons stay put.
  // Math: when overscrolling by |y|, image scales by (H+|y|)/H and translates
  // up by |y|/2 so its top stays glued to viewport top and the bottom edge
  // grows to exactly meet the next section (no bleed, no gap).
  const heroParallaxStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y >= 0) {
      return { transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const stretch = -y / IMAGE_HEIGHT;
    return {
      transform: [
        { translateY: y / 2 },
        { scale: 1 + stretch },
      ],
    };
  });

  if (loadingListing && !listing) {
    return <ProductSkeleton insetsTop={insets.top} />;
  }

  if (loadError && !listing) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', paddingTop: insets.top }}>
        <Pressable onPress={() => safeBack()} hitSlop={10} style={{ padding: 16 }}>
          <Feather name="arrow-left" size={22} color="#0F0F0F" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="wifi-off" size={36} color="rgba(15,15,15,0.45)" />
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#0F0F0F', marginTop: 14, letterSpacing: -0.3 }}>
            Couldn't load this listing
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.62)', marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
            {loadError === 'Request timed out'
              ? 'The connection is slow right now. Try again in a moment.'
              : 'Something went wrong. Check your connection and try again.'}
          </Text>
          <Pressable
            onPress={() => { tap('light'); retry(); }}
            style={({ pressed }) => ({
              marginTop: 22,
              height: 48,
              borderRadius: 14,
              paddingHorizontal: 28,
              backgroundColor: BRAND_INK,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, marginLeft: 8 }}>
              Retry
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (notFound || !listing) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', paddingTop: insets.top }}>
        <Pressable onPress={() => safeBack()} hitSlop={10} style={{ padding: 16 }}>
          <Feather name="arrow-left" size={22} color="#0F0F0F" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="alert-circle" size={42} color="rgba(15,15,15,0.45)" />
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#0F0F0F', marginTop: 14 }}>
            Listing not available
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(15,15,15,0.62)', marginTop: 6, textAlign: 'center' }}>
            It may have been removed or never existed.
          </Text>
        </View>
      </View>
    );
  }

  const baseLikes = listing.likes ?? 0;
  const userLikedOnServer = listing.user_has_liked ?? false;
  const heartDelta = likeConfirmedFromServer 
    ? 0 
    : (liked && !userLikedOnServer ? 1 : (!liked && userLikedOnServer ? -1 : 0));
  const heartCount = Math.max(0, baseLikes + heartDelta);
  const isOwnListing = !!user?.id && listing.seller_id === user.id;

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Status-bar mode flips when sticky header takes over */}
      <StatusBar style={showStickyHeader ? 'dark' : 'light'} animated />

      {/* Sticky header */}
      {showStickyHeader && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
          backgroundColor: 'white',
          borderBottomWidth: HAIRLINE, borderBottomColor: 'rgba(15,15,15,0.08)',
          paddingTop: insets.top,
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingBottom: 12,
          ...(IS_IOS && {
            boxShadow: '0px 2px 8px rgba(0,0,0,0.06)',
          }),
        }}>
          <Pressable onPress={() => { tap('selection'); safeBack(); }} hitSlop={10} style={({ pressed }) => ({ marginRight: 12, opacity: pressed ? 0.5 : 1 })}>
            <Feather name="arrow-left" size={22} color="#0F0F0F" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#0F0F0F' }} numberOfLines={1}>
            {listing.title}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F0F0F' }}>
            ${listing.price}
          </Text>
        </View>
      )}

      <Animated.ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Image carousel (full-bleed to top, Plick style) ── */}
        <View style={{ position: 'relative' }}>
          {/* Parallax/stretch layer wraps ONLY the carousel; floating UI is unaffected */}
          <Animated.View style={heroParallaxStyle}>
            <Animated.ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              onScroll={heroScrollHandler}
              onMomentumScrollEnd={(e) =>
                setActiveImage(Math.round(e.nativeEvent.contentOffset.x / width))
              }
              scrollEventThrottle={16}
            >
              {listing.images.map((uri, i) => (
                <Pressable
                  key={i}
                  onPress={() => { tap('selection'); setFullscreenIndex(i); }}
                  style={{ width, height: IMAGE_HEIGHT }}
                >
                  <AnimatedExpoImage
                    source={{ uri: getOptimizedImageUrl(uri, { width: thumbWidthFor(width), quality: 80 }) }}
                    style={{ width, height: IMAGE_HEIGHT }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={uri}
                    transition={0}
                    priority={i === 0 ? 'high' : 'normal'}
                    sharedTransitionTag={i === 0 ? `product-image-${sharedTagId}` : undefined}
                  />
                </Pressable>
              ))}
            </Animated.ScrollView>
          </Animated.View>

          {/* Back arrow — frosted glass on iOS so it stays visible over light photos */}
          <Pressable
            onPress={() => { tap('selection'); safeBack(); }}
            hitSlop={12}
            style={({ pressed }) => ({
              position: 'absolute',
              top: insets.top + 10,
              left: 16,
              width: 38,
              height: 38,
              borderRadius: 19,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
              ...iosShadow,
            })}
          >
            {IS_IOS ? (
              <BlurView intensity={70} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.85)' }]} />
            )}
            <Feather name="arrow-left" size={22} color="#0F0F0F" />
          </Pressable>

          {/* Right-side floating action cluster — unified glass pill */}
          <View
            style={{
              position: 'absolute',
              right: 14,
              bottom: 60,
              borderRadius: 28,
              overflow: 'hidden',
              ...iosShadow,
            }}
          >
            {IS_IOS ? (
              <BlurView intensity={85} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.94)' }]} />
            )}
            <Pressable
              onPress={handleHeartPress}
              onLongPress={() => { tap('medium'); setSaveListVisible(true); }}
              delayLongPress={350}
              style={({ pressed }) => ({
                width: 50,
                paddingTop: 12,
                paddingBottom: 12,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}
            >
              <LikeBurst liked={liked} size={20} color={BRAND_PURPLE} inactiveColor={BRAND_INK} />
              <AnimatedNumber
                value={heartCount}
                height={14}
                style={{ fontSize: 11, fontWeight: '700', color: BRAND_INK, marginTop: 2 }}
              />
            </Pressable>
            {/* Divider between heart and bookmark */}
            <View
              style={{
                height: HAIRLINE,
                width: 32,
                alignSelf: 'center',
                backgroundColor: 'rgba(15,15,15,0.12)',
              }}
            />
            <Pressable
              onPress={() => {
                if (!user?.id) {
                  toast.show('Sign in to save', { variant: 'info', icon: 'log-in' });
                  router.push('/auth/login');
                  return;
                }
                tap('medium');
                setSaveListVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Edit save lists' : 'Save to list'}
              style={({ pressed }) => ({
                width: 50,
                paddingTop: 12,
                paddingBottom: 12,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}
            >
              <Feather
                name="bookmark"
                size={20}
                color={saved ? BRAND_PURPLE : BRAND_INK}
              />
            </Pressable>
          </View>

          {/* Pagination dashes */}
          {listing.images.length > 1 && (
            <View
              style={{
                position: 'absolute',
                bottom: 18,
                left: 0,
                right: 0,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {listing.images.map((_, i) => (
                <HeroPageDot key={i} index={i} offsetX={heroOffsetX} pageWidth={width} />
              ))}
            </View>
          )}
        </View>

        {/* ── Title block (editorial) ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 }}>
          {/* Title + price row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flex: 1, paddingRight: 14 }}>
              {heartCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
                <Feather name="heart" size={13} color="rgba(15,15,15,0.62)" />
                <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.62)' }}>
                  Liked by <Text style={{ fontWeight: '700', color: BRAND_INK }}>{heartCount} {heartCount === 1 ? 'person' : 'people'}</Text>
                </Text>
              </View>
              )}
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: '900',
                  color: BRAND_INK,
                  lineHeight: 32,
                  letterSpacing: -0.6,
                }}
              >
                {listing.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8, gap: 8 }}>
                <View
                  style={{
                    backgroundColor: 'rgba(15,15,15,0.04)',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_INK }}>
                    Size {listing.size}
                  </Text>
                </View>
                {/* Condition is a primary purchase factor — surface it next to
                    size instead of burying it in the details rows below. */}
                {conditionLabel(listing.condition) ? (
                  <View
                    style={{
                      backgroundColor: BRAND_PURPLE_SOFT,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_PURPLE }}>
                      {conditionLabel(listing.condition)}
                    </Text>
                  </View>
                ) : null}
                {listing.seller?.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="map-pin" size={11} color="rgba(15,15,15,0.62)" />
                    <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)' }} numberOfLines={1}>
                      {listing.seller.location}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: '900',
                  color: BRAND_INK,
                  lineHeight: 32,
                  letterSpacing: -0.6,
                }}
              >
                ${listing.price}
              </Text>
            </View>
          </View>

        </View>

        {/* ── Bundle teaser — the bundle builder lives at the bottom of the
            page, so without this it's invisible until a buyer happens to
            scroll past everything. Shown only when there's actually
            something to bundle. ── */}
        {!isOwnListing && sellerItems.length > 0 ? (
          <Pressable
            onPress={() => {
              tap('selection');
              setRelatedTab('members');
              // Let the tab content mount, then jump to it.
              requestAnimationFrame(() => mainScrollRef.current?.scrollToEnd({ animated: true }));
            }}
            style={({ pressed }) => ({
              marginHorizontal: 16,
              marginBottom: 4,
              backgroundColor: BRAND_PURPLE_SOFT,
              borderRadius: 16,
              paddingLeft: 14,
              paddingRight: 10,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Ionicons name="pricetags" size={14} color={BRAND_PURPLE} />
            </View>
            <Text style={{ flex: 1, color: BRAND_INK, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
              <Text style={{ fontWeight: '800' }}>Bundle & save up to 20%</Text>
              {' '}· {sellerItems.length} more from @{listing.seller.username}
            </Text>
            <Feather name="chevron-down" size={16} color={BRAND_PURPLE} />
          </Pressable>
        ) : null}

        {/* ── Seller card ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 }}>
          <View
            style={{
              backgroundColor: 'rgba(15,15,15,0.04)',
              borderRadius: 18,
              borderWidth: HAIRLINE,
              borderColor: 'rgba(15,15,15,0.08)',
              padding: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Avatar with subtle ring */}
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  padding: 2,
                  backgroundColor: 'white',
                  borderWidth: HAIRLINE,
                  borderColor: 'rgba(15,15,15,0.08)',
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(15,15,15,0.08)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {listing.seller.avatar_url ? (
                    <Image
                      source={{ uri: getOptimizedImageUrl(listing.seller.avatar_url, { width: 120 }) }}
                      style={{ width: 52, height: 52 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={150}
                    />
                  ) : (
                    <Feather name="user" size={22} color="rgba(15,15,15,0.45)" />
                  )}
                </View>
              </View>

              {/* Seller info */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: BRAND_INK }} numberOfLines={1}>
                  @{listing.seller.username}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <StarRating rating={listing.seller.rating} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: BRAND_INK }}>
                    {listing.seller.rating?.toFixed?.(1) ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)' }}>
                    ({Math.round(listing.seller.rating ? Number(listing.seller.total_sales ?? 0) : 0)})
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)', marginTop: 3 }}>
                  {Number(listing.seller.total_sales ?? 0)} sales · {sellerItems.length + 1} listed
                </Text>
              </View>
            </View>

            {/* Follow + Message — hidden when viewing your own listing */}
            {isOwnListing ? (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={handleToggleSold}
                  disabled={ownerBusy !== null}
                  testID="owner-toggle-sold"
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: listing.is_sold ? 'white' : BRAND_INK,
                    borderWidth: listing.is_sold ? HAIRLINE : 0,
                    borderColor: 'rgba(15,15,15,0.08)',
                    opacity: ownerBusy === 'sold' ? 0.5 : pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  <Feather
                    name={listing.is_sold ? 'rotate-ccw' : 'check'}
                    size={14}
                    color={listing.is_sold ? BRAND_INK : 'white'}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: listing.is_sold ? BRAND_INK : 'white',
                    }}
                  >
                    {listing.is_sold ? 'Mark available' : 'Mark as sold'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleDelete}
                  disabled={ownerBusy !== null}
                  testID="owner-delete"
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: 'white',
                    borderWidth: HAIRLINE,
                    borderColor: 'rgba(15,15,15,0.08)',
                    opacity: ownerBusy === 'delete' ? 0.5 : pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  <Feather name="trash-2" size={14} color={BRAND_INK} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_INK }}>
                    Delete
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={handleFollowPress}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: followed ? 'white' : BRAND_PURPLE,
                    borderWidth: followed ? HAIRLINE : 0,
                    borderColor: 'rgba(15,15,15,0.08)',
                    opacity: pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  <Feather
                    name={followed ? 'check' : 'plus'}
                    size={14}
                    color={followed ? BRAND_INK : 'white'}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: followed ? BRAND_INK : 'white',
                    }}
                  >
                    {followed ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => openChat('message')}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: 'white',
                    borderWidth: HAIRLINE,
                    borderColor: 'rgba(15,15,15,0.08)',
                    opacity: pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  <Feather name="message-circle" size={14} color={BRAND_INK} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_INK }}>
                    Message
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* ── Description + Details ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 10,
              marginLeft: 4,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: BRAND_LIME,
                marginRight: 8,
              }}
            />
            <Text
              style={{
                fontSize: 11,
                color: BRAND_INK,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                fontFamily: 'Inter_700Bold',
              }}
            >
              Item description
            </Text>
          </View>
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 18,
              borderWidth: HAIRLINE,
              borderColor: 'rgba(15,15,15,0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Description block */}
            <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16 }}>
              <Text
                style={{
                  fontSize: 18,
                  color: BRAND_INK,
                  lineHeight: 28,
                  fontFamily: 'Fraunces_400Regular',
                  letterSpacing: -0.1,
                }}
              >
                {listing.description}
              </Text>
              <Pressable
                onPress={() => Alert.alert('Translation')}
                style={({ pressed }) => ({
                  marginTop: 14,
                  alignSelf: 'flex-start',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: LINK_PURPLE,
                    fontFamily: 'Inter_600SemiBold',
                    letterSpacing: 0.1,
                  }}
                >
                  Show translation
                </Text>
              </Pressable>
            </View>

            {/* Details rows */}
            {[
              {
                label: 'Category',
                value: CATEGORY_LABELS[listing.category] ?? listing.category,
                onPress: () => {},
                trailing: <Feather name="arrow-up-right" size={20} color={BRAND_INK} />,
              },
              {
                label: 'Brand',
                value: listing.brand,
                onPress: () => {},
                trailing: <Feather name="arrow-up-right" size={20} color={BRAND_INK} />,
              },
              {
                label: 'Size',
                value: listing.size,
              },
              {
                label: 'Condition',
                value: CONDITION_LABELS[listing.condition] ?? listing.condition,
                onPress: () => Alert.alert('Condition info', 'Details about condition grading'),
                trailing: <Feather name="arrow-up-right" size={20} color={BRAND_INK} />,
              },
              {
                label: 'Color',
                value: ITEM_COLOR.name,
                trailing: (
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      padding: 2,
                      backgroundColor: 'white',
                      borderWidth: HAIRLINE,
                      borderColor: 'rgba(15,15,15,0.08)',
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 7,
                        backgroundColor: ITEM_COLOR.hex,
                      }}
                    />
                  </View>
                ),
              },
            ].map((row) => {
              return (
                <Pressable
                  key={row.label}
                  onPress={row.onPress}
                  disabled={!row.onPress}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    borderTopWidth: HAIRLINE,
                    borderTopColor: 'rgba(15,15,15,0.08)',
                    backgroundColor: pressed && row.onPress ? 'rgba(15,15,15,0.04)' : 'white',
                  })}
                >
                  <Text style={{ flex: 1, fontSize: 15, color: BRAND_INK }} numberOfLines={1}>
                    <Text style={{ fontFamily: 'Inter_700Bold', letterSpacing: 0.1 }}>{row.label}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular' }}>   </Text>
                    <Text style={{ fontFamily: 'Fraunces_400Regular', fontSize: 16 }}>{row.value}</Text>
                  </Text>
                  {row.trailing}
                </Pressable>
              );
            })}
          </View>

          {/* Tags — tap to search by tag */}
          {listing.tags && listing.tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 8, paddingHorizontal: 4 }}>
              {listing.tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => router.push(`/(tabs)/discover?q=${encodeURIComponent(tag)}` as any)}
                  style={({ pressed }) => ({
                    backgroundColor: TAG_BG,
                    borderWidth: HAIRLINE,
                    borderColor: TAG_BORDER,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: 'rgba(15,15,15,0.62)',
                      fontFamily: 'Inter_500Medium',
                      letterSpacing: 0.1,
                    }}
                  >
                    #{tag}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Share / Report row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 22,
              paddingHorizontal: 4,
            }}
          >
            <Pressable
              onPress={() => Alert.alert('Share')}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 6,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="share-2" size={16} color={BRAND_INK} />
              <Text
                style={{
                  fontSize: 13,
                  color: BRAND_INK,
                  fontFamily: 'Inter_600SemiBold',
                  letterSpacing: 0.2,
                }}
              >
                Share
              </Text>
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Report')}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 6,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="flag" size={16} color="rgba(15,15,15,0.62)" />
              <Text
                style={{
                  fontSize: 13,
                  color: 'rgba(15,15,15,0.62)',
                  fontFamily: 'Inter_600SemiBold',
                  letterSpacing: 0.2,
                }}
              >
                Report
              </Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: 'rgba(15,15,15,0.45)',
                  letterSpacing: 0.6,
                  fontFamily: 'Inter_500Medium',
                }}
              >
                ID · {listing.id.slice(0, 8)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Trust card (Verified + Protection combined) ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 6 }}>
          <View style={{ paddingHorizontal: 4 }}>
            <SectionEyebrow label="Buyer trust" />
          </View>
          <View
            style={{
              backgroundColor: BRAND_PURPLE_SOFT,
              borderRadius: 18,
              overflow: 'hidden',
            }}
          >
            {/* Plain info rows — these had pressed states and chevrons wired
                to no-op handlers, which promises navigation that never
                happens. Static until there's a real destination to open. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: 16,
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: 'white',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark-circle" size={22} color={BRAND_PURPLE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND_INK, marginBottom: 3 }}>
                  Carrinex Verified
                </Text>
                <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)', lineHeight: 18 }}>
                  Authenticated by our in-house team or a trusted partner.
                </Text>
              </View>
            </View>

            <View style={{ height: HAIRLINE, marginHorizontal: 16, backgroundColor: 'rgba(108,71,255,0.18)' }} />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: 16,
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: 'white',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="shield-checkmark" size={20} color={BRAND_PURPLE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND_INK, marginBottom: 3 }}>
                  Purchase Protection
                </Text>
                <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)', lineHeight: 18 }}>
                  Qualifying orders covered if something goes wrong.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Member's / Similar tabs (pill style) ── */}
        <View style={{ marginTop: 22 }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 }}>
            {(['members', 'similar'] as const).map((tab) => {
              const active = relatedTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => { tap('selection'); setRelatedTab(tab); }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: active ? BRAND_PURPLE : 'rgba(15,15,15,0.04)',
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  })}
                >
                  <Ionicons
                    name={tab === 'members' ? 'person' : 'sparkles'}
                    size={13}
                    color={active ? 'white' : '#0F0F0F'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: active ? 'white' : '#0F0F0F',
                    }}
                  >
                    {tab === 'members' ? "Seller's items" : 'Similar items'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* TODO: replace MEMBER_ITEMS / SIMILAR_ITEMS with real Supabase queries
              (seller_id eq for member items; brand+category match for similar). */}
          {relatedTab === 'members' ? (
            <BundleSection
              listing={listing}
              sellerItems={sellerItems}
              selectedIds={selectedBundleIds}
              onToggle={(id) => {
                tap('selection');
                setSelectedBundleIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onSendBundleOffer={(amount) => {
                tap('medium');
                if (!user) {
                  toast.show('Sign in to message sellers', { variant: 'info', icon: 'log-in' });
                  router.push('/auth/login');
                  return;
                }
                if (listing.seller_id === user.id) {
                  toast.show("That's your own listing", { variant: 'default', icon: 'info' });
                  return;
                }
                router.push({
                  pathname: '/conversation/new',
                  params: {
                    listing: listing.id,
                    mode: 'offer',
                    amount: amount.toFixed(2),
                  },
                } as any);
              }}
            />
          ) : (
            <View style={{ paddingTop: 18 }}>
              {similarItems.length === 0 ? (
                <View style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
                  <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.62)' }}>
                    No similar items found yet — check back soon.
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
                  {similarItems.map((row) => {
                    const item = listingToRelated(row);
                    return (
                      <RelatedItemCard
                        key={item.id}
                        item={item}
                        onPress={() => router.push(`/product/${item.id}`)}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── Fixed bottom bar — hidden when viewing your own listing ── */}
      {!isOwnListing && (
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
          paddingBottom: insets.bottom || 16,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
          ...(IS_IOS && {
            boxShadow: '0px -3px 12px rgba(0,0,0,0.06)',
          }),
        }}
      >
        <Pressable
          onPress={() => openChat('offer')}
          style={({ pressed }) => ({
            paddingHorizontal: 18,
            height: 50,
            borderRadius: 14,
            borderWidth: HAIRLINE,
            borderColor: 'rgba(15,15,15,0.08)',
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
          <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_INK }}>
            Offer
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            tap('medium');
            if (!user) {
              toast.show('Sign in to buy', { variant: 'info', icon: 'log-in' });
              router.push('/auth/login');
              return;
            }
            if (!listing?.id) return;
            if (listing.seller_id === user.id) {
              toast.show("That's your own listing", { variant: 'default', icon: 'info' });
              return;
            }
            router.push(`/payment/${listing.id}` as any);
          }}
          style={({ pressed }) => ({
            flex: 1,
            height: 50,
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
            Buy now
          </Text>
          <View
            style={{
              marginLeft: 10,
              backgroundColor: BRAND_LIME,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.2 }}>
              ${listing.price}
            </Text>
          </View>
        </Pressable>
      </View>
      )}

      {/* Save-to-list sheet — opens from the bookmark pill or by long-pressing
          the heart. The listing is "saved" if it lives in any of the user's
          lists; the sheet handles list creation + per-list toggling. */}
      {user?.id ? (
        <SaveListSheet
          visible={saveListVisible}
          userId={user.id}
          listingId={listing.id}
          onClose={() => setSaveListVisible(false)}
          onChanged={setSaved}
        />
      ) : null}

      {/* Fullscreen image viewer — opens on tap, swipe to navigate */}
      <FullscreenImageViewer
        visible={fullscreenIndex !== null}
        images={listing.images}
        initialIndex={fullscreenIndex ?? 0}
        onClose={() => setFullscreenIndex(null)}
      />
    </View>
  );
}
