import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '@/lib/rnText';
// expo-image straight, deliberately NOT Animated.createAnimatedComponent(Image):
// nothing on this card ever animates the photo, and the wrapper cost a
// Reanimated-managed component plus its props node per photo, per card, on every
// FlashList recycle. (The product screen's hero carousel is a different case.)
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { PressableScale } from '@/components/PressableScale';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import { peekLikedIds } from '@/lib/engagementCache';
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
  // Narrowed once, then used everywhere below instead of `user?.id`.
  //
  // This is not cosmetic. React Compiler refuses to compile a component whose
  // manual memoization it cannot preserve, and reading `user.id` inside a
  // useCallback that lists `user?.id` as a dependency made it infer the whole
  // `user` object as the real dependency ("Inferred less specific property than
  // source") — so it bailed out of ListingCard entirely. Depending on a plain
  // string makes the inferred and declared dependencies agree.
  const userId = user?.id ?? null;
  const toast = useToast();
  const guestGate = useGuestGate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const cardWidth = width ?? measuredWidth;
  // Seeded from the warm cache so the very first paint already shows the right
  // heart, rather than rendering unliked and correcting itself a tick later.
  // (Only runs on a true mount; FlashList recycles are handled by the effect.)
  const [liked, setLiked] = useState(() =>
    userId ? (peekLikedIds(userId)?.has(listing.id) ?? false) : false,
  );
  const [likeCount, setLikeCount] = useState(listing.likes ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  // Multi-photo cards mount only their first slide until the shopper actually
  // touches the carousel — see the ScrollView below.
  const [carouselHydrated, setCarouselHydrated] = useState(false);
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
  //
  // The warm-cache path is deliberately synchronous. fetchIsLiked is async even
  // when the answer is already in memory, so every card used to render once with
  // `liked=false`, resolve a microtask, then setState and render AGAIN — per
  // card, and again on every FlashList recycle mid-scroll. That doubled render
  // work sat on the UI thread and was the main contributor to the 33% janky
  // frames measured while scrolling the feed. peekLikedIds answers from the same
  // cache without a promise, so the common case now costs zero extra renders
  // (setState with an unchanged value bails out inside React).
  useEffect(() => {
    // A recycled instance is showing a different listing now, so the previous
    // shopper's "they swiped this one" flag no longer applies. Cards that were
    // never swiped are already false, and React bails out of an unchanged
    // setState, so this costs a render only on cards that were actually opened.
    setCarouselHydrated(false);

    if (!userId) {
      setLiked(false);
      return;
    }
    likedInteractedRef.current = false;

    const warm = peekLikedIds(userId);
    if (warm) {
      setLiked(warm.has(listing.id));
      return;
    }

    // Cold cache only: one batched round-trip, shared by every card mounting in
    // this frame (engagementCache dedupes in-flight requests).
    let cancelled = false;
    fetchIsLiked(listing.id, userId).then((v) => {
      if (!cancelled && !likedInteractedRef.current) setLiked(v);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.id, userId]);

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
  //
  // The scroll runs on the UI thread. This used to be a plain `onScroll` with
  // `scrollEventThrottle={16}`, which means a JS-thread callback every frame of
  // every carousel swipe — on a card inside a feed that is itself scrolling and
  // recycling. Now a worklet writes the offset to a shared value and the dots
  // read it inside useAnimatedStyle, so a swipe animates without re-rendering
  // any React component at all. (Same mechanism as AnimatedTabBar and the
  // product screen's HeroPageDot.)
  const offsetX = useSharedValue(0);
  const pageW = useSharedValue(0);
  const carouselScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      offsetX.value = e.contentOffset.x;
      // Read from the event rather than assuming cardWidth, exactly as the old
      // JS handler did — it is the measured viewport width of the slide.
      pageW.value = e.layoutMeasurement.width;
    },
  });

  // The JS thread is crossed once per PAGE CHANGE, not once per frame. React
  // still needs `activeIndex`, but only for the lazy-slide invariant below (a
  // recycled card parked mid-carousel must render its current slide for real).
  useAnimatedReaction(
    () => {
      if (pageW.value <= 0) return 0;
      return Math.round(offsetX.value / pageW.value);
    },
    (page, previous) => {
      if (page !== previous) runOnJS(setActiveIndex)(page);
    },
  );

  // First contact with the carousel promotes it from "thumbnail" to "gallery"
  // and mounts the remaining slides. Repeat touches are free — React bails out
  // of a setState that doesn't change the value.
  const hydrateCarousel = useCallback(() => {
    setCarouselHydrated(true);
  }, []);

  const handleToggleLike = useCallback(async () => {
    if (!userId) {
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

    // Undo the optimistic flip. Declared OUT here rather than inlined into the
    // try/catch below, and the trailing setLikeBusy(false) is deliberately not
    // in a `finally`. Both shapes are required by
    // babel-plugin-react-compiler@1.0.0, which bails out of the WHOLE enclosing
    // component — not just the offending function — on either of:
    //
    //   • "Handle TryStatement with a finalizer ('finally') clause"
    //   • "Support value blocks (conditional, logical, optional chaining, etc)
    //      within a try/catch statement"  ← `heartAnimRef.current?.animateTo`
    //
    // That cost React Compiler memoization for all of ListingCard, the most
    // rendered component in the app (~60 live instances on a feed screen). Keep
    // optional chaining, ternaries, `&&`/`||`/`??` out of the try/catch bodies.
    //
    // The `finally` removal is exactly equivalent, not merely close: neither the
    // try nor the catch contains a `return`, `break`, or `continue`, and the
    // catch deliberately does not re-throw (see below), so control always
    // reaches the next statement. Re-check that before adding an early return.
    const rollback = () => {
      heartAnimRef.current?.animateTo(prev);
      setLiked(prev);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    };

    try {
      const result = await toggleLike(listing.id, userId, prev);
      if (result !== next) rollback();
    } catch (error) {
      // We intentionally do NOT re-throw — the onPress caller doesn't await
      // this, so a throw would become an unhandled promise rejection.
      rollback();
      console.warn('[ListingCard] toggleLike failed:', error);
      toast.show("Couldn't update like", { variant: 'default', icon: 'alert-triangle' });
    }
    setLikeBusy(false);
  }, [liked, likeBusy, listing.id, toast, userId, guestGate]);

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
          //
          // Slides are mounted lazily. A grid card is a thumbnail first and a
          // gallery second: mounting every photo meant a 4-photo listing built
          // four native image views and fired four downloads for a card the
          // shopper may never swipe — times every card FlashList mounts and
          // re-mounts while scrolling, all competing with the *visible* photos
          // for both the JS thread and the connection pool. Un-mounted slides
          // still render as empty slots of the exact same width, so the paging
          // geometry, the dot count, and the scroll offsets are identical from
          // the first frame; only the pixels arrive later. `onTouchStart` fires
          // on finger-down, before the drag produces any movement, so the real
          // images are requested well before the swipe lands.
          <Animated.ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={carouselScrollHandler}
            onTouchStart={hydrateCarousel}
            scrollEventThrottle={16}
            style={{ width: '100%', height: '100%' }}
          >
            {images.map((uri, i) =>
              // Slide 0 and whatever slide is currently showing are always real
              // — the second clause matters for a recycled card parked
              // mid-carousel, which must never show an empty slot.
              i === 0 || i === activeIndex || carouselHydrated ? (
                <Image
                  key={`${listing.id}-${i}`}
                  source={{ uri: getOptimizedImageUrl(uri, { width: srcWidth }) }}
                  style={{ width: cardWidth || 200, height: '100%' }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={`${listing.id}-${i}`}
                  transition={200}
                  priority={i === 0 ? 'high' : 'normal'}
                />
              ) : (
                <View key={`${listing.id}-${i}`} style={{ width: cardWidth || 200, height: '100%' }} />
              ),
            )}
          </Animated.ScrollView>
        ) : (
          <Image
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
              <CardPageDot key={i} index={i} offsetX={offsetX} pageW={pageW} />
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

// One pagination dot, driven entirely from the carousel's shared scroll offset.
//
// The look is unchanged from the plain <View> this replaces — a 5px round dot,
// solid white on the current page and 55% white otherwise. Only the mechanism
// moved: the fill is computed in a worklet on the UI thread, so swiping a card's
// photos repaints the dots without a single React render.
const CardPageDot = memo(function CardPageDot({
  index,
  offsetX,
  pageW,
}: {
  index: number;
  offsetX: SharedValue<number>;
  pageW: SharedValue<number>;
}) {
  const animStyle = useAnimatedStyle(() => {
    // Before the first scroll event the width is still 0; page 0 is active.
    const page = pageW.value > 0 ? Math.round(offsetX.value / pageW.value) : 0;
    return {
      backgroundColor: page === index ? 'white' : 'rgba(255,255,255,0.55)',
    };
  });
  return <Animated.View style={[{ width: 5, height: 5, borderRadius: 3 }, animStyle]} />;
});
