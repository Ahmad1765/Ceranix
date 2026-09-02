// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DETAIL SCREEN (CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Coordinator Architecture & Worklet Performance
//
// 1. Separation of Responsibilities:
//    The product detail page (previously 1,764 lines) is now a slim Coordinator:
//    - Server State: React Query hooks (`useListingQuery`, `useFollowStateQuery`).
//    - Domain State: `useProductEngagement` (likes, saves, overlays) &
//      `useProductBundle` (multi-item discount builder).
//    - Presentational Subcomponents: `ProductHeaderNav`, `ProductHeroSection`,
//      `ProductDetailsTable`, `ProductSellerProfileCard`, `ProductRelatedSection`.
//
// 2. UI Thread Performance:
//    Parallax scrolling and hero stretch run entirely on the UI thread via
//    Reanimated worklets (`scrollHandler`, `heroParallaxStyle`). Subcomponents
//    are wrapped in `React.memo` with stable callback identities to guarantee
//    smooth 60fps gesture handling.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert, Share } from 'react-native';
import { Text } from '@/lib/rnText';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/nav';
import Feather from '@expo/vector-icons/Feather';
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
  useListingQuery,
  useSellerOtherListingsQuery,
  useSetListingSold,
  useSimilarListingsQuery,
  useToggleFollow,
} from '@/lib/queries';
import { confirm } from '@/lib/confirm';
import { logListingView } from '@/lib/recommendations';
import { capture, buildListingViewedProps } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { captureError } from '@/lib/sentry';
import { getOrCreateConversation, sendOffer } from '@/lib/chat';
import { cardImageUrl, prefetchImages } from '@/lib/images';
import { SaveListSheet } from '@/components/SaveListSheet';
import { colors } from '@/lib/theme';
import { FullscreenImageViewer } from '@/components/product/FullscreenImageViewer';
import { ProductActionBar } from '@/components/product/ProductActionBar';
import { SellerOptionsSheet } from '@/components/product/SellerOptionsSheet';
import { CheckoutSheet } from '@/components/product/CheckoutSheet';
import { OfferSheet } from '@/components/product/OfferSheet';
import type { PopIconHandle } from '@/components/product/PopIcon';
import { ProductSkeleton } from '@/components/product/ProductSkeleton';
import {
  tap,
  IMAGE_HEIGHT,
  FALLBACK_SELLER,
  EMPTY_LISTINGS,
} from '@/components/product/shared';
import { useTheme } from '@/context/ThemeContext';
import { BRAND, APP_URL } from '@/lib/brand';
import { reportListing, REPORT_REASONS } from '@/lib/reports';
import { useGuestGate } from '@/components/GuestGate';
import { buyerProtectionFee, orderTotal, formatPrice, DEFAULT_SHIPPING_FEE } from '@/lib/fees';
import { useSellSheet } from '@/components/sell/SellSheet';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import { errorMessage } from '@/lib/errors';
import {
  ProductDetailsTable,
  ProductHeaderNav,
  ProductHeroSection,
  ProductOverviewHeader,
  ProductRelatedSection,
  ProductSellerProfileCard,
  useProductBundle,
  useProductEngagement,
} from '@/components/product';

// Read-side normalization for useListingQuery.
const withFallbackSeller = (row: Listing | null): Listing | null =>
  row ? { ...row, seller: row.seller ?? (FALLBACK_SELLER as Listing['seller']) } : null;

