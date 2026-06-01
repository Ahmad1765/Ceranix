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
import { safeBack } from '@/lib/nav';
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
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import type { Listing } from '@/types';
import { supabase } from '@/lib/supabase';
import { fetchListingById, fetchUserListings, isLiked, toggleLike } from '@/lib/listings';
import { getCachedListing } from '@/lib/listingCache';
import { fetchFollowState, toggleFollow } from '@/lib/follows';
import { withTimeout } from '@/lib/async';
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
  color = '#0F0F0F',
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

const ITEM_COLOR = { name: 'Carrinex purple', hex: '#6C47FF' };

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
const BRAND_PURPLE_SOFT = 'rgba(108,71,255,0.10)';
const BRAND_LIME = '#6C47FF';
const BRAND_INK = '#0F0F0F';
const TAG_BG = 'rgba(15,15,15,0.04)';
const TAG_BORDER = 'rgba(15,15,15,0.08)';
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
              color: 'rgba(15,15,15,0.62)',
              textAlign: 'center',
              paddingTop: 14,
              paddingBottom: 10,
              letterSpacing: 0.2,
            }}
          >
            Save to list
          </Text>
          <View style={{ height: HAIRLINE, backgroundColor: 'rgba(15,15,15,0.08)', marginHorizontal: 12 }} />
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
                  borderBottomColor: 'rgba(15,15,15,0.08)',
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                <Text style={{ fontSize: 22, marginRight: 12 }}>{list.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#0F0F0F' }}>{list.name}</Text>
                  <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)', marginTop: 2 }}>{list.count} items</Text>
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={22} color={BRAND_PURPLE} />}
              </Pressable>
            );
          })}
          <View style={{ height: HAIRLINE, backgroundColor: 'rgba(15,15,15,0.08)', marginHorizontal: 12 }} />
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
  const [followBusy, setFollowBusy] = useState(false);
  const [sellerItems, setSellerItems] = useState<Listing[]>([]);
  const [similarItems, setSimilarItems] = useState<Listing[]>([]);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [relatedTab, setRelatedTab] = useState<'members' | 'similar'>('members');
  const [heroPagerEnabled, setHeroPagerEnabled] = useState(true);
  const [saveListVisible, setSaveListVisible] = useState(false);
  const [savedToList, setSavedToList] = useState<string | null>(null);
  // Prime from cache so re-opens are instant — bypasses any wedged supabase
  // client on web while we refetch in the background.
  const cached = getCachedListing(productIdParam);
  const [listing, setListing] = useState<Listing | null>(
    cached ? { ...cached, seller: cached.seller ?? (FALLBACK_SELLER as Listing['seller']) } : null,
  );
  const [loadingListing, setLoadingListing] = useState(!cached);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

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
    (async () => {
      try {
        const row = await Promise.race([
          fetchListingById(productIdParam),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), 25_000),
          ),
        ]);
        if (!active) return;
        if (!row) {
          // Genuine 404 — only flag if we don't already have cached data.
          if (!haveCached) setNotFound(true);
        } else {
          setListing({
            ...row,
            seller: row.seller ?? (FALLBACK_SELLER as Listing['seller']),
          });
        }
      } catch (e: any) {
        // Transient: network error, supabase 5xx, timeout.
        console.warn('[product] load failed', e);
        // Only surface the error screen if we have no cached content
        // to show — otherwise the user keeps the cached view and the
        // background refresh silently failed.
        if (active && !haveCached) {
          setLoadError(e?.message ?? 'Could not load listing');
        }
      } finally {
        if (active) setLoadingListing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [productIdParam, retryToken]);

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

  // Real follow state — pulls from user_follows and the profile's denormalized counts.
  useEffect(() => {
    let active = true;
    const sellerId = listing?.seller?.id;
    if (!sellerId || sellerId === user?.id) {
      setFollowed(false);
      return;
    }
    fetchFollowState(user?.id ?? null, sellerId)
      .then((s) => {
        if (active) setFollowed(s.isFollowing);
      })
      .catch((e) => console.warn('[product] fetchFollowState', e?.message ?? e));
    return () => {
      active = false;
    };
  }, [listing?.seller?.id, user?.id]);

  // Other listings from this seller (excludes the current one).
  useEffect(() => {
    let active = true;
    const sellerId = listing?.seller_id;
    if (!sellerId) {
      setSellerItems([]);
      return;
    }
    fetchUserListings(sellerId)
      .then((rows) => {
        if (!active) return;
        setSellerItems(rows.filter((r) => r.id !== listing?.id && !r.is_sold).slice(0, 6));
      })
      .catch((e) => console.warn('[product] fetchUserListings', e?.message ?? e));
    return () => {
      active = false;
    };
  }, [listing?.seller_id, listing?.id]);

  // Similar listings — same category, different seller, not sold.
  useEffect(() => {
    let active = true;
    if (!listing?.category || !listing.id) {
      setSimilarItems([]);
      return;
    }
    let q = supabase
      .from('listings')
      .select('*, seller:profiles!listings_seller_id_fkey(*)')
      .eq('category', listing.category)
      .eq('is_sold', false)
      .neq('id', listing.id);
    if (listing.seller_id) q = q.neq('seller_id', listing.seller_id);
    q.order('created_at', { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('[product] similar', error.message);
          return;
        }
        setSimilarItems((data ?? []) as unknown as Listing[]);
      });
    return () => {
      active = false;
    };
  }, [listing?.category, listing?.seller_id, listing?.id]);

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
      setFollowed(next);
      toast.show(
        next ? `Following @${listing?.seller?.username ?? 'seller'}` : 'Unfollowed',
        { variant: next ? 'info' : 'default', icon: next ? 'user-check' : 'user-x' },
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
          borderBottomWidth: HAIRLINE, borderBottomColor: 'rgba(15,15,15,0.08)',
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
              <LikeBurst liked={liked} size={20} color={BRAND_PURPLE} inactiveColor={BRAND_INK} />
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
                <Feather name="heart" size={13} color="rgba(15,15,15,0.62)" />
                <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.62)' }}>
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
                    ({REVIEWS_COUNT})
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)', marginTop: 3 }}>
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
                    color: 'rgba(15,15,15,0.62)',
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
                <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)', lineHeight: 18 }}>
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
                <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)', lineHeight: 18 }}>
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
            <View style={{ paddingTop: 18 }}>
              {/* Bundle discounts header */}
              <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                <SectionEyebrow label={`Bundle from @${listing.seller.username}`} />
                <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.62)', lineHeight: 19 }}>
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
                      colors={[BRAND_PURPLE, BRAND_PURPLE]}
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
                          color: m.active ? BRAND_PURPLE : 'rgba(15,15,15,0.45)',
                          textAlign: 'center',
                        }}
                      >
                        {m.discount}
                      </Text>
                      <Text style={{ fontSize: 10, color: 'rgba(15,15,15,0.62)', textAlign: 'center', marginTop: 2 }}>
                        {m.items}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              {sellerItems.length === 0 ? (
                <View style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
                  <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.62)' }}>
                    @{listing.seller.username} has no other listings right now.
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

      {/* ── Fixed bottom bar ── */}
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
