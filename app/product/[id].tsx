import { capture, buildListingViewedProps } from '@/lib/analytics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert, Share } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/nav';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import type { Listing } from '@/types';
import {
  useDeleteListing,
  useFollowStateQuery,
  useLikedIdsQuery,
  useListingQuery,
  useSavedIdsQuery,
  useSellerOtherListingsQuery,
  useSetListingSold,
  useSimilarListingsQuery,
  useToggleFollow,
  useToggleLike,
} from '@/lib/queries';
import { confirm } from '@/lib/confirm';
import { logListingView } from '@/lib/recommendations';
import { updateSavedCache } from '@/lib/engagementCache';
import type { FollowState } from '@/lib/follows';
import { getOptimizedImageUrl } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { SaveListSheet } from '@/components/SaveListSheet';
import { FullscreenImageViewer } from '@/components/product/FullscreenImageViewer';
import { FloatingHeader } from '@/components/navigation/FloatingHeader';
import { ImageCarousel } from '@/components/product/ImageCarousel';
import { ProductActionBar } from '@/components/product/ProductActionBar';
import { CheckoutSheet } from '@/components/product/CheckoutSheet';
import { OfferSheet } from '@/components/product/OfferSheet';
import { PopIcon, type PopIconHandle } from '@/components/product/PopIcon';
import { RelatedItemCard } from '@/components/product/RelatedItemCard';
import { ProductSkeleton } from '@/components/product/ProductSkeleton';
import { BundleSection } from '@/components/product/BundleSection';
import { colors } from '@/lib/theme';

import { BundleProgressBar } from '@/components/product/BundleProgressBar';
import { StarRating } from '@/components/product/bits';
import { SafetyBanner } from '@/components/SafetyBanner';
import {
  HAIRLINE,
  tap,
  IMAGE_HEIGHT,
  CONDITION_LABELS,
  BRAND_PURPLE,
  BRAND_INK,
  INK_700,
  TAG_BG,
  TAG_BORDER,
  FALLBACK_SELLER,
  EMPTY_LISTINGS,
  conditionLabel,
  timeAgo,
  listingToRelated,
  CARD_GAP,
  CARD_OUTER_PAD,
} from '@/components/product/shared';
import { categoryLabel, subcategoryLabel } from '@/lib/categories';
import { itemColorLabel } from '@/lib/itemColors';
import { ColorSwatch } from '@/components/ColorSwatch';
import { BRAND, APP_URL } from '@/lib/brand';
import { reportListing, REPORT_REASONS } from '@/lib/reports';
import { useGuestGate } from '@/components/GuestGate';
import { buyerProtectionFee, orderTotal, formatPrice, DEFAULT_SHIPPING_FEE } from '@/lib/fees';
import { useSellSheet } from '@/components/sell/SellSheet';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import { errorMessage } from '@/lib/errors';

// Read-side normalization for useListingQuery. `listings.seller` is a nullable
// embed but the render dereferences `listing.seller.id` directly, so a
// seller-less row must never reach it.
//
// Declared at module scope, not inline: React Query re-runs `select` whenever
// its identity changes, so an inline arrow would recompute — and hand back a new
// object identity — on every render, churning the memo inputs of every child
// that takes `listing` as a prop.
const withFallbackSeller = (row: Listing | null): Listing | null =>
  row ? { ...row, seller: row.seller ?? (FALLBACK_SELLER as Listing['seller']) } : null;

// Item-description attribute list: subtle "gray-100" row dividers and a neutral
// "gray-400" drill-down chevron, shared across the category + detail rows.
const ROW_DIVIDER = 'rgba(15,15,15,0.06)';
const CHEVRON_GRAY = '#9CA3AF';

// Lines of description shown before the "Read more" toggle collapses the rest.
const DESC_CLAMP_LINES = 6;

// Width of the label column in the details box. Values then start on a shared
// left edge instead of hanging off each label's own width, which is what makes
// the rows read as a table rather than a list of sentences. Sized off the
// longest label ("Condition") at 15px semibold, plus breathing room.
const LABEL_W = 104;

type DetailRow = {
  label: string;
  value?: string | null;
  /** Renders the value in brand purple — reserved for rows that navigate. */
  link?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
};

