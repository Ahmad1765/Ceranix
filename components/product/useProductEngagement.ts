// ─────────────────────────────────────────────────────────────────────────────
// USE PRODUCT ENGAGEMENT HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Decoupling Engagement & Micro-Interaction State
//
// 1. Separation of Concerns:
//    Like and save toggles have complex optimistic lifecycles (spring physics,
//    TanStack query cache synchronization, guest gating, analytics dispatch).
//    Encapsulating this logic in `useProductEngagement` keeps the main product
//    screen completely clean.
//
// 2. Stable Callbacks (`useCallback`):
//    `handleHeartPress` and `handleOpenSaveList` are passed down to memoized hero
//    components. Maintaining stable reference identities prevents unnecessary
//    re-renders of heavy components like image carousels.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react';
import type { User as AuthUser } from '@supabase/supabase-js';
import { useLikedIdsQuery, useSavedIdsQuery, useToggleLike } from '@/lib/queries';
import { updateSavedCache } from '@/lib/engagementCache';
import { useToast } from '@/lib/toast';
import { capture } from '@/lib/analytics';
import { tap } from '@/components/product/shared';
import type { PopIconHandle } from '@/components/product/PopIcon';
import type { useGuestGate } from '@/components/GuestGate';
import type { Listing } from '@/types';

type UseProductEngagementProps = {
  listingId: string | undefined;
  listing: Listing | null;
  user: AuthUser | null;
  guestGate: ReturnType<typeof useGuestGate>;
  heartAnimRef: React.RefObject<PopIconHandle | null>;
  saveAnimRef: React.RefObject<PopIconHandle | null>;
};

export function useProductEngagement({
  listingId,
  listing,
  user,
  guestGate,
  heartAnimRef,
  saveAnimRef,
}: UseProductEngagementProps) {
  const toast = useToast();

  // ── Overlay Modal States ─────────────────────────────────────────────────
  const [saveListVisible, setSaveListVisible] = useState(false);
  const [bpVisible, setBpVisible] = useState(false);
  const [offerVisible, setOfferVisible] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [sellerOptionsVisible, setSellerOptionsVisible] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);

  // ── Query State ──────────────────────────────────────────────────────────
  const likedIds = useLikedIdsQuery(user?.id ?? null).data;
  const savedIds = useSavedIdsQuery(user?.id ?? null).data;

  const liked = useMemo(
    () => !!listingId && !!likedIds && likedIds.includes(listingId),
    [listingId, likedIds],
  );

  const saved = useMemo(
    () => !!listingId && !!savedIds && savedIds.includes(listingId),
    [listingId, savedIds],
  );

  const heartCount = Math.max(0, Number(listing?.likes ?? 0));

  const toggleLikeM = useToggleLike(user?.id ?? null);
  const likeBusy = toggleLikeM.isPending;

  // ── Heart / Like Handler ─────────────────────────────────────────────────
  const handleHeartPress = useCallback(async () => {
    tap('light');
    if (!user) {
      guestGate.prompt({
        title: 'Save your favourites',
        message: 'Create a free account to like items and keep everything you love in one place.',
        icon: 'heart',
        resume: listingId ? { kind: 'like', listingId } : undefined,
      });
      return;
    }
    if (!listingId || likeBusy) return;

    const wasLiked = liked;
    heartAnimRef.current?.animateTo(!wasLiked);

    let committed: boolean | null = null;
    let failure: unknown = null;
    try {
      committed = await toggleLikeM.mutateAsync({
        listingId,
        currentlyLiked: wasLiked,
      });
    } catch (e) {
      failure = e;
    }

    if (failure !== null || committed === wasLiked) {
      heartAnimRef.current?.animateTo(wasLiked);
      toast.show('Could not update like', { variant: 'default', icon: 'alert-triangle' });
    } else if (committed) {
      capture('listing_liked', { listing_id: listingId });
    }
  }, [user, listingId, likeBusy, liked, guestGate, heartAnimRef, toggleLikeM, toast]);

  // ── Save List Handlers ───────────────────────────────────────────────────
  const handleOpenSaveList = useCallback(() => {
    if (!user?.id) {
      guestGate.prompt({
        title: 'Save to a collection',
        message: 'Create a free account to save items into collections you can come back to.',
        icon: 'bookmark',
        resume: listingId ? { kind: 'save', listingId } : undefined,
      });
      return;
    }
    tap('medium');
    setSaveListVisible(true);
  }, [user?.id, guestGate, listingId]);

  const onSaveListChanged = useCallback(
    (isSaved: boolean) => {
      if (!user?.id || !listingId) return;
      const wasSaved = saved;
      updateSavedCache(user.id, listingId, isSaved);
      if (isSaved !== wasSaved) saveAnimRef.current?.animateTo(isSaved);
      if (isSaved) capture('listing_saved', { listing_id: listingId });
    },
    [user?.id, listingId, saved, saveAnimRef],
  );

  return {
    liked,
    saved,
    heartCount,
    likeBusy,
    saveListVisible,
    setSaveListVisible,
    bpVisible,
    setBpVisible,
    offerVisible,
    setOfferVisible,
    checkoutVisible,
    setCheckoutVisible,
    sellerOptionsVisible,
    setSellerOptionsVisible,
    fullscreenIndex,
    setFullscreenIndex,
    handleHeartPress,
    handleOpenSaveList,
    onSaveListChanged,
  };
}
