import { useEffect, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { Listing } from '@/types';
import { fetchListingById, isLiked, toggleLike } from '@/lib/listings';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { LikeBurst } from '@/components/LikeBurst';
import { AnimatedNumber } from '@/components/AnimatedNumber';

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

// Unified brand palette (matches home tabs + PromoBanner + LiveActivityTicker)
const BRAND_PURPLE = '#6C47FF';
const BRAND_PURPLE_SOFT = '#f1edff';
const BRAND_LIME = '#d8f53a';
const BRAND_INK = '#0a0a0a';
const TAG_BG = '#f3f4f6';
const TAG_BORDER = '#e5e7eb';
const LINK_PURPLE = BRAND_PURPLE;

const REVIEWS_COUNT = 7;
const TRANSACTIONS_COUNT = 12;
const ITEMS_FOR_SALE = 9;
const LISTING_ID = '91740406';
const PIN_COUNT = 2;

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
  const MIN_SCALE = 1;
  const MAX_SCALE = 4;
  const DOUBLE_TAP_SCALE = 2.4;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Pinch focal-point (relative to the View center, in screen pixels).
  // We translate so the pinch origin maps to the same point post-scale.
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startScale = useSharedValue(1);

  // Notify parent whenever zoom-state crosses the 1.04 threshold.
  useAnimatedReaction(
    () => scale.value > 1.04,
    (zoomed, prev) => {
      if (zoomed !== prev && onZoomChange) runOnJS(onZoomChange)(zoomed);
    },
    [onZoomChange]
  );

  // Maximum offset we can pan to without revealing edges.
  // At scale s, content size is imgWidth*s; viewport is imgWidth.
  // Allowed translate range is ±(imgWidth*s - imgWidth)/2.
  function clampX(value: number, s: number) {
    'worklet';
    const limit = Math.max(0, (imgWidth * s - imgWidth) / 2);
    return Math.min(limit, Math.max(-limit, value));
  }
  function clampY(value: number, s: number) {
    'worklet';
    const limit = Math.max(0, (imgHeight * s - imgHeight) / 2);
    return Math.min(limit, Math.max(-limit, value));
  }

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    savedScale.value = 1;
    tx.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    ty.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      // Convert focal point from view-local coords to "offset from center"
      focalX.value = e.focalX - imgWidth / 2;
      focalY.value = e.focalY - imgHeight / 2;
      startTx.value = tx.value;
      startTy.value = ty.value;
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = Math.max(MIN_SCALE, Math.min(savedScale.value * e.scale, MAX_SCALE));
      // Keep focal point pinned: shift translation by (1 - next/start) * (focal - startT)
      const k = 1 - next / startScale.value;
      const proposedTx = startTx.value + (focalX.value - startTx.value) * k;
      const proposedTy = startTy.value + (focalY.value - startTy.value) * k;
      scale.value = next;
      tx.value = clampX(proposedTx, next);
      ty.value = clampY(proposedTy, next);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
        // Snap-back into bounds with a spring, then save the rested values.
        const targetTx = clampX(tx.value, scale.value);
        const targetTy = clampY(ty.value, scale.value);
        tx.value = withSpring(targetTx, { damping: 22, stiffness: 220 });
        ty.value = withSpring(targetTy, { damping: 22, stiffness: 220 });
        savedTx.value = targetTx;
        savedTy.value = targetTy;
      }
    });

  // Single-finger pan only activates while zoomed; otherwise fails so the
  // parent horizontal carousel keeps its swipe-to-page gesture.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .maxPointers(1)
    .averageTouches(true)
    .onTouchesMove((e, manager) => {
      // Require zoomed AND a small movement threshold so a tap that drifts
      // a couple of pixels never steals from the double-tap recognizer.
      if (scale.value <= 1.04) {
        manager.fail();
        return;
      }
      const t = e.allTouches[0];
      if (!t) return;
      const dx = Math.abs((t.absoluteX ?? 0) - (t.x ?? 0));
      const dy = Math.abs((t.absoluteY ?? 0) - (t.y ?? 0));
      if (dx > 4 || dy > 4) manager.activate();
    })
    .onUpdate((e) => {
      const proposedTx = savedTx.value + e.translationX;
      const proposedTy = savedTy.value + e.translationY;
      tx.value = clampX(proposedTx, scale.value);
      ty.value = clampY(proposedTy, scale.value);
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .maxDistance(20)
    .onEnd((e) => {
      if (scale.value > 1.05) {
        resetZoom();
      } else {
        // Zoom toward the tap location so the tapped pixel stays put.
        const fx = e.x - imgWidth / 2;
        const fy = e.y - imgHeight / 2;
        const next = DOUBLE_TAP_SCALE;
        const k = 1 - next / 1;
        const targetTx = clampX(fx * k, next);
        const targetTy = clampY(fy * k, next);
        scale.value = withTiming(next, { duration: 240, easing: Easing.out(Easing.cubic) });
        tx.value = withTiming(targetTx, { duration: 240, easing: Easing.out(Easing.cubic) });
        ty.value = withTiming(targetTy, { duration: 240, easing: Easing.out(Easing.cubic) });
        savedScale.value = next;
        savedTx.value = targetTx;
        savedTy.value = targetTy;
      }
    });

  // Pinch + (doubleTap → pan) so doubleTap always wins a stationary 2-finger event.
  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        collapsable={false}
        style={{ width: imgWidth, height: imgHeight, overflow: 'hidden' }}
      >
        <Animated.View style={[{ width: imgWidth, height: imgHeight }, animStyle]}>
          <AnimatedExpoImage
            source={{ uri: getOptimizedImageUrl(uri, { width: thumbWidthFor(imgWidth), quality: 80 }) }}
            style={{ width: imgWidth, height: imgHeight }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={uri}
            transition={150}
            priority="high"
            sharedTransitionTag={sharedTag}
          />
        </Animated.View>
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
            source={{ uri: getOptimizedImageUrl(item.images[0], { width: srcWidth }) }}
            style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.images[0]}
            transition={180}
          />
        )}

        {hasMultiple && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 8,
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
        <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }} numberOfLines={1}>
          {item.meta}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND_INK, marginTop: 4 }}>
          ${item.price.toFixed(0)}
        </Text>
      </View>
    </Pressable>
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
          color={i < full ? '#f59e0b' : '#d1d5db'}
        />
      ))}
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const productIdParam = Array.isArray(id) ? id[0] : id;

  const [activeImage, setActiveImage] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [relatedTab, setRelatedTab] = useState<'members' | 'similar'>('members');
  const [heroPagerEnabled, setHeroPagerEnabled] = useState(true);
  const [saveListVisible, setSaveListVisible] = useState(false);
  const [savedToList, setSavedToList] = useState<string | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadingListing, setLoadingListing] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    if (!productIdParam) {
      setLoadingListing(false);
      setNotFound(true);
      return;
    }
    setLoadingListing(true);
    setNotFound(false);
    fetchListingById(productIdParam).then((row) => {
      if (!active) return;
      if (!row) {
        setNotFound(true);
      } else {
        setListing({
          ...row,
          seller: row.seller ?? (FALLBACK_SELLER as Listing['seller']),
        });
      }
      setLoadingListing(false);
    });
    return () => {
      active = false;
    };
  }, [productIdParam]);

  useEffect(() => {
    let active = true;
    if (!productIdParam || !user?.id) {
      setLiked(false);
      return;
    }
    isLiked(productIdParam, user.id).then((v) => {
      if (active) setLiked(v);
    });
    return () => {
      active = false;
    };
  }, [productIdParam, user?.id]);

  const handleHeartPress = async () => {
    tap('light');
    if (!user) {
      toast.show('Sign in to like items', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (!productIdParam || likeBusy) return;
    setLikeBusy(true);
    // Optimistic flip — animation runs immediately, even before the round-trip.
    setLiked((prev) => !prev);
    const next = await toggleLike(productIdParam, user.id, liked);
    setLiked(next);
    if (next) toast.show('Added to your favorites', { variant: 'success', icon: 'heart' });
    setLikeBusy(false);
  };

  const handleFollowPress = () => {
    tap('selection');
    setFollowed((prev) => {
      const next = !prev;
      toast.show(
        next ? `Following @${listing?.seller?.username ?? 'seller'}` : 'Unfollowed',
        { variant: next ? 'info' : 'default', icon: next ? 'user-check' : 'user-x' },
      );
      return next;
    });
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

  if (loadingListing) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND_PURPLE} />
      </View>
    );
  }

  if (notFound || !listing) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', paddingTop: insets.top }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 16 }}>
          <Feather name="arrow-left" size={22} color="#111827" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="alert-circle" size={42} color="#9ca3af" />
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 14 }}>
            Listing not available
          </Text>
          <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 6, textAlign: 'center' }}>
            It may have been removed or never existed.
          </Text>
        </View>
      </View>
    );
  }

  const originalPrice = Math.round(listing.price * 1.24);
  const discountPct = Math.round((1 - listing.price / originalPrice) * 100);
  const baseLikes = listing.likes ?? 0;
  const heartCount = Math.max(0, baseLikes + (liked ? 1 : 0));

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
        scrollEnabled={heroPagerEnabled}
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
              onPress={() => { tap('light'); setPinned(!pinned); }}
              style={({ pressed }) => ({
                width: 50,
                paddingTop: 12,
                paddingBottom: 8,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}
            >
              <PinIcon size={20} color={BRAND_INK} filled={pinned} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND_INK, marginTop: 2 }}>
                {PIN_COUNT + (pinned ? 1 : 0)}
              </Text>
            </Pressable>
            <View style={{ height: HAIRLINE, marginHorizontal: 10, backgroundColor: 'rgba(10,10,10,0.12)' }} />
            <Pressable
              onPress={handleHeartPress}
              onLongPress={() => { tap('medium'); setSaveListVisible(true); }}
              delayLongPress={350}
              style={({ pressed }) => ({
                width: 50,
                paddingTop: 8,
                paddingBottom: 12,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}
            >
              <LikeBurst liked={liked} size={20} color="#ef4444" inactiveColor={BRAND_INK} />
              <AnimatedNumber
                value={heartCount}
                height={14}
                style={{ fontSize: 11, fontWeight: '700', color: BRAND_INK, marginTop: 2 }}
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
                <View
                  key={i}
                  style={{
                    width: i === activeImage ? 24 : 6,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: i === activeImage ? 'white' : 'rgba(255,255,255,0.5)',
                  }}
                />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
                <Feather name="heart" size={13} color="#6b7280" />
                <Text style={{ fontSize: 13, color: '#6b7280' }}>
                  Liked by <Text style={{ fontWeight: '700', color: BRAND_INK }}>@alice.333</Text>
                  {heartCount > 1 ? ` and ${heartCount - 1} others` : ''}
                </Text>
              </View>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
                <View
                  style={{
                    backgroundColor: '#f3f4f6',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_INK }}>
                    Size {listing.size}
                  </Text>
                </View>
                {listing.seller?.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="map-pin" size={11} color="#6b7280" />
                    <Text style={{ fontSize: 12, color: '#6b7280' }} numberOfLines={1}>
                      {listing.seller.location}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 13, color: '#9ca3af', textDecorationLine: 'line-through' }}>
                ${originalPrice}
              </Text>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: '900',
                  color: BRAND_INK,
                  lineHeight: 30,
                  letterSpacing: -0.4,
                }}
              >
                ${listing.price}
              </Text>
              <View
                style={{
                  marginTop: 4,
                  backgroundColor: BRAND_LIME,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '900', color: BRAND_INK, letterSpacing: 0.4 }}>
                  −{discountPct}%
                </Text>
              </View>
            </View>
          </View>

        </View>

        {/* ── Bundle teaser pill — commented out ── */}
        {/* <Pressable
          onPress={() => { tap('selection'); setRelatedTab('members'); }}
          style={({ pressed }) => ({
            marginHorizontal: 16,
            marginBottom: 4,
            backgroundColor: BRAND_INK,
            borderRadius: 18,
            paddingLeft: 16,
            paddingRight: 8,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND_LIME, marginRight: 10 }} />
          <Text style={{ fontSize: 10, fontWeight: '900', color: BRAND_LIME, letterSpacing: 1.4, marginRight: 12 }}>BUNDLE</Text>
          <Text style={{ flex: 1, color: 'white', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
            Add 1 more — <Text style={{ fontWeight: '800' }}>save 10%</Text><Text style={{ color: 'rgba(255,255,255,0.55)' }}> · view items</Text>
          </Text>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
            <Feather name="arrow-up-right" size={14} color="white" />
          </View>
        </Pressable> */}

        {/* ── Seller card ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 }}>
          <View
            style={{
              backgroundColor: '#fafafa',
              borderRadius: 18,
              borderWidth: HAIRLINE,
              borderColor: '#ececec',
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
                  borderColor: '#e5e7eb',
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    overflow: 'hidden',
                    backgroundColor: '#e5e7eb',
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
                    <Feather name="user" size={22} color="#9ca3af" />
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
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    ({REVIEWS_COUNT})
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                  {TRANSACTIONS_COUNT} sales · {ITEMS_FOR_SALE} listed
                </Text>
              </View>
            </View>

            {/* Follow + Message */}
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
                  borderColor: '#e5e7eb',
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
                  borderColor: '#e5e7eb',
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
              borderColor: '#ececec',
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
                      borderColor: '#e5e7eb',
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
                    borderTopColor: '#ececec',
                    backgroundColor: pressed && row.onPress ? '#fafafa' : 'white',
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

          {/* Tags — subtle outline chips */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 8, paddingHorizontal: 4 }}>
            {ITEM_TAGS.map((tag) => (
              <View
                key={tag}
                style={{
                  backgroundColor: TAG_BG,
                  borderWidth: HAIRLINE,
                  borderColor: TAG_BORDER,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: '#4b5563',
                    fontFamily: 'Inter_500Medium',
                    letterSpacing: 0.1,
                  }}
                >
                  #{tag}
                </Text>
              </View>
            ))}
          </View>

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
              <Feather name="flag" size={16} color="#6b7280" />
              <Text
                style={{
                  fontSize: 13,
                  color: '#6b7280',
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
                  color: '#9ca3af',
                  letterSpacing: 0.6,
                  fontFamily: 'Inter_500Medium',
                }}
              >
                ID · {LISTING_ID}
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
            <Pressable
              onPress={() => {}}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: 16,
                gap: 12,
                opacity: pressed ? 0.7 : 1,
              })}
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
                <Text style={{ fontSize: 12, color: '#4b5563', lineHeight: 18 }}>
                  Authenticated by our in-house team or a trusted partner.
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={BRAND_PURPLE} />
            </Pressable>

            <View style={{ height: HAIRLINE, marginHorizontal: 16, backgroundColor: 'rgba(108,71,255,0.18)' }} />

            <Pressable
              onPress={() => {}}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: 16,
                gap: 12,
                opacity: pressed ? 0.7 : 1,
              })}
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
                <Text style={{ fontSize: 12, color: '#4b5563', lineHeight: 18 }}>
                  Qualifying orders covered if something goes wrong.
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={BRAND_PURPLE} />
            </Pressable>
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
                    backgroundColor: active ? BRAND_PURPLE : '#F2F2F2',
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  })}
                >
                  <Ionicons
                    name={tab === 'members' ? 'person' : 'sparkles'}
                    size={13}
                    color={active ? 'white' : '#374151'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: active ? 'white' : '#374151',
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
            <View style={{ paddingTop: 18 }}>
              {/* Bundle discounts header */}
              <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                <SectionEyebrow label={`Bundle from @${listing.seller.username}`} />
                <Text style={{ fontSize: 13, color: '#6b7280', lineHeight: 19 }}>
                  Add items from this seller to unlock progressive discounts plus shipping savings.
                </Text>
              </View>

              {/* Bundle discount banner */}
              <View
                style={{
                  marginHorizontal: 16,
                  marginBottom: 22,
                  backgroundColor: BRAND_PURPLE_SOFT,
                  borderRadius: 18,
                  padding: 18,
                }}
              >
                {/* Progress track */}
                <View style={{ height: 8, marginBottom: 18, position: 'relative' }}>
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(108,71,255,0.2)',
                      borderRadius: 99,
                    }}
                  />
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '25%' }}>
                    <LinearGradient
                      colors={[BRAND_PURPLE, '#9b7dff']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1, borderRadius: 99 }}
                    />
                    {/* Thumb */}
                    <View
                      style={{
                        position: 'absolute',
                        right: -8,
                        top: -4,
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: 'white',
                        borderWidth: 3,
                        borderColor: BRAND_PURPLE,
                        ...(IS_IOS && {
                          shadowColor: '#000',
                          shadowOpacity: 0.15,
                          shadowRadius: 4,
                          shadowOffset: { width: 0, height: 2 },
                        }),
                      }}
                    />
                  </View>
                </View>

                {/* Milestones */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {BUNDLE_MILESTONES.map((m, i) => (
                    <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: m.active ? BRAND_PURPLE : '#9ca3af',
                          textAlign: 'center',
                        }}
                      >
                        {m.discount}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', marginTop: 2 }}>
                        {m.items}
                      </Text>
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
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderTopWidth: HAIRLINE,
          borderTopColor: '#ececec',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom || 16,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
          ...(IS_IOS && {
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -3 },
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
            borderColor: '#e5e7eb',
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
          onPress={() => { tap('medium'); Alert.alert('Buy', 'Payment flow coming soon'); }}
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
            <Text style={{ fontSize: 13, fontWeight: '900', color: BRAND_INK, letterSpacing: 0.2 }}>
              ${listing.price}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Long-press-on-Heart save-to-list menu */}
      <SaveListSheet
        visible={saveListVisible}
        onClose={() => setSaveListVisible(false)}
        onSelect={(listId) => {
          setSavedToList(listId);
          if (!liked) handleHeartPress();
        }}
        selectedId={savedToList}
      />
    </View>
  );
}
