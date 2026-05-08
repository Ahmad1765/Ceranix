import { useState } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import type { Listing } from '@/types';

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
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    }
  : { elevation: 3 };

const { width } = Dimensions.get('window');
const IMAGE_HEIGHT = width * 1.45;

function PinIcon({
  size = 22,
  color = '#111827',
  filled = false,
}: { size?: number; color?: string; filled?: boolean }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: [{ rotate: '45deg' }] }}
    >
      <Path d="M12 17v5" />
      <Path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Svg>
  );
}

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

const ITEM_COLOR = { name: 'Marine blue', hex: '#1d4ed8' };

const ITEM_TAGS = [
  'arcteryx',
  'jacket',
  'gorpcore',
  'midlayer',
  'hiking',
  'skiing',
  'lightweight',
  'breathable',
];

// Unified brand palette (matches home tabs + PromoBanner)
const BRAND_PURPLE = '#6C47FF';
const BRAND_LIME = '#c8e83a';
const BRAND_DARK = '#111827';
const TAG_BG = BRAND_LIME;
const LINK_PURPLE = BRAND_PURPLE;
const PLICK_LIME = BRAND_LIME;

const REVIEWS_COUNT = 7;
const TRANSACTIONS_COUNT = 12;
const ITEMS_FOR_SALE = 9;
const LISTING_ID = '91740406';
const PIN_COUNT = 2;

