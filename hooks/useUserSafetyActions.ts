// ─────────────────────────────────────────────────────────────────────────────
// USE USER SAFETY ACTIONS HOOK (UNIFIED MODAL & SAFETY ORCHESTRATION)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Centralized Safety Workflow & Moderation Guardrails
//
// 1. DRY Safety Invariants:
//    Reporting and blocking are critical trust-and-safety actions that occur on
//    multiple screens: Product Details, Seller Profiles, and Conversation Threads.
//    Centralizing them in `useUserSafetyActions` guarantees consistent validation
//    (self-action prevention, guest authentication guards, localized reason pickers,
//    and async moderation database tracking).
//
// 2. Elimination of Prop-Drilling:
//    Components can invoke `reportUser`, `blockUser`, or `showSafetySheet` directly
//    without parent screens having to thread 10+ modal callbacks and state flags
//    down deep component trees.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useGuestGate } from '@/components/GuestGate';
import { reportListing, reportUser, REPORT_REASONS, SELLER_REPORT_REASONS } from '@/lib/reports';
import { blockUser, unblockUser } from '@/lib/blocks';
import { capture } from '@/lib/analytics';
import { tap } from '@/lib/haptics';

type SafetyActionOptions = {
  onBlocked?: (blockedUserId: string) => void;
  onUnblocked?: (unblockedUserId: string) => void;
  onReported?: () => void;
};

export function useUserSafetyActions(options: SafetyActionOptions = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const guestGate = useGuestGate();
  const [busy, setBusy] = useState(false);

  // ── 1. Report User Action ────────────────────────────────────────────────
  const handleReportUser = useCallback(
    async (targetUserId: string, targetUsername?: string, listingId?: string | null) => {
      tap('light');
      if (!user) {
        toast.show('Sign in to submit a report', { variant: 'info', icon: 'log-in' });
        router.push('/auth/login');
        return;
      }
      if (user.id === targetUserId) {
        toast.show("You can't report your own account", { variant: 'default', icon: 'info' });
        return;
      }

      const userLabel = targetUsername ? `@${targetUsername}` : 'this user';

      Alert.alert(
        `Report ${userLabel}`,
        'Why are you reporting this user?',
        [
          ...SELLER_REPORT_REASONS.map((r) => ({
            text: r.label,
            onPress: async () => {
              setBusy(true);
              const ok = await reportUser({
                reporterId: user.id,
                reportedUserId: targetUserId,
                reason: r.id,
                listingId: listingId ?? null,
              });
              setBusy(false);

              if (ok) {
                capture('user_reported', { reported_user_id: targetUserId, reason: r.id });
                toast.show('Thanks — our team will review this report.', {
                  variant: 'success',
                  icon: 'check',
                });
                options.onReported?.();
              } else {
                toast.show("Couldn't submit report. Please try again.", {
                  variant: 'default',
                  icon: 'alert-triangle',
                });
              }
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    },
    [user, toast, options],
  );

  // ── 2. Report Listing Action ─────────────────────────────────────────────
  const handleReportListing = useCallback(
    async (listingId: string, sellerId?: string | null) => {
      tap('light');
      if (!user) {
        toast.show('Sign in to report a listing', { variant: 'info', icon: 'log-in' });
        router.push('/auth/login');
        return;
      }
      if (sellerId && user.id === sellerId) {
        toast.show("You can't report your own listing", { variant: 'default', icon: 'info' });
        return;
      }

      Alert.alert(
        'Report Listing',
        'Why are you reporting this item?',
        [
          ...REPORT_REASONS.map((r) => ({
            text: r.label,
            onPress: async () => {
              setBusy(true);
              const ok = await reportListing({
                listingId,
                reporterId: user.id,
                reportedUserId: sellerId ?? null,
                reason: r.id,
              });
              setBusy(false);

              if (ok) {
                capture('listing_reported', { listing_id: listingId, reason: r.id });
                toast.show('Thanks — our team will review this listing.', {
                  variant: 'success',
                  icon: 'check',
                });
                options.onReported?.();
              } else {
                toast.show("Couldn't submit report", {
                  variant: 'default',
                  icon: 'alert-triangle',
                });
              }
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    },
    [user, toast, options],
  );

  // ── 3. Block User Action ─────────────────────────────────────────────────
  const handleBlockUser = useCallback(
    async (targetUserId: string, targetUsername?: string) => {
      tap('light');
      if (!user) {
        guestGate.prompt({
          title: 'Sign in to block',
          message: 'Create a free account to manage user safety and block contacts.',
          icon: 'slash',
        });
        return;
      }
      if (user.id === targetUserId) {
        toast.show("You can't block yourself", { variant: 'default', icon: 'info' });
        return;
      }

      const userLabel = targetUsername ? `@${targetUsername}` : 'this user';

      Alert.alert(
        `Block ${userLabel}?`,
        'They will not be able to message you or view your listings. Any active chats will be hidden.',
        [
          { text: 'Cancel', style: 'cancel' as const },
          {
            text: 'Block User',
            style: 'destructive' as const,
            onPress: async () => {
              setBusy(true);
              const ok = await blockUser({
                blockerId: user.id,
                blockedId: targetUserId,
                blockedUsername: targetUsername,
              });
              setBusy(false);

              if (ok) {
                capture('user_blocked', { blocked_user_id: targetUserId });
                toast.show(`Blocked ${userLabel}`, { variant: 'info', icon: 'slash' });
                options.onBlocked?.(targetUserId);
              } else {
                toast.show("Couldn't block user", { variant: 'default', icon: 'alert-triangle' });
              }
            },
          },
        ],
      );
    },
    [user, guestGate, toast, options],
  );

  // ── 4. Unblock User Action ───────────────────────────────────────────────
  const handleUnblockUser = useCallback(
    async (targetUserId: string, targetUsername?: string) => {
      if (!user) return;
      const userLabel = targetUsername ? `@${targetUsername}` : 'this user';

      Alert.alert(
        `Unblock ${userLabel}?`,
        'They will be able to message you and purchase your items again.',
        [
          { text: 'Cancel', style: 'cancel' as const },
          {
            text: 'Unblock',
            onPress: async () => {
              setBusy(true);
              const ok = await unblockUser({
                blockerId: user.id,
                blockedId: targetUserId,
              });
              setBusy(false);

              if (ok) {
                toast.show(`Unblocked ${userLabel}`, { variant: 'success', icon: 'check' });
                options.onUnblocked?.(targetUserId);
              } else {
                toast.show("Couldn't unblock user", {
                  variant: 'default',
                  icon: 'alert-triangle',
                });
              }
            },
          },
        ],
      );
    },
    [user, toast, options],
  );

  // ── 5. Safety Sheet Hub Action ───────────────────────────────────────────
  const showSafetySheet = useCallback(
    (targetUserId: string, targetUsername?: string, listingId?: string | null) => {
      const userLabel = targetUsername ? `@${targetUsername}` : 'User';
      Alert.alert(
        userLabel,
        'Safety and moderation options',
        [
          {
            text: 'Report User',
            style: 'destructive' as const,
            onPress: () => handleReportUser(targetUserId, targetUsername, listingId),
          },
          {
            text: 'Block User',
            style: 'destructive' as const,
            onPress: () => handleBlockUser(targetUserId, targetUsername),
          },
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    },
    [handleReportUser, handleBlockUser],
  );

  return {
    busy,
    reportUser: handleReportUser,
    reportListing: handleReportListing,
    blockUser: handleBlockUser,
    unblockUser: handleUnblockUser,
    showSafetySheet,
  };
}
