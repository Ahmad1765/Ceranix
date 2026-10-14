// Should the Activity tab show its dot?
//
// Yes when either:
//   • any conversation is unread — the same rule the inbox rows use
//     (isConversationUnread), so the dot and the inbox can never disagree. This
//     covers messages, offers, support replies and order updates posted in chat;
//   • someone bought one of your items since you last opened Activity.
//
// It reads the inbox's own React Query cache (useInboxQuery) and the same
// Realtime subscription, so it costs no extra conversation queries.

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { subscribeToInbox } from '@/lib/chat';
import { useInboxQuery } from '@/lib/queries';
import { hasNewActivity } from './activityDot';

const SEEN_KEY = 'activity_seen_at';

// Opening Activity clears the "new sale" half everywhere at once.
const seenListeners = new Set<(at: string) => void>();

export async function markActivitySeen(): Promise<void> {
  const at = new Date().toISOString();
  seenListeners.forEach((fn) => fn(at));
  try {
    await AsyncStorage.setItem(SEEN_KEY, at);
  } catch {
    // Non-fatal: the sale dot may reappear once after a restart.
  }
}

export function useActivityDot(): boolean {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { data: conversations, refetch } = useInboxQuery(userId);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [latestSaleAt, setLatestSaleAt] = useState<string | null>(null);

  const loadLatestSale = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('orders')
      .select('created_at')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestSaleAt((data as { created_at?: string } | null)?.created_at ?? null);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SEEN_KEY)
      .then(async (stored) => {
        if (cancelled) return;
        if (stored) return setSeenAt(stored);
        // First run on this device: start from now rather than lighting the dot
        // for every sale that happened before this feature existed.
        const now = new Date().toISOString();
        setSeenAt(now);
        await AsyncStorage.setItem(SEEN_KEY, now);
      })
      .catch(() => setSeenAt(new Date().toISOString()));
    seenListeners.add(setSeenAt);
    return () => {
      cancelled = true;
      seenListeners.delete(setSeenAt);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadLatestSale();
    const unsubInbox = subscribeToInbox(userId, () => {
      refetch();
    });
    const sales = supabase
      .channel(`activity-sales:${userId}:${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `seller_id=eq.${userId}` },
        () => loadLatestSale(),
      )
      .subscribe();
    // Catch up after the app was in the background (Realtime may have dropped).
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        refetch();
        loadLatestSale();
      }
    });
    return () => {
      unsubInbox();
      supabase.removeChannel(sales);
      appState.remove();
    };
  }, [userId, refetch, loadLatestSale]);

  return !!userId && hasNewActivity(conversations, userId, latestSaleAt, seenAt);
}