// Error classification lives in lib/errors.ts, and the catch clauses below are
// bare `catch (e) { failure = e; }` on purpose — see that file for why value
// blocks (`?.`, `??`, `?:`, `&&`, `||`) must stay out of a try/catch here.

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const guestGate = useGuestGate();
  const { open: openSellSheet } = useSellSheet();
  const productIdParam = Array.isArray(id) ? id[0] : id;

  const [selectedBundleIds, setSelectedBundleIds] = useState<Set<string>>(new Set());
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [relatedTab, setRelatedTab] = useState<'members' | 'similar'>('members');
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);

  const [saveListVisible, setSaveListVisible] = useState(false);
  const [bpVisible, setBpVisible] = useState(false);
  const [offerVisible, setOfferVisible] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  // Imperative handles for the like/save pop — fired on tap so the bounce never
  // rides an async state hydration.
  const heartAnimRef = useRef<PopIconHandle>(null);
  const saveAnimRef = useRef<PopIconHandle>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  // The listing itself. React Query owns the fetch, the abort on unmount, the
  // retry/backoff and the "reuse if fresh" gate; a row seeded by whatever feed
  // the shopper tapped through (lib/listingCache) paints on the first frame and
  // refetches behind it, which is what the old module cache existed to do.
  const listingQ = useListingQuery(productIdParam, withFallbackSeller);
  const listing = listingQ.data ?? null;

  // The viewer's liked / saved sets, batched app-wide: one query per user per
  // 30s answers this page and every card in every grid.
  const likedIds = useLikedIdsQuery(user?.id ?? null).data;
  const savedIds = useSavedIdsQuery(user?.id ?? null).data;
  const liked = !!productIdParam && !!likedIds && likedIds.includes(productIdParam);
  const saved = !!productIdParam && !!savedIds && savedIds.includes(productIdParam);

  const toggleLikeM = useToggleLike(user?.id ?? null);
  const likeBusy = toggleLikeM.isPending;

  const sellerId = listing?.seller?.id ?? '';
  const isOwnListing = !!user?.id && listing?.seller_id === user.id;
  // Passing '' for your own listing keeps the query disabled — you can't follow
  // yourself, and the RPC is granted to `authenticated` only.
  const followStateQ = useFollowStateQuery(user?.id ?? null, isOwnListing ? '' : sellerId);
  const followState = followStateQ.data;
  const followed = followState ? followState.isFollowing : false;
  const toggleFollowM = useToggleFollow(user?.id ?? null, sellerId);
  const followBusy = toggleFollowM.isPending;

  // The bundle section lives at the bottom of the page (inside the
  // "Seller's items" tab); the teaser pill under the price jumps there.
  const mainScrollRef = useRef<any>(null);

  // Feed the recommender: record that this user opened this listing. The RPC
  // dedupes within 30 minutes and skips own listings, so no guards needed.
  useEffect(() => {
    if (productIdParam && user?.id) logListingView(productIdParam);
  }, [productIdParam, user?.id]);

  // Analytics, once per resolved listing. This used to ride inside the load
  // effect, which meant it only fired on a network response — a page served
  // from cache was never counted as viewed.
  const viewedId = listing?.id;
  const viewedSellerId = listing?.seller_id;
  const viewedPrice = listing?.price;
  const viewedCategory = listing?.category;
  useEffect(() => {
    if (!viewedId) return;
    capture('listing_viewed', buildListingViewedProps(
      {
        id: viewedId,
        seller_id: viewedSellerId ?? '',
        price: Number(viewedPrice ?? 0),
        category: viewedCategory ?? '',
      },
      'product_page',
    ));
  }, [viewedId, viewedSellerId, viewedPrice, viewedCategory]);

  // Re-check the follow state on focus: a follow performed elsewhere (e.g. on
  // the seller's own profile screen) has to be reflected when the shopper comes
  // back here. refetchOnWindowFocus is off app-wide (lib/queryClient.ts), so
  // this is the explicit equivalent. `refetch` is referentially stable.
  const refetchFollow = followStateQ.refetch;
  useFocusEffect(
    useCallback(() => {
      if (sellerId && !isOwnListing) refetchFollow();
    }, [sellerId, isOwnListing, refetchFollow]),
  );

  // Reset bundle selection whenever the viewed listing changes — selected
  // IDs from a previous seller's items must not bleed into a new product page.
  useEffect(() => {
    setSelectedBundleIds(new Set());
    setDescExpanded(false);
  }, [listing?.id]);

  // Other listings from this seller ("more from this seller") + "you might also
  // like" — both are pure server reads, so React Query owns fetching/caching.
  //
  // Similar items key off the ROUTE PARAM, not the loaded row: the RPC only
  // needs the id, so keying on `listing?.id` made it wait for the listing fetch
  // to land first — a serial waterfall for no reason. Seller items genuinely
  // depend on `seller_id` and stay dependent.
  const sellerItemsQ = useSellerOtherListingsQuery(
    listing?.seller_id ?? null,
    listing?.id ?? null,
  );
  const similarItemsQ = useSimilarListingsQuery(productIdParam ?? null);
  const sellerItems = sellerItemsQ.data ?? EMPTY_LISTINGS;
  const similarItems = similarItemsQ.data ?? EMPTY_LISTINGS;

  // Shared by the heart's long-press and the bookmark button — both open the
  // same SaveListSheet, so signed-out users must hit the identical guest-gate
  // prompt regardless of which control they used.
  const handleOpenSaveList = () => {
    if (!user?.id) {
      guestGate.prompt({
        title: 'Save to a collection',
        message: 'Create a free account to save items into collections you can come back to.',
        icon: 'bookmark',
        resume: productIdParam ? { kind: 'save', listingId: productIdParam } : undefined,
      });
      return;
    }
    tap('medium');
    setSaveListVisible(true);
  };

  const handleHeartPress = async () => {
    tap('light');
    if (!user) {
      guestGate.prompt({
        title: 'Save your favourites',
        message: 'Create a free account to like items and keep everything you love in one place.',
        icon: 'heart',
        resume: productIdParam ? { kind: 'like', listingId: productIdParam } : undefined,
      });
      return;
    }
    if (!productIdParam || likeBusy) return;
    const wasLiked = liked;
    // Instagram-style spring: the filled heart springs in (overshoot = pop) on
    // like, and springs back out on un-like. Fired here, on the tap, so server
    // hydration never triggers it. The optimistic flip of the icon itself — and
    // of the count — is the mutation's onMutate.
    heartAnimRef.current?.animateTo(!wasLiked);

    // Try body is just the await, no `finally`, no value blocks — see the
    // react-compiler note at module scope.
    let committed: boolean | null = null;
    let failure: unknown = null;
    try {
      committed = await toggleLikeM.mutateAsync({
        listingId: productIdParam,
        currentlyLiked: wasLiked,
      });
    } catch (e) {
      failure = e;
    }

    // toggleLike swallows its own errors and hands back the PREVIOUS value when
    // the write failed, so "unchanged" is a failure rather than a no-op. The
    // cache rollback already happened inside the mutation; only the spring and
    // the toast are left.
    if (failure !== null || committed === wasLiked) {
      heartAnimRef.current?.animateTo(wasLiked);
      toast.show('Could not update like', { variant: 'default', icon: 'alert-triangle' });
    } else if (committed) {
      // No confirmation toast on like — the heart's own state change is feedback
      // enough, and the pop-up read as noise when favouriting.
      capture('listing_liked', { listing_id: productIdParam });
    }
  };

  // Owner-only actions. Both write the listing cache optimistically so the UI
  // doesn't lag behind the supabase round-trip, and roll back on failure — the
  // rollback now lives inside the mutation, so what's left here is the toast.
  const setSoldM = useSetListingSold(listing?.id ?? null);
  const deleteM = useDeleteListing(listing?.seller_id ?? null);
  const soldBusy = setSoldM.isPending;
  const deleteBusy = deleteM.isPending;
  const ownerBusy = soldBusy || deleteBusy;

  const handleToggleSold = async () => {
    if (!listing || ownerBusy) return;
    const next = !listing.is_sold;

    // Ternary hoisted out and the try body reduced to the await — a conditional
    // inside try/catch bails React Compiler out of this whole screen. See the
    // module-scope note on errorMessage/isCancellation.
    const successMessage = next ? 'Marked as sold' : 'Marked as available';

    // null covers both "threw" and "server disagreed" — the response to each is
    // the same, exactly as the old catch/else pair did.
    let committed: boolean | null = null;
    try {
      committed = await setSoldM.mutateAsync(next);
    } catch {
      committed = null;
    }

    if (committed === next) {
      toast.show(successMessage, { variant: 'success', icon: 'check' });
    } else {
      toast.show("Couldn't update the listing", {
        variant: 'default',
        icon: 'alert-triangle',
      });
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

    let success = false;
    try {
      success = await deleteM.mutateAsync(listing.id);
    } catch {
      success = false;
    }

    if (!success) {
      toast.show("Couldn't delete the listing", {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }
    toast.show('Listing deleted', { variant: 'success', icon: 'check' });
    safeBack();
  };

  const handleFollowPress = async () => {
    tap('selection');
    if (!user) {
      guestGate.prompt({
        title: 'Follow sellers you love',
        message: 'Create a free account to follow sellers and get their new drops in your feed.',
        icon: 'user-plus',
        resume: sellerId ? { kind: 'follow', sellerId } : undefined,
      });
      return;
    }
    if (!sellerId || sellerId === user.id || followBusy) return;

    // Everything with a `?.`, `??` or `?:` in it is resolved BEFORE the try, and
    // the try body is just the await — see the module-scope note on
    // errorMessage/isCancellation. Value blocks inside a try/catch make React
    // Compiler bail out of this entire screen.
    const sellerHandle = listing?.seller?.username ?? 'seller';
    const wasFollowing = followed;
    const undoFollow = async () => {
      try {
        await toggleFollowM.mutateAsync({ currentlyFollowing: true });
      } catch {
        toast.show('Could not undo', { variant: 'default', icon: 'alert-triangle' });
      }
    };

    // The optimistic flip and its rollback are the mutation's onMutate/onError;
    // it also reconciles against the counts the RPC returns.
    let next: FollowState | null = null;
    let failure: unknown = null;
    try {
      next = await toggleFollowM.mutateAsync({ currentlyFollowing: wasFollowing });
    } catch (e) {
      failure = e;
    }

    if (next === null) {
      toast.show(errorMessage(failure) || 'Could not update follow', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } else {
      const nowFollowing = next.isFollowing;
      if (nowFollowing) capture('seller_followed', { seller_id: sellerId });
      toast.show(nowFollowing ? `Following @${sellerHandle}` : 'Unfollowed', {
        variant: nowFollowing ? 'info' : 'default',
        icon: nowFollowing ? 'user-check' : 'user-x',
        action: nowFollowing ? { label: 'Undo', onPress: undoFollow } : undefined,
      });
    }
  };

  const openChat = (mode: 'message' | 'offer') => {
    tap('medium');
    if (!user) {
      guestGate.prompt({
        title: 'Message the seller',
        message: 'Create a free account to message sellers, make offers, and track your chats.',
        icon: 'message-circle',
      });
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

  // Gates the action bar's inline offer field with the same rules openChat
  // applies. Returns false — having already handled the refusal — when this
  // buyer can't make an offer, which keeps the field from expanding.
  const canOffer = () => {
    if (!user) {
      guestGate.prompt({
        title: 'Make an offer',
        message: 'Create a free account to send the seller a price suggestion.',
        icon: 'tag',
      });
      return false;
    }
    if (!listing) return false;
    if (listing.seller_id === user.id) {
      toast.show("That's your own listing", { variant: 'default', icon: 'info' });
      return false;
    }
    return true;
  };

  const submitOffer = (amount: number) => {
    if (!listing) return;
    router.push({
      pathname: '/conversation/new',
      params: { listing: listing.id, mode: 'offer', amount: amount.toFixed(2) },
    } as any);
  };

  const shareListing = async () => {
    if (!listing) return;
    tap('light');
    try {
      const url = `${APP_URL}/product/${listing.id}`;
      await Share.share({
        message: `${listing.title} · ${formatPrice(listing.price)} on ${BRAND}\n${url}`,
        url,
      });
    } catch {
      // user dismissed the share sheet — nothing to report
    }
  };

  const handleReport = () => {
    tap('selection');
    if (!user) {
      toast.show('Sign in to report a listing', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (!listing) return;
    if (listing.seller_id === user.id) {
      toast.show("You can't report your own listing", { variant: 'default', icon: 'info' });
      return;
    }
    Alert.alert('Report listing', 'Why are you reporting this item?', [
      ...REPORT_REASONS.map((r) => ({
        text: r.label,
        onPress: async () => {
          const ok = await reportListing({
            listingId: listing.id,
            reporterId: user.id,
            reportedUserId: listing.seller_id,
            reason: r.id,
          });
          toast.show(ok ? 'Thanks — our team will review this.' : "Couldn't submit report", {
            variant: ok ? 'success' : 'default',
            icon: ok ? 'check' : 'alert-triangle',
          });
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

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

  // Order matters. "Not available" covers both a missing route param and a
  // resolved-but-null row (useListingQuery's queryFn returns null only for a row
  // that genuinely isn't there, and never retries it). Then a hard failure with
  // nothing cached to fall back on. Anything left without data is still in
  // flight — including a cached-but-stale row, which renders below rather than
  // flashing a skeleton over itself.
  const notFound = !productIdParam || (listingQ.isSuccess && !listing);
  const loadErrorText = listingQ.error ? errorMessage(listingQ.error) : '';

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', paddingTop: insets.top }}>
        <Pressable onPress={() => safeBack()} hitSlop={10} style={{ padding: 16 }}>
          <Feather name="arrow-left" size={22} color="#0F0F0F" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="alert-circle" size={42} color="rgba(15,15,15,0.55)" />
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

  if (listingQ.isError && !listing) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', paddingTop: insets.top }}>
        <Pressable onPress={() => safeBack()} hitSlop={10} style={{ padding: 16 }}>
          <Feather name="arrow-left" size={22} color="#0F0F0F" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="wifi-off" size={36} color="rgba(15,15,15,0.55)" />
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#0F0F0F', marginTop: 14, letterSpacing: -0.3 }}>
            Couldn&apos;t load this listing
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(15,15,15,0.62)', marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
            {loadErrorText === 'Request timed out'
              ? 'The connection is slow right now. Try again in a moment.'
              : 'Something went wrong. Check your connection and try again.'}
          </Text>
          <Pressable
            onPress={() => { tap('light'); listingQ.refetch(); }}
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

  if (!listing) {
    return <ProductSkeleton insetsTop={insets.top} />;
  }

  // Straight off the row. The old `heartDelta` expression existed because the
  // heart and the count were two unsynchronised sources reconciled against
  // `listing.user_has_liked` — a field no query in this app populates, which is
  // why un-liking left the count one too high. useToggleLike now writes both.
  const heartCount = Math.max(0, Number(listing.likes ?? 0));
  // Buyer Protection math — item price plus a small protection fee. Computed
  // from lib/fees so the number here matches the payment sheet, the invoice,
  // and what the server actually charges.
  const itemPrice = Number(listing.price ?? 0);
  const bpFee = buyerProtectionFee(itemPrice);
  const buyTotal = orderTotal(itemPrice);
  const catSubLabel = listing.subcategory
    ? subcategoryLabel(listing.category, listing.subcategory)
    : '';
  // `listings.images` is nullable in Postgres, so a row can arrive with no
  // array at all. Normalize once here rather than guarding at each of the four
  // read sites below.
  const images = listing.images ?? [];
  // Description paragraphs (sellers separate them with pipes). Hoisted so the
  // details box can lead with the description and only draw the Category
  // divider beneath it when there's actually a description above.
  const descParas = String(listing.description ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  const descFull = descParas.join('\n\n');
  const descIsLong = descFull.length > 240 || descParas.length > 3;
  const hasDescription = descParas.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Product photos skew light (matte on white), so dark status-bar icons
          stay legible over both the hero and the sticky header. */}
      <StatusBar style="dark" animated />

      {/* 1. Floating Top Navigation Bar (Z: 30) */}
      <FloatingHeader
        onBack={() => safeBack()}
        title={showStickyHeader ? listing.title : undefined}
        subtitle={showStickyHeader ? formatPrice(listing.price, { whole: true }) : undefined}
        transparent={!showStickyHeader}
      />

      <Animated.ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 120 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        // Let the hero photo bleed all the way to the top edge, under the
        // status bar / notch. Without this, iOS auto-insets the first scroll
        // view by the safe-area top and drops a white gap above the image.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        {/* ── Image carousel (4:5 Aspect Ratio with gesture swipe & zoom) ── */}
        <View style={{ position: 'relative' }}>
          {/* Parallax/stretch layer wraps ONLY the carousel; floating UI is unaffected */}
          <Animated.View style={heroParallaxStyle}>
            <ImageCarousel
              images={images}
              aspectRatio="4:5"
              onImagePress={(i) => {
                tap('selection');
                setFullscreenIndex(i);
              }}
            />
          </Animated.View>

          {/* Floating actions — a stacked column of separate circular discs (Mercari style) */}
          <View
            style={{
              position: 'absolute',
              right: 14,
              bottom: 16,
              alignItems: 'center',
              gap: 12,
              zIndex: 10,
            }}
          >
            {/* Like — heart over its count */}
            <Pressable
              onPress={handleHeartPress}
              onLongPress={handleOpenSaveList}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityLabel={liked ? 'Unlike this item' : 'Like this item'}
              accessibilityHint="Long press to save this item to a collection"
              accessibilityState={{ selected: liked }}
              style={({ pressed }) => ({
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: HAIRLINE,
                borderColor: 'rgba(15,15,15,0.06)',
                boxShadow: '0px 4px 14px rgba(0,0,0,0.12)',
                transform: [{ scale: pressed ? 0.93 : 1 }],
              })}
            >
              <PopIcon
                ref={heartAnimRef}
                name="heart"
                active={liked}
                size={20}
                activeColor={BRAND_PURPLE}
                inactiveColor={BRAND_INK}
              />
              <AnimatedNumber
                value={heartCount}
                height={13}
                style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: 'rgba(15,15,15,0.55)', marginTop: 1 }}
              />
            </Pressable>

            {/* Save to collection */}
            <Pressable
              onPress={handleOpenSaveList}
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Edit save lists' : 'Save to list'}
              accessibilityState={{ selected: saved }}
              style={({ pressed }) => ({
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: HAIRLINE,
                borderColor: 'rgba(15,15,15,0.06)',
                boxShadow: '0px 4px 14px rgba(0,0,0,0.12)',
                transform: [{ scale: pressed ? 0.93 : 1 }],
              })}
            >
              <PopIcon
                ref={saveAnimRef}
                name="bookmark"
                active={saved}
                size={20}
                activeColor={BRAND_PURPLE}
                inactiveColor={BRAND_INK}
              />
            </Pressable>
          </View>
        </View>

        {/* ── Title block (editorial) ── */}

        <View style={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 14 }}>
          {heartCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
              <Feather name="heart" size={12} color="rgba(15,15,15,0.55)" />
              <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.55)', fontFamily: 'Inter_500Medium' }}>
                Liked by <Text style={{ fontFamily: 'Inter_700Bold', color: BRAND_INK }}>{heartCount} {heartCount === 1 ? 'person' : 'people'}</Text>
              </Text>
            </View>
          )}

          <Text
            style={{
              fontSize: 28,
              fontFamily: 'Inter_700Bold',
              color: BRAND_INK,
              lineHeight: 33,
              letterSpacing: -0.7,
            }}
            numberOfLines={2}
          >
            {listing.title}
          </Text>

          {/* Meta line — one subtle row (size · condition · brand · location)
              instead of chunky pills, so the title/price read as a clean
              editorial stack. Brand stays a tappable purple link into
              Discover; condition is still surfaced as a primary factor. */}
          {(() => {
            const cond = conditionLabel(listing.condition);
            const uploaded = listing.created_at ? timeAgo(listing.created_at) : '';
            const segs = [
              listing.size ? { text: `Size ${listing.size}` } : null,
              cond ? { text: cond } : null,
              listing.brand ? { text: listing.brand, link: true } : null,
              listing.seller?.location ? { text: listing.seller.location } : null,
              uploaded ? { text: `Uploaded ${uploaded}` } : null,
            ].filter(Boolean) as { text: string; link?: boolean }[];
            if (segs.length === 0) return null;
            return (
              <Text
                numberOfLines={2}
                style={{ marginTop: 10, fontSize: 14, lineHeight: 20, color: 'rgba(15,15,15,0.55)', fontFamily: 'Inter_500Medium' }}
              >
                {segs.map((s, i) => (
                  <Text key={i}>
                    {i > 0 ? <Text style={{ color: 'rgba(15,15,15,0.28)' }}>{' · '}</Text> : null}
                    {s.link ? (
                      <Text
                        style={{
                          color: BRAND_PURPLE,
                          fontFamily: 'Inter_600SemiBold',
                          textDecorationLine: 'underline',
                        }}
                        accessibilityRole="link"
                        accessibilityLabel={`Shop more from ${s.text}`}
                        onPress={() => {
                          tap('selection');
                          router.push(`/(tabs)/discover?q=${encodeURIComponent(listing.brand!)}` as any);
                        }}
                      >
                        {s.text}
                      </Text>
                    ) : (
                      s.text
                    )}
                  </Text>
                ))}
              </Text>
            );
          })()}

          {/* Price — Mercari/Vinted pattern: the item price is the hero, and
              Buyer Protection is surfaced beneath it as a small "+fee" line
              rather than folded into a combined total. The buyer still pays
              item + fee (the action bar shows the total on the Buy button); this
              keeps the headline price honest to what's listed. The fee row taps
              into the full breakdown sheet. */}
          <View style={{ marginTop: 18 }}>
            <Text
              style={{
                fontSize: 22,
                fontFamily: 'Inter_700Bold',
                color: BRAND_INK,
                letterSpacing: -0.4,
              }}
            >
              {formatPrice(itemPrice, { whole: true })}
            </Text>
            {bpFee > 0 ? (
              <Pressable
                onPress={() => { tap('selection'); setBpVisible(true); }}
                accessibilityRole="button"
                accessibilityLabel={`Plus ${formatPrice(bpFee)} Buyer Protection fee. See the breakdown.`}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  marginTop: 6,
                  alignSelf: 'flex-start',
                  minHeight: 28,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: 'rgba(15,15,15,0.55)' }}>
                  +{formatPrice(bpFee)} Buyer Protection fee
                </Text>
                <Feather name="shield" size={15} color={BRAND_PURPLE} />
              </Pressable>
            ) : null}
          </View>

        </View>

        {/* ── Bundle progress indicator — the bundle builder lives at the
            bottom of the page, so without this it's invisible until a buyer
            happens to scroll past everything. Drives its "add N more to save
            X%" nudge off the same tier math as the builder, and jumps there
            on tap. Shown only when there's something to bundle. ── */}
        {!isOwnListing && sellerItems.length > 0 ? (
          <BundleProgressBar
            listing={listing}
            sellerItems={sellerItems}
            selectedIds={selectedBundleIds}
            onPress={() => {
              tap('selection');
              setRelatedTab('members');
              // Let the tab content mount, then jump to it.
              requestAnimationFrame(() => mainScrollRef.current?.scrollToEnd({ animated: true }));
            }}
          />
        ) : null}

        {/* ── Seller card ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 18,
              borderWidth: HAIRLINE,
              borderColor: 'rgba(15,15,15,0.12)',
              padding: 14,
            }}
          >
            <Pressable
              onPress={() => router.push(`/user/${listing.seller.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`View @${listing.seller.username}'s profile`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
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
                    <Feather name="user" size={22} color="rgba(15,15,15,0.55)" />
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
              <Feather name="chevron-right" size={18} color="rgba(15,15,15,0.30)" />
            </Pressable>

            {/* Follow + Message — hidden when viewing your own listing */}
            {isOwnListing ? (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={handleToggleSold}
                  disabled={ownerBusy}
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
                    opacity: soldBusy ? 0.5 : pressed ? 0.88 : 1,
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
                  disabled={ownerBusy}
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
                    opacity: deleteBusy ? 0.5 : pressed ? 0.7 : 1,
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

        {/* ── Description + details ──
            The description leads the box; the attribute rows follow beneath a
            divider. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 18,
              borderWidth: HAIRLINE,
              borderColor: 'rgba(15,15,15,0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Description — first in the box. numberOfLines maps to CSS
                line-clamp on web and native truncation on device; a length/
                paragraph heuristic decides whether the toggle is warranted, so
                there's no measure-then-clamp flicker. */}
            {hasDescription ? (
              <View
                style={{
                  paddingHorizontal: 18,
                  paddingTop: 18,
                  paddingBottom: descIsLong ? 8 : 18,
                }}
              >
                <Text
                  numberOfLines={descIsLong && !descExpanded ? DESC_CLAMP_LINES : undefined}
                  style={{
                    fontSize: 15,
                    color: INK_700,
                    lineHeight: 24,
                    fontFamily: 'Inter_400Regular',
                  }}
                >
                  {descFull}
                </Text>
                {descIsLong ? (
                  <Pressable
                    onPress={() => { tap('selection'); setDescExpanded((v) => !v); }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={descExpanded ? 'Collapse description' : 'Expand full description'}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      minHeight: 44,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: BRAND_PURPLE, letterSpacing: 0.2 }}>
                      {descExpanded ? 'Show less' : 'Read more'}
                    </Text>
                    <Feather
                      name={descExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={BRAND_PURPLE}
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Category breadcrumb — category ▸ subcategory, each segment
                searchable (taps into Discover filtered at that level). Draws a
                top divider only when the description sits above it. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 18,
                paddingVertical: 16,
                borderTopWidth: hasDescription ? HAIRLINE : 0,
                borderTopColor: ROW_DIVIDER,
              }}
            >
              <Text
                style={{
                  width: LABEL_W,
                  fontFamily: 'Inter_600SemiBold',
                  fontSize: 15,
                  color: BRAND_INK,
                  letterSpacing: 0.1,
                }}
              >
                Category
              </Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Pressable
                  onPress={() => {
                    tap('selection');
                    router.push(`/(tabs)/discover?category=${encodeURIComponent(listing.category)}` as any);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: INK_700 }}>
                    {categoryLabel(listing.category)}
                  </Text>
                </Pressable>
                {catSubLabel ? (
                  <>
                    <Feather
                      name="chevron-right"
                      size={14}
                      color="rgba(15,15,15,0.30)"
                      style={{ marginHorizontal: 3 }}
                    />
                    <Pressable
                      onPress={() => {
                        tap('selection');
                        router.push(
                          `/(tabs)/discover?category=${encodeURIComponent(listing.category)}&sub=${encodeURIComponent(listing.subcategory!)}` as any,
                        );
                      }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                    >
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: INK_700 }}>
                        {catSubLabel}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
              {/* marginLeft matches the detail rows' trailing wrapper, so every
                  chevron in the box lands on the same right edge. */}
              <Feather
                name="chevron-right"
                size={18}
                color={CHEVRON_GRAY}
                style={{ marginLeft: 10 }}
              />
            </View>

            {/* Details rows */}
            {(
              [
                {
                  label: 'Brand',
                  value: listing.brand,
                  link: !!listing.brand,
                  // Tap to search Discover for other items from this brand.
                  onPress: listing.brand
                    ? () => {
                        tap('selection');
                        router.push(`/(tabs)/discover?q=${encodeURIComponent(listing.brand!)}` as any);
                      }
                    : undefined,
                  trailing: listing.brand ? <Feather name="chevron-right" size={18} color={CHEVRON_GRAY} /> : undefined,
                },
                {
                  label: 'Size',
                  value: listing.size,
                },
                {
                  label: 'Condition',
                  value: CONDITION_LABELS[listing.condition] ?? listing.condition,
                  onPress: () =>
                    Alert.alert(
                      'Condition guide',
                      'New with tags — Unworn, original tags still attached\n\n' +
                        'Like new — Worn once or twice, no visible flaws\n\n' +
                        'Very good — Gently used, only minor signs of wear\n\n' +
                        'Fair — Noticeable wear, but still fully wearable',
                    ),
                  trailing: <Feather name="info" size={17} color="rgba(15,15,15,0.55)" />,
                },
                // Only shown when the seller set a real colour (legacy rows omit it).
                ...(listing.color
                  ? [
                      {
                        label: 'Color',
                        value: itemColorLabel(listing.color),
                        trailing: <ColorSwatch colorId={listing.color} size={18} />,
                      },
                    ]
                  : []),
                ...(listing.created_at
                  ? [{ label: 'Uploaded', value: timeAgo(listing.created_at) }]
                  : []),
              ] as DetailRow[]
            ).map((row) => {
              return (
                <Pressable
                  key={row.label}
                  onPress={row.onPress}
                  disabled={!row.onPress}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 18,
                    paddingVertical: 16,
                    borderTopWidth: HAIRLINE,
                    borderTopColor: ROW_DIVIDER,
                    // Actionable rows get a pressed wash (the native equivalent
                    // of hover:bg-gray-50); static rows like Size stay flat.
                    backgroundColor: pressed && row.onPress ? 'rgba(15,15,15,0.04)' : 'white',
                  })}
                >
                  <Text
                    style={{
                      width: LABEL_W,
                      fontSize: 15,
                      fontFamily: 'Inter_600SemiBold',
                      color: BRAND_INK,
                      letterSpacing: 0.1,
                    }}
                  >
                    {row.label}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontFamily: 'Inter_400Regular',
                      color: row.link ? BRAND_PURPLE : INK_700,
                    }}
                    numberOfLines={1}
                  >
                    {row.value}
                  </Text>
                  {row.trailing ? <View style={{ marginLeft: 10 }}>{row.trailing}</View> : null}
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

          {/* Share left, Report centred, listing ID right. */}
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
              onPress={shareListing}
              accessibilityRole="button"
              accessibilityLabel="Share this listing"
              // The row is deliberately light, so the target is extended
              // rather than padded — these sit ~28px tall on their own.
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
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

            {/* Taken out of the flow so it centres on the row itself (three
                equal-flex columns didn't hold: the ID column, wider than
                "Share", grew past its third and nudged Report left).
                The −12 translate is optical centring: the flag + gap add 24px
                of width entirely on the label's left, so geometric centring
                parks the *word* "Report" ~12px right of true centre. Shift the
                block back by half that so the label reads dead-centre. */}
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Pressable
                onPress={handleReport}
                accessibilityRole="button"
                accessibilityLabel="Report this listing"
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 6,
                  transform: [{ translateX: -12 }],
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
            </View>

            <Text
              style={{
                fontSize: 12,
                color: CHEVRON_GRAY,
                letterSpacing: 0.4,
                fontFamily: 'Inter_500Medium',
              }}
            >
              ID · {listing.id.slice(0, 8)}
            </Text>
          </View>
        </View>

        {/* ── Shop & sell safely (reusable trust banner) ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 6 }}>
          <SafetyBanner />
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
              onSelectAll={() => {
                tap('medium');
                setSelectedBundleIds(new Set(sellerItems.map((s) => s.id)));
              }}
              onClearAll={() => {
                tap('selection');
                setSelectedBundleIds(new Set());
              }}
              onSendBundleOffer={(amount) => {
                tap('medium');
                if (!user) {
                  guestGate.prompt({
                    title: 'Send a bundle offer',
                    message: 'Create a free account to bundle items and send the seller an offer.',
                    icon: 'message-circle',
                  });
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

      {/* ── Fixed bottom bar — sticky thumb zone (Z: 50) ── */}
      <ProductActionBar
        price={itemPrice}
        buyTotal={buyTotal}
        bottomInset={insets.bottom}
        isOwner={isOwnListing}
        onChatPress={() => openChat('message')}
        onOfferPress={() => {
          if (canOffer()) setOfferVisible(true);
        }}
        onBuyPress={() => {
          tap('medium');
          if (isOwnListing) {
            openSellSheet();
            return;
          }
          if (!user) {
            guestGate.prompt({
              title: 'Almost yours',
              message: 'Create a free account to check out securely with buyer protection included.',
              icon: 'shopping-bag',
              cta: 'Create account & continue',
            });
            return;
          }
          if (!listing?.id) return;
          setCheckoutVisible(true);
        }}
      />

      {/* 1-Step Zero-Navigation Checkout Sheet (Buyer Path) */}
      <CheckoutSheet
        visible={checkoutVisible}
        product={{
          id: listing.id,
          title: listing.title,
          price: itemPrice,
          imageUrl: images[0],
          sellerName: listing.seller?.username || 'Seller',
          shippingFee: DEFAULT_SHIPPING_FEE,
          buyerProtectionFee: bpFee,
        }}
        onClose={() => setCheckoutVisible(false)}
        onConfirmPay={({ fulfillment, paymentMethod }) => {
          setCheckoutVisible(false);
          router.push({
            pathname: `/payment/${listing.id}`,
            params: {
              fulfillment,
              paymentMethod,
            },
          } as any);
        }}
      />


      {/* Save-to-list sheet — opens from the bookmark pill or by long-pressing
          the heart. The listing is "saved" if it lives in any of the user's
          lists; the sheet handles list creation + per-list toggling. */}
      {user?.id ? (
        <SaveListSheet
          visible={saveListVisible}
          userId={user.id}
          listingId={listing.id}
          onClose={() => setSaveListVisible(false)}
          onChanged={(isSaved) => {
            const wasSaved = saved;
            // The sheet's add/remove already invalidated the saved-ids query, so
            // `saved` re-derives on its own once the refetch lands. Write it
            // through first so the bookmark flips on close rather than a round
            // trip later; the refetch then reconciles.
            updateSavedCache(user.id, listing.id, isSaved);
            // Spring the bookmark only when the saved state actually flips.
            if (isSaved !== wasSaved) saveAnimRef.current?.animateTo(isSaved);
            if (isSaved) capture('listing_saved', { listing_id: productIdParam });
          }}
        />
      ) : null}

      {/* Offer sheet — opens from the action bar's "Offer" button */}
      <OfferSheet
        visible={offerVisible}
        askingPrice={itemPrice}
        onClose={() => setOfferVisible(false)}
        onSubmit={(amount) => {
          setOfferVisible(false);
          submitOffer(amount);
        }}
      />

      {/* Buyer Protection breakdown — opens from the price row */}
      <BuyerProtectionSheet
        visible={bpVisible}
        itemPrice={itemPrice}
        onClose={() => setBpVisible(false)}
      />

      {/* Fullscreen image viewer — opens on tap, swipe to navigate */}
      <FullscreenImageViewer
        visible={fullscreenIndex !== null}
        images={images}
        initialIndex={fullscreenIndex ?? 0}
        onClose={() => setFullscreenIndex(null)}
      />
    </View>
  );
}