export default function ProductScreen() {
  const { theme, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const guestGate = useGuestGate();
  const { open: openSellSheet } = useSellSheet();
  const productIdParam = Array.isArray(id) ? id[0] : id;

  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);

  // Imperative pop icon animation handles
  const heartAnimRef = useRef<PopIconHandle>(null);
  const saveAnimRef = useRef<PopIconHandle>(null);
  const mainScrollRef = useRef<any>(null);

  // ── Primary Listing Query ────────────────────────────────────────────────
  const listingQ = useListingQuery(productIdParam, withFallbackSeller);
  const listing = listingQ.data ?? null;

  // ── Related Listings Queries ─────────────────────────────────────────────
  const sellerItemsQ = useSellerOtherListingsQuery(
    listing?.seller_id ?? null,
    listing?.id ?? null,
  );
  const similarItemsQ = useSimilarListingsQuery(productIdParam ?? null);
  const sellerItems = (sellerItemsQ.data ?? EMPTY_LISTINGS).filter((s) => !s.is_sold);
  const similarItems = (similarItemsQ.data ?? EMPTY_LISTINGS).filter((s) => !s.is_sold);

  // Proactively warm up browser/disk cache with carousel photos and related item cards
  useEffect(() => {
    if (listing?.images && listing.images.length > 1) {
      prefetchImages(listing.images.slice(1));
    }
    const related = [...sellerItems, ...similarItems].slice(0, 6);
    if (related.length > 0) {
      prefetchImages(related.map((l) => cardImageUrl(l, 0)));
    }
  }, [listing?.images, sellerItems, similarItems]);

  // ── Engagement Domain Hook (Likes, Saves, Modals) ────────────────────────
  const engagement = useProductEngagement({
    listingId: productIdParam,
    listing,
    user,
    guestGate,
    heartAnimRef,
    saveAnimRef,
  });

  // ── Bundle Domain Hook (Multi-Item Math & Selections) ────────────────────
  const bundle = useProductBundle({
    listing,
    sellerItems,
    user,
    guestGate,
  });

  // ── Social & Follow State ────────────────────────────────────────────────
  const sellerId = listing?.seller?.id ?? '';
  const isOwnListing = !!user?.id && listing?.seller_id === user.id;
  const followStateQ = useFollowStateQuery(user?.id ?? null, isOwnListing ? '' : sellerId);
  const followState = followStateQ.data;
  const followed = followState ? followState.isFollowing : false;
  const toggleFollowM = useToggleFollow(user?.id ?? null, sellerId);
  const followBusy = toggleFollowM.isPending;

  // ── Owner Actions (Mark as Sold & Delete) ────────────────────────────────
  const setSoldM = useSetListingSold(listing?.id ?? null);
  const deleteM = useDeleteListing(listing?.seller_id ?? null);
  const soldBusy = setSoldM.isPending;
  const deleteBusy = deleteM.isPending;
  const ownerBusy = soldBusy || deleteBusy;

  // ── Analytics & Recommender Logging ──────────────────────────────────────
  useEffect(() => {
    if (productIdParam && user?.id) logListingView(productIdParam);
  }, [productIdParam, user?.id]);

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

  const refetchFollow = followStateQ.refetch;
  useFocusEffect(
    useCallback(() => {
      if (sellerId && !isOwnListing) refetchFollow();
    }, [sellerId, isOwnListing, refetchFollow]),
  );

  // ── Reanimated Scroll & Parallax Handlers ────────────────────────────────
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
    },
  );

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

  // ── Action Callbacks ─────────────────────────────────────────────────────
  const handleToggleSold = useCallback(async () => {
    if (!listing || ownerBusy) return;
    const next = !listing.is_sold;
    const successMessage = next ? 'Marked as sold' : 'Marked as available';

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
  }, [listing, ownerBusy, setSoldM, toast]);

  const handleDelete = useCallback(async () => {
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
  }, [listing, ownerBusy, deleteM, toast]);

  const handleFollowPress = useCallback(async () => {
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

    const sellerHandle = listing?.seller?.username ?? 'seller';
    const wasFollowing = followed;
    const undoFollow = async () => {
      try {
        await toggleFollowM.mutateAsync({ currentlyFollowing: true });
      } catch {
        toast.show('Could not undo', { variant: 'default', icon: 'alert-triangle' });
      }
    };

    let next: any = null;
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
  }, [user, sellerId, followBusy, listing?.seller?.username, followed, toggleFollowM, guestGate, toast]);

  const openChat = useCallback((mode: 'message' | 'offer') => {
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
  }, [user, listing, guestGate, toast]);

  const canOffer = useCallback(() => {
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
  }, [user, listing, guestGate, toast]);

  const submitOffer = useCallback(async (amount: number) => {
    if (!listing || !user) return;
    setOfferLoading(true);
    try {
      const conv = await getOrCreateConversation({
        buyerId: user.id,
        sellerId: listing.seller_id,
        listingId: listing.id,
      });
      if (!conv) {
        Alert.alert('Could not start chat', 'Please try again.');
        return;
      }
      const saved = await sendOffer({
        conversationId: conv.id,
        senderId: user.id,
        amount,
      });
      if (saved) {
        engagement.setOfferVisible(false);
        toast.show('Offer sent', { variant: 'success', icon: 'check' });
        capture('offer_made', { listing_id: listing.id, amount });
        router.push(`/conversation/${conv.id}` as any);
      } else {
        Alert.alert('Could not send offer', 'Please try again.');
      }
    } catch (e: any) {
      captureError(e, { fn: 'product.submitOffer' });
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setOfferLoading(false);
    }
  }, [listing, user, engagement, toast]);

  const shareListing = useCallback(async () => {
    if (!listing) return;
    tap('light');
    try {
      const url = `${APP_URL}/product/${listing.id}`;
      await Share.share({
        message: `${listing.title} · ${formatPrice(listing.price)} on ${BRAND}\n${url}`,
        url,
      });
    } catch {
      // User dismissed share sheet
    }
  }, [listing]);

  const handleReport = useCallback(() => {
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
  }, [user, listing, toast]);

  // ── Loading & Not Found States ───────────────────────────────────────────
  const notFound = !productIdParam || (listingQ.isSuccess && !listing);
  const loadErrorText = listingQ.error ? errorMessage(listingQ.error) : '';

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <Pressable onPress={() => safeBack()} hitSlop={10} style={{ padding: 16 }}>
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="alert-circle" size={42} color={colors.mute} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 14 }}>
            Listing not available
          </Text>
          <Text style={{ fontSize: 14, color: colors.mute, marginTop: 6, textAlign: 'center' }}>
            It may have been removed or never existed.
          </Text>
        </View>
      </View>
    );
  }

  if (listingQ.isError && !listing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <Pressable onPress={() => safeBack()} hitSlop={10} style={{ padding: 16 }}>
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="wifi-off" size={36} color={colors.mute} />
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 14, letterSpacing: -0.3 }}>
            Couldn&apos;t load this listing
          </Text>
          <Text style={{ fontSize: 13, color: colors.mute, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
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
              backgroundColor: colors.ink,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="refresh-cw" size={14} color={colors.white} />
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: 14, marginLeft: 8 }}>
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

  const itemPrice = Number(listing.price ?? 0);
  const bpFee = buyerProtectionFee(itemPrice);
  const buyTotal = orderTotal(itemPrice);
  const images = listing.images ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} animated />

      {/* 1. Floating Top Navigation Bar (Z: 30) */}
      <ProductHeaderNav
        showStickyHeader={showStickyHeader}
        title={listing.title}
        onBack={() => safeBack()}
      />

      <Animated.ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 120 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        {/* 2. Hero Image Carousel & Action Discs */}
        <ProductHeroSection
          images={images}
          isSold={listing.is_sold}
          liked={engagement.liked}
          saved={engagement.saved}
          heartCount={engagement.heartCount}
          heroParallaxStyle={heroParallaxStyle}
          heartAnimRef={heartAnimRef}
          saveAnimRef={saveAnimRef}
          onImagePress={(i) => {
            tap('selection');
            engagement.setFullscreenIndex(i);
          }}
          onHeartPress={engagement.handleHeartPress}
          onOpenSaveList={engagement.handleOpenSaveList}
        />

        {/* 3. Product Overview (Title, Metadata, Price & Buyer Protection) */}
        <ProductOverviewHeader
          listing={listing}
          bpFee={bpFee}
          onOpenBpSheet={() => engagement.setBpVisible(true)}
        />

        {/* 4. Seller Profile Card */}
        <ProductSellerProfileCard
          seller={listing.seller}
          createdAt={listing.created_at}
          isOwnListing={isOwnListing}
          isSold={listing.is_sold}
          ownerBusy={ownerBusy}
          soldBusy={soldBusy}
          deleteBusy={deleteBusy}
          followed={followed}
          onToggleSold={handleToggleSold}
          onDelete={handleDelete}
          onEdit={() => openSellSheet(listing)}
          onFollowPress={handleFollowPress}
          onMessagePress={() => openChat('message')}
          onMoreOptionsPress={() => {
            tap('selection');
            engagement.setSellerOptionsVisible(true);
          }}
        />

        {/* 5. Product Editorial Details Table (Description, Details Box, Safety) */}
        <ProductDetailsTable
          listing={listing}
          descExpanded={descExpanded}
          onToggleDescExpanded={() => {
            tap('selection');
            setDescExpanded((v) => !v);
          }}
          onShare={shareListing}
          onReport={handleReport}
        />

        {/* 6. Multi-Item Bundle Section & Related Grid */}
        <ProductRelatedSection
          listing={listing}
          relatedTab={bundle.relatedTab}
          sellerItems={sellerItems}
          similarItems={similarItems}
          selectedBundleIds={bundle.selectedBundleIds}
          onTabChange={bundle.setRelatedTab}
          onToggleBundleItem={bundle.handleToggleBundleItem}
          onSelectAllBundle={bundle.handleSelectAllBundle}
          onClearAllBundle={bundle.handleClearAllBundle}
          onSendBundleOffer={bundle.handleSendBundleOffer}
        />
      </Animated.ScrollView>

      {/* 7. Fixed Bottom Thumb Zone Action Bar (Z: 50) */}
      <ProductActionBar
        price={itemPrice}
        buyTotal={buyTotal}
        bottomInset={insets.bottom}
        isOwner={isOwnListing}
        isSold={listing.is_sold}
        onChatPress={() => openChat('message')}
        onOfferPress={() => {
          if (canOffer()) engagement.setOfferVisible(true);
        }}
        onBuyPress={() => {
          tap('medium');
          if (isOwnListing) {
            openSellSheet(listing);
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
          engagement.setCheckoutVisible(true);
        }}
      />

      {/* 8. Modal & Sheet Overlays */}
      <CheckoutSheet
        visible={engagement.checkoutVisible}
        product={{
          id: listing.id,
          title: listing.title,
          price: itemPrice,
          imageUrl: images[0],
          sellerName: listing.seller?.username || 'Seller',
          shippingFee: DEFAULT_SHIPPING_FEE,
          buyerProtectionFee: bpFee,
        }}
        onClose={() => engagement.setCheckoutVisible(false)}
        onConfirmPay={({ fulfillment, paymentMethod }) => {
          engagement.setCheckoutVisible(false);
          router.push({
            pathname: `/payment/${listing.id}`,
            params: {
              fulfillment,
              paymentMethod,
            },
          } as any);
        }}
      />

      {user?.id ? (
        <SaveListSheet
          visible={engagement.saveListVisible}
          userId={user.id}
          listingId={listing.id}
          onClose={() => engagement.setSaveListVisible(false)}
          onChanged={engagement.onSaveListChanged}
        />
      ) : null}

      <OfferSheet
        visible={engagement.offerVisible}
        askingPrice={itemPrice}
        title={listing?.title}
        imageUrl={listing?.images?.[0] ?? (listing as any)?.image_url ?? null}
        loading={offerLoading}
        onClose={() => engagement.setOfferVisible(false)}
        onSubmit={submitOffer}
      />

      <BuyerProtectionSheet
        visible={engagement.bpVisible}
        itemPrice={itemPrice}
        onClose={() => engagement.setBpVisible(false)}
      />

      <FullscreenImageViewer
        visible={engagement.fullscreenIndex !== null}
        images={images}
        initialIndex={engagement.fullscreenIndex ?? 0}
        onClose={() => engagement.setFullscreenIndex(null)}
      />

      {listing?.seller ? (
        <SellerOptionsSheet
          visible={engagement.sellerOptionsVisible}
          seller={listing.seller}
          listingId={listing.id}
          onClose={() => engagement.setSellerOptionsVisible(false)}
        />
      ) : null}
    </View>
  );
}