const MOCK_LISTING: Listing = {
  id: '1',
  seller_id: 'u1',
  seller: {
    id: 'u1',
    username: 'mattsunil4048',
    avatar_url: 'https://picsum.photos/seed/avatar1/100/100',
    full_name: 'Matt Sunil',
    bio: null,
    location: 'Canada',
    rating: 5,
    total_sales: 12,
    created_at: '',
  },
  title: 'Arcteryx Atom SL Hoody',
  description: 'Great mid-layer jacket!\nSuper warm while hiking or skiing',
  price: 202,
  category: 'clothing',
  gender: 'men',
  brand: "Arc'teryx",
  size: 'M',
  condition: 'good',
  images: [
    'https://picsum.photos/seed/poc1/400/520',
    'https://picsum.photos/seed/poc2/400/520',
    'https://picsum.photos/seed/poc3/400/520',
  ],
  is_sold: false,
  views: 120,
  likes: 83,
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

const MEMBER_ITEMS: RelatedItem[] = [
  {
    id: 'm1',
    images: [
      'https://picsum.photos/seed/mi1/400/520',
      'https://picsum.photos/seed/mi1b/400/520',
      'https://picsum.photos/seed/mi1c/400/520',
    ],
    brand: 'Ralph Lauren',
    meta: 'S · Very good',
    price: 49,
    inclPrice: 52.15,
    likes: 7,
  },
  {
    id: 'm2',
    images: [
      'https://picsum.photos/seed/mi2/400/520',
      'https://picsum.photos/seed/mi2b/400/520',
      'https://picsum.photos/seed/mi2c/400/520',
    ],
    brand: 'Carolina Herrera',
    meta: 'S / 36 / 8 · New with tags',
    price: 190,
    inclPrice: 200.2,
    likes: 8,
  },
  {
    id: 'm3',
    images: [
      'https://picsum.photos/seed/mi3/400/520',
      'https://picsum.photos/seed/mi3b/400/520',
      'https://picsum.photos/seed/mi3c/400/520',
    ],
    brand: 'Hugo Boss',
    meta: 'M · Good',
    price: 35,
    inclPrice: 37.65,
    likes: 4,
  },
  {
    id: 'm4',
    images: [
      'https://picsum.photos/seed/mi4/400/520',
      'https://picsum.photos/seed/mi4b/400/520',
      'https://picsum.photos/seed/mi4c/400/520',
    ],
    brand: 'Burberry',
    meta: 'L · Very good',
    price: 89,
    inclPrice: 94.2,
    likes: 12,
  },
];

const SIMILAR_ITEMS: RelatedItem[] = [
  {
    id: 's1',
    images: [
      'https://picsum.photos/seed/si1/400/520',
      'https://picsum.photos/seed/si1b/400/520',
      'https://picsum.photos/seed/si1c/400/520',
    ],
    brand: "Arc'teryx",
    meta: 'M · Very good',
    price: 175,
    inclPrice: 184.65,
    likes: 23,
  },
  {
    id: 's2',
    images: [
      'https://picsum.photos/seed/si2/400/520',
      'https://picsum.photos/seed/si2b/400/520',
      'https://picsum.photos/seed/si2c/400/520',
    ],
    brand: 'Patagonia',
    meta: 'L · Like new',
    price: 120,
    inclPrice: 126.6,
    likes: 15,
  },
  {
    id: 's3',
    images: [
      'https://picsum.photos/seed/si3/400/520',
      'https://picsum.photos/seed/si3b/400/520',
      'https://picsum.photos/seed/si3c/400/520',
    ],
    brand: 'The North Face',
    meta: 'M · Good',
    price: 95,
    inclPrice: 100.45,
    likes: 9,
  },
  {
    id: 's4',
    images: [
      'https://picsum.photos/seed/si4/400/520',
      'https://picsum.photos/seed/si4b/400/520',
      'https://picsum.photos/seed/si4c/400/520',
    ],
    brand: 'Stone Island',
    meta: 'L · Very good',
    price: 245,
    inclPrice: 258.95,
    likes: 31,
  },
];

const TEAL = BRAND_PURPLE;
const BUNDLE_BLUE = BRAND_PURPLE;

type SaveList = { id: string; name: string; emoji: string; count: number };
const SAVE_LISTS: SaveList[] = [
  { id: 'liked', name: 'Liked items', emoji: '❤️', count: 47 },
  { id: 'wishlist', name: 'Wishlist', emoji: '⭐', count: 12 },
  { id: 'gifts', name: 'Gift ideas', emoji: '🎁', count: 5 },
  { id: 'later', name: 'Saved for later', emoji: '🔖', count: 23 },
];

const BUNDLE_MILESTONES = [
  { items: '1 item', discount: '0% off', active: false },
  { items: '2 items', discount: '5% off', active: true },
  { items: '3 items', discount: '10% off', active: true },
  { items: '4 items', discount: '15% off', active: true },
  { items: '5+ items', discount: '20% off', active: true },
];

const CARD_GAP = 8;
const CARD_OUTER_PAD = 12;
// Floor so 2*CARD_WIDTH + CARD_GAP can never exceed the row width due to
// sub-pixel rounding — otherwise the second card wraps and the grid
// collapses into a single column on certain devices/layout passes.
const CARD_WIDTH = Math.floor((width - CARD_OUTER_PAD * 2 - CARD_GAP) / 2);
const CARD_IMAGE_HEIGHT = Math.round(CARD_WIDTH * 1.25);

/**
 * Pinch-to-zoom + pan + double-tap zoom for hero carousel images.
 * Reports zoom state up so parent can lock the horizontal pager.
 */
function ZoomableImage({
  uri,
  imgWidth,
  imgHeight,
  sharedTag,
  onZoomChange,
}: {
  uri: string;
  imgWidth: number;
  imgHeight: number;
  sharedTag?: string;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Lock parent pager while zoomed
  useAnimatedReaction(
    () => scale.value > 1.04,
    (zoomed, prev) => {
      if (zoomed !== prev && onZoomChange) runOnJS(onZoomChange)(zoomed);
    },
    [onZoomChange]
  );

  const reset = () => {
    'worklet';
    scale.value = withSpring(1, { damping: 18, stiffness: 180 });
    savedScale.value = 1;
    tx.value = withSpring(0);
    ty.value = withSpring(0);
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 4));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) reset();
    });

  // Single-finger pan only activates while zoomed; otherwise fails so the
  // parent horizontal carousel keeps its swipe-to-page gesture.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .maxPointers(1)
    .onTouchesMove((_, manager) => {
      if (scale.value > 1.04) manager.activate();
      else manager.fail();
    })
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd(() => {
      if (scale.value > 1.05) {
        reset();
      } else {
        scale.value = withSpring(2.2, { damping: 18, stiffness: 180 });
        savedScale.value = 2.2;
      }
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Race(doubleTap, pan));

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width: imgWidth, height: imgHeight, overflow: 'hidden' }, animStyle]}>
        <AnimatedExpoImage
          source={{ uri }}
          style={{ width: imgWidth, height: imgHeight }}
          contentFit="cover"
          sharedTransitionTag={sharedTag}
        />
      </Animated.View>
    </GestureDetector>
  );
}

