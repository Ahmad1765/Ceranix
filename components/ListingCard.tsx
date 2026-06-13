import { memo, useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { PressableScale } from '@/components/PressableScale';
import { getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { isLiked as fetchIsLiked, toggleLike } from '@/lib/listings';
import { isSaved as fetchIsSaved, toggleSave } from '@/lib/saves';
import { SaveListSheet } from '@/components/SaveListSheet';
import type { Listing } from '@/types';

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface Props {
  listing: Listing;
}

export const ListingCard = memo(function ListingCard({ listing }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [activeIndex, setActiveIndex] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  // Sibling carousel images only mount after the user actually engages with
  // the card. This shaves ~2/3 of image requests on multi-image listings in
  // the home grid since most users never swipe individual cards.
  const [carouselArmed, setCarouselArmed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(listing.likes ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const images = listing.images.length > 0 ? listing.images : [''];
  const hasMultiple = images.length > 1;

  const likedInteractedRef = useRef(false);
  const savedInteractedRef = useRef(false);

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

  // Hydrate the saved/bookmarked state in parallel with liked.
  useEffect(() => {
    if (!user?.id) {
      setSaved(false);
      return;
    }
    let cancelled = false;
    savedInteractedRef.current = false;
    fetchIsSaved(listing.id, user.id).then((v) => {
      if (!cancelled && !savedInteractedRef.current) setSaved(v);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.id, user?.id]);

  // Keep the visible count in sync when the parent re-fetches and `likes`
  // changes from the server (e.g. someone else liked the listing).
  useEffect(() => {
    setLikeCount(listing.likes ?? 0);
  }, [listing.likes]);

  const handleToggleLike = useCallback(async () => {
    if (!user?.id) {
      toast.show('Sign in to like', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (likeBusy) return;
    likedInteractedRef.current = true;
    const prev = liked;
    const next = !prev;
    // Optimistic flip — rollback below if the server disagrees.
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setLikeBusy(true);
    try {
      const result = await toggleLike(listing.id, user.id, prev);
      if (result !== next) {
        setLiked(prev);
        setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      }
    } catch (error) {
      // Roll back the optimistic flip and surface a toast. We intentionally
      // do NOT re-throw — the onPress caller doesn't await this, so a throw
      // would become an unhandled promise rejection.
      setLiked(prev);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      console.warn('[ListingCard] toggleLike failed:', error);
      toast.show("Couldn't update like", { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setLikeBusy(false);
    }
  }, [liked, likeBusy, listing.id, toast, user?.id]);

  const longPressHandled = useRef(false);

  const handleToggleSave = useCallback(async () => {
    if (longPressHandled.current) return;
    if (!user?.id) {
      toast.show('Sign in to save', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (saveBusy) return;
    savedInteractedRef.current = true;
    const prev = saved;
    const next = !prev;
    setSaved(next);
    setSaveBusy(true);
    try {
      const result = await toggleSave(listing.id, user.id, prev);
      if (result !== next) {
        setSaved(prev);
      } else if (next) {
        toast.show('Saved', { variant: 'success', icon: 'bookmark' });
      }
    } catch (error) {
      // Roll back and toast; do NOT re-throw — see handleToggleLike.
      setSaved(prev);
      console.warn('[ListingCard] toggleSave failed:', error);
      toast.show("Couldn't update save", { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setSaveBusy(false);
    }
  }, [saveBusy, saved, listing.id, toast, user?.id]);

  // Long-press opens the SaveListSheet so the user can pick a specific
  // collection (or create a new one) instead of dumping into the default.
  const handleOpenSheet = useCallback(() => {
    longPressHandled.current = true;
    if (!user?.id) {
      toast.show('Sign in to save', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      setTimeout(() => { longPressHandled.current = false; }, 300);
      return;
    }
    setSheetOpen(true);
    setTimeout(() => { longPressHandled.current = false; }, 300);
  }, [toast, user?.id]);

  // Subtle staggered entrance: fade + slight rise on mount.
  const enterY = useSharedValue(8);
  const enterO = useSharedValue(0);
  useEffect(() => {
    enterO.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    enterY.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.7 });
  }, [enterO, enterY]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterO.value,
    transform: [{ translateY: enterY.value }],
  }));

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cardWidth <= 0) return;
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth));
  }, [cardWidth]);

  const armCarousel = useCallback(() => {
    if (!carouselArmed) setCarouselArmed(true);
  }, [carouselArmed]);

  const srcWidth = thumbWidthFor(cardWidth || 200);
  const firstSrc = getOptimizedImageUrl(images[0], { width: srcWidth });

  return (
    <Animated.View style={[{ flex: 1, marginBottom: 16 }, enterStyle]}>
    <PressableScale
      onPress={() => router.push(`/product/${listing.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${listing.brand || listing.title}${listing.size ? `, size ${listing.size}` : ''}, $${listing.price}`}
      accessibilityHint="Opens listing details"
      style={{ flex: 1 }}
    >
      <View
        className="relative w-full"
        style={{ aspectRatio: 1 / 1.33, overflow: 'hidden', borderRadius: 6, backgroundColor: 'rgba(15,15,15,0.04)' }}
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
      >
        {hasMultiple && cardWidth > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            onScroll={handleScroll}
            onTouchStart={armCarousel}
            onScrollBeginDrag={armCarousel}
            scrollEventThrottle={16}
            disableIntervalMomentum
          >
            {images.map((uri, i) => {
              if (i === 0) {
                return (
                  <AnimatedExpoImage
                    key={i}
                    source={{ uri: firstSrc }}
                    style={{ width: cardWidth, height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={uri}
                    transition={200}
                    priority="high"
                    sharedTransitionTag={`product-image-${listing.id}`}
                  />
                );
              }
              if (!carouselArmed) {
                return <View key={i} style={{ width: cardWidth, height: '100%' }} />;
              }
              return (
                <Image
                  key={i}
                  source={{ uri: getOptimizedImageUrl(uri, { width: srcWidth }) }}
                  style={{ width: cardWidth, height: '100%' }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  transition={200}
                  priority="low"
                />
              );
            })}
          </ScrollView>
        ) : (
          <AnimatedExpoImage
            source={{ uri: firstSrc }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={images[0]}
            transition={200}
            priority="high"
            sharedTransitionTag={`product-image-${listing.id}`}
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

        {/* Like badge — heart + count, top-right. Tap toggles like with
            optimistic UI. Nested Pressable wins the touch responder so the
            card's onPress doesn't fire when the badge is tapped. */}
        <Pressable
          onPress={handleToggleLike}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike listing' : 'Like listing'}
          accessibilityState={{ selected: liked }}
          style={({ pressed }) => ({
            position: 'absolute',
            top: 8,
            right: 8,
            backgroundColor: 'rgba(255,255,255,0.94)',
            borderRadius: 999,
            paddingVertical: 4,
            paddingHorizontal: 9,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Feather name="heart" size={11} color={liked ? '#6C47FF' : '#0F0F0F'} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0F0F0F' }}>
            {likeCount}
          </Text>
        </Pressable>

        {/* Save / bookmark badge — bottom-right. Same pill treatment as the
            like badge so they read as a pair. Tap toggles the bookmark with
            optimistic UI; nested Pressable wins the touch responder so the
            card's onPress doesn't fire. */}
        <Pressable
          onPress={handleToggleSave}
          onLongPress={handleOpenSheet}
          delayLongPress={300}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove from saved (long-press for lists)' : 'Save listing (long-press for lists)'}
          accessibilityState={{ selected: saved }}
          style={({ pressed }) => ({
            position: 'absolute',
            bottom: 8,
            right: 8,
            backgroundColor: 'rgba(255,255,255,0.94)',
            borderRadius: 999,
            paddingVertical: 5,
            paddingHorizontal: 7,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Feather name="bookmark" size={12} color={saved ? '#6C47FF' : '#0F0F0F'} />
        </Pressable>

        {listing.is_sold && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <Text className="text-white font-bold text-sm">SOLD</Text>
          </View>
        )}
      </View>

      <View className="mt-1.5 w-full">
        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-[13px] font-medium text-ink flex-1" numberOfLines={1}>
            {listing.brand || listing.title}
          </Text>
          {listing.size && (
            <Text className="text-[13px] font-bold text-ink ml-1">{listing.size}</Text>
          )}
        </View>
        <Text className="text-[14px] font-bold text-black mt-0.5">
          ${listing.price}
        </Text>
      </View>
    </PressableScale>
    {user?.id ? (
      <SaveListSheet
        visible={sheetOpen}
        userId={user.id}
        listingId={listing.id}
        onClose={() => setSheetOpen(false)}
        onChanged={(savedSomewhere) => setSaved(savedSomewhere)}
      />
    ) : null}
    </Animated.View>
  );
});
