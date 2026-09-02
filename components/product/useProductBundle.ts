// ─────────────────────────────────────────────────────────────────────────────
// USE PRODUCT BUNDLE HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Immutable State Collections & Domain State Isolation
//
// 1. Immutable Set State:
//    React re-renders depend on reference changes. Modifying a `Set` in place (e.g.
//    `set.add(id)`) doesn't trigger re-renders. We always construct a `new Set(prev)`
//    when toggling bundle selections.
//
// 2. Cross-Screen State Reset:
//    When a user taps a related product, we reset `selectedBundleIds` so items from
//    the previous seller don't bleed into the next product page.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import type { User as AuthUser } from '@supabase/supabase-js';
import { useToast } from '@/lib/toast';
import { tap } from '@/components/product/shared';
import type { useGuestGate } from '@/components/GuestGate';
import type { Listing } from '@/types';

type UseProductBundleProps = {
  listing: Listing | null;
  sellerItems: Listing[];
  user: AuthUser | null;
  guestGate: ReturnType<typeof useGuestGate>;
};

export function useProductBundle({
  listing,
  sellerItems,
  user,
  guestGate,
}: UseProductBundleProps) {
  const toast = useToast();
  const [selectedBundleIds, setSelectedBundleIds] = useState<Set<string>>(new Set());
  const [relatedTab, setRelatedTab] = useState<'members' | 'similar'>('members');

  // Reset bundle selection whenever the viewed listing changes
  useEffect(() => {
    setSelectedBundleIds(new Set());
  }, [listing?.id]);

  const handleToggleBundleItem = useCallback((id: string) => {
    tap('selection');
    setSelectedBundleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllBundle = useCallback(() => {
    tap('medium');
    setSelectedBundleIds(new Set(sellerItems.filter((s) => !s.is_sold).map((s) => s.id)));
  }, [sellerItems]);

  const handleClearAllBundle = useCallback(() => {
    tap('selection');
    setSelectedBundleIds(new Set());
  }, []);

  const handleBuyBundle = useCallback(
    (total: number, selectedItemIds?: string[]) => {
      tap('medium');
      if (!user) {
        guestGate.prompt({
          title: 'Buy bundle',
          message: 'Create a free account to bundle items and check out.',
          icon: 'shopping-bag',
        });
        return;
      }
      if (!listing) return;
      if (listing.is_sold) {
        toast.show('This item is already sold', { variant: 'default', icon: 'info' });
        return;
      }
      if (listing.seller_id === user.id) {
        toast.show("That's your own listing", { variant: 'default', icon: 'info' });
        return;
      }
      const ids = selectedItemIds ?? Array.from(selectedBundleIds);
      const params: Record<string, string> = {
        bundle_total: total.toFixed(2),
      };
      if (ids.length > 0) {
        params.bundle_ids = ids.join(',');
      }
      router.push({
        pathname: `/payment/${listing.id}`,
        params,
      } as any);
    },
    [user, listing, selectedBundleIds, guestGate, toast],
  );

  const handleSendBundleOffer = useCallback(
    (amount: number, selectedItemIds?: string[]) => {
      tap('medium');
      if (!user) {
        guestGate.prompt({
          title: 'Send a bundle offer',
          message: 'Create a free account to bundle items and send the seller an offer.',
          icon: 'message-circle',
        });
        return;
      }
      if (!listing) return;
      if (listing.is_sold) {
        toast.show('This item is already sold', { variant: 'default', icon: 'info' });
        return;
      }
      if (listing.seller_id === user.id) {
        toast.show("That's your own listing", { variant: 'default', icon: 'info' });
        return;
      }
      const ids = selectedItemIds ?? Array.from(selectedBundleIds);
      const params: Record<string, string> = {
        listing: listing.id,
        mode: 'offer',
        amount: amount.toFixed(2),
      };
      if (ids.length > 0) {
        params.bundle_ids = ids.join(',');
      }
      router.push({
        pathname: '/conversation/new',
        params,
      } as any);
    },
    [user, listing, selectedBundleIds, guestGate, toast],
  );

  return {
    selectedBundleIds,
    setSelectedBundleIds,
    relatedTab,
    setRelatedTab,
    handleToggleBundleItem,
    handleSelectAllBundle,
    handleClearAllBundle,
    handleBuyBundle,
    handleSendBundleOffer,
  };
}
