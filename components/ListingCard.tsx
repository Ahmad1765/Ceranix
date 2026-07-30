import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { View, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { router } from 'expo-router';
import { PressableScale } from '@/components/PressableScale';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { priceBreakdown } from '@/lib/fees';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { isLiked as fetchIsLiked, toggleLike } from '@/lib/listings';
import { useGuestGate } from '@/components/GuestGate';
import { PopIcon, type PopIconHandle } from '@/components/product/PopIcon';
import { BRAND_PURPLE, BRAND_INK, conditionLabel } from '@/components/product/shared';
import { colors, radii, shadow } from '@/lib/theme';
import type { Listing } from '@/types';

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface Props {
  listing: Listing;
  // Rendered width of the card, when the caller already knows it. Every grid in
  // the app computes this via useGridDimensions and wraps the card in a
  // `style={{ width }}` view, so measuring it again with onLayout only bought a
  // second render per card (and a first frame at the wrong image source width).
  // Left optional so any call site that genuinely can't know its width keeps
  // the self-measuring behaviour.
  width?: number;
}

export const ListingCard = memo(function ListingCard({ listing, width }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const guestGate = useGuestGate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const cardWidth = width ?? measuredWidth;
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(listing.likes ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  // images is nullable in Postgres; `['']` keeps the carousel's single-slot
  // placeholder behaviour for rows with no photos.
  const images = listing.images?.length ? listing.images : [''];
  const hasMultiple = images.length > 1;

  const likedInteractedRef = useRef(false);
  // Imperative handle for the like pop — fired on tap so the Instagram-style
  // spring bounce never rides an async server-hydration update.
  const heartAnimRef = useRef<PopIconHandle>(null);

  // Hydrate the liked state for the current user. Cards are recycled in the
  // feed grid so we re-run this whenever the listing id or user changes.
  useEffect(() => {
    if (!user?.id) {
      setLiked(false);
      return;
    }
    let cancelled = false;
    likedInteractedRef.current = false;
    fetchIsLiked(listing.id, user.id).then((v) => {
      if (!cancelled && !likedInteractedRef.current) setLiked(v);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.id, user?.id]);

  // Keep the visible count in sync when the parent re-fetches and `likes`
  // changes from the server (e.g. someone else liked the listing). Skipped on
  // the first run: likeCount is already initialized to this exact value above,
  // so firing on mount was a guaranteed no-op render for every card in the grid.
  const likesHydrated = useRef(false);
  useEffect(() => {
    if (!likesHydrated.current) {
      likesHydrated.current = true;
      return;
    }
    setLikeCount(listing.likes ?? 0);
  }, [listing.likes]);

  // Multi-image listings are swipeable again (reverted from the auto-advancing
  // slideshow). A horizontal paging ScrollView lets the shopper flick through
  // every photo at their own pace; the dots below track the current page.
  const onCarouselScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const w = e.nativeEvent.layoutMeasurement.width;
      if (w <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / w);
      setActiveIndex((cur) => (cur === next ? cur : next));
    },
    [],
  );

  const handleToggleLike = useCallback(async () => {
    if (!user?.id) {
      guestGate.prompt({
        title: 'Save your favourites',
        message: 'Create a free account to like items and keep everything you love in one place.',
        icon: 'heart',
        resume: { kind: 'like', listingId: listing.id },
      });
      return;
    }
    if (likeBusy) return;
    likedInteractedRef.current = true;
    const prev = liked;
    const next = !prev;
    // Optimistic flip — rollback below if the server disagrees.
    heartAnimRef.current?.animateTo(next);
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setLikeBusy(true);
    try {
      const result = await toggleLike(listing.id, user.id, prev);
      if (result !== next) {
        heartAnimRef.current?.animateTo(prev);
        setLiked(prev);
        setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      }
    } catch (error) {
      // Roll back the optimistic flip and surface a toast. We intentionally
      // do NOT re-throw — the onPress caller doesn't await this, so a throw
      // would become an unhandled promise rejection.
      heartAnimRef.current?.animateTo(prev);
      setLiked(prev);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      console.warn('[ListingCard] toggleLike failed:', error);
      toast.show("Couldn't update like", { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setLikeBusy(false);
    }
  }, [liked, likeBusy, listing.id, toast, user?.id, guestGate]);

  const srcWidth = thumbWidthFor(cardWidth || 200);
  const currentUri = images[activeIndex] ?? images[0];
  const currentSrc = getOptimizedImageUrl(currentUri, { width: srcWidth });

  const meta = [listing.size, conditionLabel(listing.condition)].filter(Boolean).join(' · ');
  const { item: itemPrice, total: totalPrice } = priceBreakdown(listing.price);

  return (
    <View style={{ flex: 1, marginBottom: 16 }}>
    <PressableScale
      onPress={() => router.push(`/product/${listing.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${listing.brand || listing.title}${listing.size ? `, size ${listing.size}` : ''}, ${formatPrice(listing.price)}`}
      accessibilityHint="Opens listing details"
      style={{ flex: 1 }}
    >
      {/* Outer wrapper carries the shadow — the inner view below needs
          overflow: hidden to clip the image/carousel to its rounded corners,
          and on iOS/Android that same clip silently eats a shadow applied to
          the same layer. Splitting the two views is the standard fix. */}
      <View className="w-full" style={{ borderRadius: radii.lg, ...shadow.sm }}>
      <View
        className="relative w-full"
        style={{ aspectRatio: 1 / 1.33, overflow: 'hidden', borderRadius: radii.lg, backgroundColor: colors.panel }}
        onLayout={
          width == null
            ? (e) => setMeasuredWidth(e.nativeEvent.layout.width)
            : undefined
        }
      >
        {hasMultiple ? (
          // Horizontal paging carousel — one full-width slide per photo. Nested
          // inside the fixed-ratio, clipped container so pages snap edge to edge.
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onCarouselScroll}
            scrollEventThrottle={16}
            style={{ width: '100%', height: '100%' }}
          >
            {images.map((uri, i) => (
              <AnimatedExpoImage
                key={`${listing.id}-${i}`}
                source={{ uri: getOptimizedImageUrl(uri, { width: srcWidth }) }}
                style={{ width: cardWidth || 200, height: '100%' }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={`${listing.id}-${i}`}
                transition={200}
                priority={i === 0 ? 'high' : 'normal'}
              />
            ))}
          </ScrollView>
        ) : (
          <AnimatedExpoImage
            source={{ uri: currentSrc }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={listing.id}
            transition={280}
            priority="high"
          />
        )}

        {hasMultiple && (
          <View
            style={{
              position: 'absolute',
              bottom: 6,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            {images.map((_, i) => (
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

        {/* Like badge — animated heart + count, bottom-right. Tap toggles
            like with optimistic UI. Nested Pressable wins the touch
            responder so the card's onPress doesn't fire when the badge is
            tapped. */}
        <Pressable
          onPress={handleToggleLike}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike listing' : 'Like listing'}
          accessibilityState={{ selected: liked }}
          style={({ pressed }) => ({
            position: 'absolute',
            bottom: 8,
            right: 8,
            backgroundColor: 'rgba(255,255,255,0.94)',
            borderRadius: 999,
            paddingVertical: 6,
            paddingHorizontal: 11,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            opacity: pressed ? 0.85 : 1,
            ...shadow.sm,
          })}
        >
          <PopIcon
            ref={heartAnimRef}
            name="heart"
            active={liked}
            size={16}
            activeColor={BRAND_PURPLE}
            inactiveColor={BRAND_INK}
          />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F0F0F' }}>
            {likeCount}
          </Text>
        </Pressable>

        {listing.is_sold && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <Text className="text-white font-bold text-sm">SOLD</Text>
          </View>
        )}
      </View>
      </View>

      <View className="mt-1.5 w-full">
        <Text className="text-[13px] font-bold text-ink" numberOfLines={1}>
          {listing.brand || listing.title}
        </Text>
        {!!meta && (
          <Text className="text-[11px] text-ink-mute mt-0.5" numberOfLines={1}>
            {meta}
          </Text>
        )}
        <Text className="text-[11px] text-ink-soft mt-1">
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        <View className="flex-row items-center mt-0.5" style={{ gap: 3 }}>
          <Text className="text-[12px] font-bold text-ink">
            {formatPrice(totalPrice, { whole: true })} incl.
          </Text>
          <Feather name="check-circle" size={11} color={BRAND_PURPLE} />
        </View>
      </View>
    </PressableScale>
    </View>
  );
});