function SaveListSheet({
  visible,
  onClose,
  onSelect,
  selectedId,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {IS_IOS ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        )}
        <Pressable
          onPress={() => {}}
          style={{
            width: width - 56,
            maxWidth: 360,
            backgroundColor: IS_IOS ? 'rgba(255,255,255,0.96)' : 'white',
            borderRadius: 18,
            paddingVertical: 6,
            ...iosShadow,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: '#6b7280',
              textAlign: 'center',
              paddingTop: 14,
              paddingBottom: 10,
              letterSpacing: 0.2,
            }}
          >
            Save to list
          </Text>
          <View style={{ height: HAIRLINE, backgroundColor: '#e5e7eb', marginHorizontal: 12 }} />
          {SAVE_LISTS.map((list, i) => {
            const isLast = i === SAVE_LISTS.length - 1;
            const isSelected = list.id === selectedId;
            return (
              <Pressable
                key={list.id}
                onPress={() => { tap('selection'); onSelect(list.id); onClose(); }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 18,
                  borderBottomWidth: isLast ? 0 : HAIRLINE,
                  borderBottomColor: '#e5e7eb',
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                <Text style={{ fontSize: 22, marginRight: 12 }}>{list.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>{list.name}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{list.count} items</Text>
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={22} color={BRAND_PURPLE} />}
              </Pressable>
            );
          })}
          <View style={{ height: HAIRLINE, backgroundColor: '#e5e7eb', marginHorizontal: 12 }} />
          <Pressable
            onPress={() => { tap('selection'); Alert.alert('New list', 'Create list flow…'); onClose(); }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 14,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Feather name="plus" size={18} color={BRAND_PURPLE} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: BRAND_PURPLE, marginLeft: 6 }}>
              Create new list
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RelatedItemCard({ item, onPress }: { item: RelatedItem; onPress: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultiple = item.images.length > 1;
  return (
    <Pressable onPress={onPress} style={{ width: CARD_WIDTH, marginBottom: 18 }}>
      <View
        style={{
          position: 'relative',
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 6,
          overflow: 'hidden',
          backgroundColor: '#f3f4f6',
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
            scrollEventThrottle={16}
            disableIntervalMomentum
          >
            {item.images.map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <Image
            source={{ uri: item.images[0] }}
            style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
            contentFit="cover"
          />
        )}

        {hasMultiple && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 6,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
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

        <View
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            backgroundColor: 'white',
            borderRadius: 16,
            paddingHorizontal: 9,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        >
          <Feather name="heart" size={13} color="#374151" />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{item.likes}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, color: '#374151', marginTop: 8 }} numberOfLines={1}>
        {item.brand}
      </Text>
      <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }} numberOfLines={1}>
        {item.meta}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 4 }}>
        ${item.price.toFixed(2)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <Text style={{ fontSize: 13, color: TEAL }}>${item.inclPrice.toFixed(2)} incl.</Text>
        <Ionicons name="shield-checkmark" size={13} color={TEAL} />
      </View>
    </Pressable>
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
          color={i < full ? '#f59e0b' : '#d1d5db'}
        />
      ))}
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [activeImage, setActiveImage] = useState(0);
  const [liked, setLiked] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [relatedTab, setRelatedTab] = useState<'members' | 'similar'>('members');
  const [heroPagerEnabled, setHeroPagerEnabled] = useState(true);
  const [saveListVisible, setSaveListVisible] = useState(false);
  const [savedToList, setSavedToList] = useState<string | null>(null);
  const listing = MOCK_LISTING;
  const productIdParam = Array.isArray(id) ? id[0] : id;
  const sharedTagId = productIdParam ?? listing.id;

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

  const originalPrice = Math.round(listing.price * 1.24);
  const discountPct = Math.round((1 - listing.price / originalPrice) * 100);
  const offerPrice = Math.floor(listing.price * 0.9);
  const heartCount = liked ? listing.likes + 1 : listing.likes;

  const metaLine = [
    listing.gender === 'men' ? `Men's US ${listing.size} / EU 48-50 / 2` : listing.size,
    CONDITION_LABELS[listing.condition] ?? listing.condition,
    listing.seller.location ? `Located in ${listing.seller.location}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Status-bar mode flips when sticky header takes over */}
      <StatusBar style={showStickyHeader ? 'dark' : 'light'} animated />

      {/* Sticky header */}
      {showStickyHeader && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
          backgroundColor: 'white',
          borderBottomWidth: HAIRLINE, borderBottomColor: '#e5e7eb',
          paddingTop: insets.top,
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingBottom: 12,
          ...(IS_IOS && {
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
          }),
        }}>
          <Pressable onPress={() => { tap('selection'); router.back(); }} hitSlop={10} style={({ pressed }) => ({ marginRight: 12, opacity: pressed ? 0.5 : 1 })}>
            <Feather name="arrow-left" size={22} color="#111827" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
            {listing.title}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
            ${listing.price}
          </Text>
        </View>
      )}

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Image carousel (full-bleed to top, Plick style) ── */}
        <View style={{ position: 'relative' }}>
          {/* Parallax/stretch layer wraps ONLY the carousel; floating UI is unaffected */}
          <Animated.View style={heroParallaxStyle}>
            <ScrollView
              horizontal
              pagingEnabled
              scrollEnabled={heroPagerEnabled}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              onScroll={(e) => setActiveImage(Math.round(e.nativeEvent.contentOffset.x / width))}
              scrollEventThrottle={16}
            >
              {listing.images.map((uri, i) => (
                <ZoomableImage
                  key={i}
                  uri={uri}
                  imgWidth={width}
                  imgHeight={IMAGE_HEIGHT}
                  sharedTag={i === 0 ? `product-image-${sharedTagId}` : undefined}
                  onZoomChange={(zoomed) => setHeroPagerEnabled(!zoomed)}
                />
              ))}
            </ScrollView>
          </Animated.View>

          {/* Back arrow — frosted glass on iOS so it stays visible over light photos */}
          <Pressable
            onPress={() => { tap('selection'); router.back(); }}
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
            <Feather name="arrow-left" size={22} color="#111827" />
          </Pressable>

          {/* Right-side floating action stack (pin + heart) */}
          <View
            style={{
              position: 'absolute',
              right: 14,
              bottom: 60,
              alignItems: 'center',
              gap: 14,
            }}
          >
            <Pressable
              onPress={() => { tap('light'); setPinned(!pinned); }}
              style={({ pressed }) => ({
                width: 54,
                height: 54,
                borderRadius: 27,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
                ...iosShadow,
              })}
            >
              {IS_IOS ? (
                <BlurView intensity={80} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'white' }]} />
              )}
              <PinIcon size={22} color="#111827" filled={pinned} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827', marginTop: -2 }}>
                {PIN_COUNT + (pinned ? 1 : 0)}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => { tap('light'); setLiked(!liked); }}
              onLongPress={() => { tap('medium'); setSaveListVisible(true); }}
              delayLongPress={350}
              style={({ pressed }) => ({
                width: 54,
                height: 54,
                borderRadius: 27,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
                ...iosShadow,
              })}
            >
              {IS_IOS ? (
                <BlurView intensity={80} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'white' }]} />
              )}
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={22}
                color={liked ? '#ef4444' : '#111827'}
              />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827', marginTop: -2 }}>
                {heartCount}
              </Text>
            </Pressable>
          </View>

          {/* Pagination — Plick-style dashes */}
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
                <View
                  key={i}
                  style={{
                    width: 28,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: i === activeImage ? 'white' : '#111827',
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Plick-style heading section ── */}
        <View style={{ backgroundColor: PLICK_LIME, paddingHorizontal: 20, paddingVertical: 16 }}>
          <Text style={{ fontSize: 16, color: '#111827', textAlign: 'center' }}>
            Get 10% off! Buy a bundle from the seller
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          <Text style={{ fontSize: 14, color: '#111827' }}>
            Liked by{' '}
            <Text style={{ fontWeight: '700' }}>@alice.333</Text>
            {' '}and {heartCount - 1} others
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginTop: 14,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#111827' }}>
                {listing.title}
              </Text>
              <Text style={{ fontSize: 16, color: '#111827', marginTop: 4 }}>
                <Text style={{ fontWeight: '700' }}>Size </Text>
                {listing.size}
              </Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>
              ${listing.price}
            </Text>
          </View>

          <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 18 }}>
            Annons
          </Text>
        </View>

        {/* ── Seller card ── */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: HAIRLINE, borderTopColor: '#e5e7eb' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            {/* Avatar */}
            <View style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
              {listing.seller.avatar_url ? (
                <Image source={{ uri: listing.seller.avatar_url }} style={{ width: 52, height: 52 }} contentFit="cover" />
              ) : (
                <Feather name="user" size={24} color="#9ca3af" />
              )}
            </View>

            {/* Seller info */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                {listing.seller.username}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <StarRating rating={listing.seller.rating} />
                <Text style={{ fontSize: 13, color: '#374151' }}>{REVIEWS_COUNT} Reviews</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
                {TRANSACTIONS_COUNT} Transactions{'  '}
                <Text style={{ textDecorationLine: 'underline' }}>{ITEMS_FOR_SALE} items for sale</Text>
              </Text>
            </View>
          </View>

          {/* Follow + Message buttons */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => { tap('selection'); setFollowed(!followed); }}
              style={({ pressed }) => ({
                flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
                backgroundColor: followed ? '#f3f4f6' : BRAND_DARK,
                borderWidth: followed ? HAIRLINE : 0, borderColor: '#d1d5db',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: followed ? BRAND_DARK : 'white', letterSpacing: 0.5 }}>
                {followed ? 'FOLLOWING' : 'FOLLOW'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { tap('medium'); Alert.alert('Message', 'Opening chat...'); }}
              style={({ pressed }) => ({ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: BRAND_PURPLE, opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: 'white', letterSpacing: 0.5 }}>
                SEND A MESSAGE
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Item description ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, borderTopWidth: HAIRLINE, borderTopColor: '#e5e7eb' }}>
          <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>
            Item description
          </Text>

          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
            {/* Description text */}
            <Text style={{ fontSize: 16, color: '#111827', lineHeight: 24 }}>
              {listing.description}
            </Text>

            {/* Show translation */}
            <Pressable onPress={() => Alert.alert('Translation')} style={{ marginTop: 14, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: LINK_PURPLE }}>
                Show translation
              </Text>
            </Pressable>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 18 }} />

            {/* Category */}
            <Pressable onPress={() => {}} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#111827', flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>Category </Text>
                {CATEGORY_LABELS[listing.category] ?? listing.category}
              </Text>
              <Feather name="arrow-up-right" size={20} color="#111827" />
            </Pressable>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 }} />

            {/* Size */}
            <Text style={{ fontSize: 16, color: '#111827' }}>
              <Text style={{ fontWeight: '700' }}>Size </Text>
              {listing.size}
            </Text>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 }} />

            {/* Condition */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#111827', flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>Condition </Text>
                {CONDITION_LABELS[listing.condition] ?? listing.condition}
              </Text>
              <Pressable onPress={() => Alert.alert('Condition info', 'Details about condition grading')} hitSlop={8}>
                <Feather name="info" size={20} color="#111827" />
              </Pressable>
            </View>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 }} />

            {/* Color */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#111827' }}>
                <Text style={{ fontWeight: '700' }}>Color </Text>
                {ITEM_COLOR.name}
              </Text>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  marginLeft: 8,
                  backgroundColor: ITEM_COLOR.hex,
                  borderWidth: 2,
                  borderColor: '#e5e7eb',
                }}
              />
            </View>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 }} />

            {/* Brand */}
            <Pressable onPress={() => {}} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#111827', flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>Brand </Text>
                {listing.brand}
              </Text>
              <Feather name="arrow-up-right" size={20} color="#111827" />
            </Pressable>
          </View>

          {/* Tags */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 8 }}>
            {ITEM_TAGS.map((tag) => (
              <View
                key={tag}
                style={{
                  backgroundColor: TAG_BG,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ fontSize: 14, color: '#374151' }}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Contact / Share / Report */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 24,
              paddingHorizontal: 8,
            }}
          >
            <Pressable
              onPress={() => Alert.alert('Contact')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Feather name="message-circle" size={22} color="#111827" />
              <Text style={{ fontSize: 16, color: '#111827' }}>Contact</Text>
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Share')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Feather name="share-2" size={22} color="#111827" />
              <Text style={{ fontSize: 16, color: '#111827' }}>Share</Text>
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Report')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Feather name="alert-triangle" size={22} color="#111827" />
              <Text style={{ fontSize: 16, color: '#111827' }}>Report</Text>
            </Pressable>
          </View>

          {/* Listing meta */}
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 16, paddingHorizontal: 8 }}>
            Listing ID {LISTING_ID}
          </Text>
        </View>

        {/* ── Carrinex Verified card ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Ionicons name="checkmark-circle" size={28} color={BRAND_PURPLE} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Carrinex Verified</Text>
          </View>
          <Text style={{ fontSize: 13, color: '#374151', lineHeight: 19 }}>
            This item has been verified by our in-house team or a trusted partner.{' '}
            <Text style={{ color: BRAND_PURPLE, fontWeight: '700' }} onPress={() => {}}>Learn More.</Text>
          </Text>
        </View>

        {/* ── Purchase Protection card ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Ionicons name="shield" size={26} color={BRAND_PURPLE} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Carrinex Purchase Protection</Text>
          </View>
          <Text style={{ fontSize: 13, color: '#374151', lineHeight: 19, marginBottom: 14 }}>
            We want you to feel safe buying and selling on Carrinex. Qualifying orders are covered by our Purchase Protection in the rare case something goes wrong.
          </Text>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} onPress={() => {}}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>How You're Protected</Text>
            <Feather name="chevron-down" size={18} color="#6b7280" />
          </Pressable>
        </View>

        {/* ── Member's items / Similar items tabs ── */}
        <View style={{ borderTopWidth: HAIRLINE, borderTopColor: '#e5e7eb' }}>
          <View style={{ flexDirection: 'row', borderBottomWidth: HAIRLINE, borderBottomColor: '#e5e7eb' }}>
            <Pressable
              onPress={() => { tap('selection'); setRelatedTab('members'); }}
              style={{
                flex: 1,
                paddingVertical: 16,
                alignItems: 'center',
                borderBottomWidth: 3,
                borderBottomColor: relatedTab === 'members' ? TEAL : 'transparent',
                marginBottom: -1,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: relatedTab === 'members' ? '700' : '400',
                  color: relatedTab === 'members' ? '#111827' : '#6b7280',
                }}
              >
                Member's items
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { tap('selection'); setRelatedTab('similar'); }}
              style={{
                flex: 1,
                paddingVertical: 16,
                alignItems: 'center',
                borderBottomWidth: 3,
                borderBottomColor: relatedTab === 'similar' ? TEAL : 'transparent',
                marginBottom: -1,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: relatedTab === 'similar' ? '700' : '400',
                  color: relatedTab === 'similar' ? '#111827' : '#6b7280',
                }}
              >
                Similar items
              </Text>
            </Pressable>
          </View>

          {relatedTab === 'members' ? (
            <View style={{ paddingTop: 18 }}>
              {/* Bundle discounts title */}
              <Text style={{ fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: -0.24, color: '#111827', paddingHorizontal: 16, marginBottom: 14 }}>
                Bundle discounts from {listing.seller.username}
              </Text>

              {/* Bundle discount banner */}
              <View style={{ marginHorizontal: 16, marginBottom: 20, backgroundColor: '#f1edff', borderRadius: 16, padding: 18 }}>
                <Text style={{ fontSize: 16, color: '#111827', lineHeight: 24, marginBottom: 22 }}>
                  Add items from this seller to your cart to unlock discounts—plus potential savings on shipping!
                </Text>

                {/* Progress track */}
                <View style={{ height: 16, marginBottom: 14, position: 'relative' }}>
                  {/* Gray track */}
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#dcd3ff', borderRadius: 99 }} />
                  {/* Blue fill */}
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '25%' }}>
                    <View style={{ flex: 1, backgroundColor: BUNDLE_BLUE, borderTopLeftRadius: 99, borderBottomLeftRadius: 99 }} />
                    {/* Arrow tip */}
                    <View style={{
                      position: 'absolute', right: -11, top: 0,
                      width: 0, height: 0,
                      borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 12,
                      borderTopColor: 'transparent', borderBottomColor: 'transparent',
                      borderLeftColor: BUNDLE_BLUE,
                    }} />
                  </View>
                </View>

                {/* Milestones */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {BUNDLE_MILESTONES.map((m, i) => (
                    <View key={i} style={{ alignItems: 'center' }}>
                      <View style={{ width: 1.5, height: 10, backgroundColor: '#9ca3af', marginBottom: 6 }} />
                      <Text style={{ fontSize: 13, color: '#111827', textAlign: 'center' }}>{m.items}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: m.active ? BUNDLE_BLUE : '#6b7280', textAlign: 'center' }}>{m.discount}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: CARD_OUTER_PAD,
                  columnGap: CARD_GAP,
                }}
              >
                {MEMBER_ITEMS.map((item) => (
                  <RelatedItemCard key={item.id} item={item} onPress={() => router.push(`/product/${item.id}`)} />
                ))}
              </View>
            </View>
          ) : (
            <View style={{ paddingTop: 18 }}>
              <View
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: CARD_OUTER_PAD,
                  columnGap: CARD_GAP,
                }}
              >
                {SIMILAR_ITEMS.map((item) => (
                  <RelatedItemCard key={item.id} item={item} onPress={() => router.push(`/product/${item.id}`)} />
                ))}
              </View>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── Fixed bottom bar ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'white',
        borderTopWidth: HAIRLINE, borderTopColor: '#e5e7eb',
        paddingHorizontal: 16, paddingTop: 12,
        paddingBottom: insets.bottom || 16,
        flexDirection: 'row', gap: 10,
        ...(IS_IOS && {
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -2 },
        }),
      }}>
        <Pressable
          onPress={() => { tap('medium'); Alert.alert('Offer', `Send offer of $${offerPrice}?`); }}
          style={({ pressed }) => ({
            flex: 1, borderWidth: 1.5, borderColor: BRAND_DARK,
            borderRadius: 12, paddingVertical: IS_IOS ? 16 : 15, alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_DARK, letterSpacing: 0.3 }}>OFFER ${offerPrice}</Text>
        </Pressable>
        <Pressable
          onPress={() => { tap('medium'); Alert.alert('Buy Now', 'Payment flow coming soon'); }}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: BRAND_DARK, borderRadius: 12, paddingVertical: IS_IOS ? 16 : 15, alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: 'white', letterSpacing: 0.3 }}>BUY NOW</Text>
        </Pressable>
      </View>

      {/* Long-press-on-Heart save-to-list menu */}
      <SaveListSheet
        visible={saveListVisible}
        onClose={() => setSaveListVisible(false)}
        onSelect={(listId) => { setSavedToList(listId); setLiked(true); }}
        selectedId={savedToList}
      />
    </View>
  );
}
