// Offline action synchronization queue.
//
// When a user likes/unlikes or saves/bookmarks listings while offline or on an
// unstable connection, actions are persisted to AsyncStorage and applied to the
// UI in 0ms. When connectivity is restored, the queue is automatically flushed
// and synced to Supabase sequentially.

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/lib/supabase';
import { deriveOffline, type ConnectivitySnapshot } from '@/lib/offlineState';
import { updateLikedCache, updateSavedCache, invalidateSavedCache } from '@/lib/engagementCache';

export const OFFLINE_SYNC_QUEUE_KEY = 'CERANIX_OFFLINE_SYNC_QUEUE';

export type LikeToggleAction = {
  id: string;
  type: 'like_toggle';
  userId: string;
  listingId: string;
  targetLiked: boolean;
  timestamp: number;
};

export type SaveToggleAction = {
  id: string;
  type: 'save_toggle';
  userId: string;
  listingId: string;
  targetSaved: boolean;
  timestamp: number;
};

export type SaveListItemAction = {
  id: string;
  type: 'save_list_item';
  userId: string;
  listId: string;
  listingId: string;
  op: 'add' | 'remove';
  timestamp: number;
};

export type OfflineAction = LikeToggleAction | SaveToggleAction | SaveListItemAction;

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type EnqueueOfflineActionInput = DistributiveOmit<OfflineAction, 'id' | 'timestamp'>;

/**
 * Coalesce a list of pending actions so that rapid toggles (e.g. like -> unlike -> like)
 * collapse into the single net latest desired action.
 */
export function coalesceActions(actions: OfflineAction[]): OfflineAction[] {
  const map = new Map<string, OfflineAction>();

  for (const action of actions) {
    let key = '';
    if (action.type === 'like_toggle') {
      key = `like:${action.userId}:${action.listingId}`;
    } else if (action.type === 'save_toggle') {
      key = `save_toggle:${action.userId}:${action.listingId}`;
    } else if (action.type === 'save_list_item') {
      key = `save_list_item:${action.userId}:${action.listId}:${action.listingId}`;
    }

    if (key) {
      // Latest action for this key overwrites earlier ones
      map.set(key, action);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Read the current pending offline actions queue from AsyncStorage.
 */
export async function getOfflineQueue(): Promise<OfflineAction[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[offlineSync] getOfflineQueue error:', err);
    return [];
  }
}

/**
 * Save the pending offline actions queue to AsyncStorage.
 */
export async function saveOfflineQueue(queue: OfflineAction[]): Promise<void> {
  try {
    if (queue.length === 0) {
      await AsyncStorage.removeItem(OFFLINE_SYNC_QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (err) {
    console.warn('[offlineSync] saveOfflineQueue error:', err);
  }
}

/**
 * Enqueue a new offline action with automatic coalescing and persistence.
 */
export async function enqueueOfflineAction(
  action: EnqueueOfflineActionInput,
): Promise<OfflineAction> {
  const fullAction: OfflineAction = {
    ...action,
    id: `${action.type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
  } as OfflineAction;

  const current = await getOfflineQueue();
  const next = coalesceActions([...current, fullAction]);
  await saveOfflineQueue(next);

  // Keep local engagement cache in sync immediately
  if (action.type === 'like_toggle') {
    updateLikedCache(action.userId, action.listingId, action.targetLiked);
  } else if (action.type === 'save_toggle') {
    updateSavedCache(action.userId, action.listingId, action.targetSaved);
  } else if (action.type === 'save_list_item') {
    invalidateSavedCache();
  }

  return fullAction;
}

/**
 * Check if an error was due to network disconnection or timeout.
 */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  let rawMsg = '';
  if (err instanceof Error) {
    rawMsg = err.message;
  } else if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as any).message === 'string') {
    rawMsg = (err as any).message;
  } else {
    rawMsg = String(err);
  }
  const msg = rawMsg.toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('connection') ||
    msg.includes('abort')
  );
}

/**
 * Process a single action against Supabase.
 * Returns true if successful or if the error is non-retryable (e.g. unique violation),
 * and false if the network failed and the action should remain queued.
 */
export async function executeOfflineAction(action: OfflineAction): Promise<{ ok: boolean; retry: boolean }> {
  try {
    if (action.type === 'like_toggle') {
      if (action.targetLiked) {
        const { error } = await supabase
          .from('listing_likes')
          .insert({ user_id: action.userId, listing_id: action.listingId });
        // Code 23505 = duplicate row, which is already liked so treat as success
        if (error && error.code !== '23505') {
          if (isNetworkError(error)) return { ok: false, retry: true };
          console.warn('[offlineSync] like insert error:', error.message);
          return { ok: false, retry: false };
        }
      } else {
        const { error } = await supabase
          .from('listing_likes')
          .delete()
          .eq('user_id', action.userId)
          .eq('listing_id', action.listingId);
        if (error) {
          if (isNetworkError(error)) return { ok: false, retry: true };
          console.warn('[offlineSync] like delete error:', error.message);
          return { ok: false, retry: false };
        }
      }
      return { ok: true, retry: false };
    }

    if (action.type === 'save_toggle') {
      if (action.targetSaved) {
        // Find or create default list
        let defaultListId: string | null = null;
        const { data: listData, error: listErr } = await supabase
          .from('save_lists')
          .select('id')
          .eq('user_id', action.userId)
          .eq('is_default', true)
          .maybeSingle();

        if (listErr && isNetworkError(listErr)) return { ok: false, retry: true };

        if (listData?.id) {
          defaultListId = listData.id;
        } else {
          const { error: ensureErr } = await supabase.rpc('ensure_save_lists', { p_user_id: action.userId });
          if (ensureErr && isNetworkError(ensureErr)) return { ok: false, retry: true };

          const { data: listAgain, error: againErr } = await supabase
            .from('save_lists')
            .select('id')
            .eq('user_id', action.userId)
            .eq('is_default', true)
            .maybeSingle();

          if (againErr && isNetworkError(againErr)) return { ok: false, retry: true };
          defaultListId = listAgain?.id ?? null;
        }

        if (!defaultListId) {
          return { ok: false, retry: true };
        }

        const { error: insertErr } = await supabase
          .from('save_list_items')
          .insert({ list_id: defaultListId, listing_id: action.listingId });
        if (insertErr && insertErr.code !== '23505') {
          if (isNetworkError(insertErr)) return { ok: false, retry: true };
          console.warn('[offlineSync] save insert error:', insertErr.message);
          return { ok: false, retry: false };
        }
      } else {
        // Remove from all lists for this user
        const { data: lists, error: findErr } = await supabase
          .from('save_list_items')
          .select('list_id, save_lists!inner(user_id)')
          .eq('listing_id', action.listingId)
          .eq('save_lists.user_id', action.userId);

        if (findErr && isNetworkError(findErr)) return { ok: false, retry: true };

        const listIds = ((lists ?? []) as { list_id: string }[]).map((r) => r.list_id);
        if (listIds.length > 0) {
          const { error: delErr } = await supabase
            .from('save_list_items')
            .delete()
            .in('list_id', listIds)
            .eq('listing_id', action.listingId);
          if (delErr && isNetworkError(delErr)) return { ok: false, retry: true };
        }
      }
      return { ok: true, retry: false };
    }

    if (action.type === 'save_list_item') {
      if (action.op === 'add') {
        const { error } = await supabase
          .from('save_list_items')
          .insert({ list_id: action.listId, listing_id: action.listingId });
        if (error && error.code !== '23505') {
          if (isNetworkError(error)) return { ok: false, retry: true };
          console.warn('[offlineSync] save_list_item add error:', error.message);
          return { ok: false, retry: false };
        }
      } else {
        const { error } = await supabase
          .from('save_list_items')
          .delete()
          .eq('list_id', action.listId)
          .eq('listing_id', action.listingId);
        if (error) {
          if (isNetworkError(error)) return { ok: false, retry: true };
          console.warn('[offlineSync] save_list_item remove error:', error.message);
          return { ok: false, retry: false };
        }
      }
      return { ok: true, retry: false };
    }

    return { ok: true, retry: false };
  } catch (err) {
    if (isNetworkError(err)) {
      return { ok: false, retry: true };
    }
    console.warn('[offlineSync] executeOfflineAction unexpected error:', err);
    return { ok: false, retry: false };
  }
}

let isFlushing = false;

/**
 * Flush and replay all queued offline actions to Supabase.
 */
export async function flushOfflineSyncQueue(): Promise<{ syncedCount: number; errors: number }> {
  if (isFlushing) return { syncedCount: 0, errors: 0 };
  isFlushing = true;

  let syncedCount = 0;
  let errors = 0;

  try {
    const initialQueue = await getOfflineQueue();
    if (initialQueue.length === 0) {
      isFlushing = false;
      return { syncedCount: 0, errors: 0 };
    }

    let currentUserId: string | null = null;
    let authChecked = false;
    try {
      if (supabase?.auth?.getSession) {
        authChecked = true;
        const { data: sessionData } = await supabase.auth.getSession();
        currentUserId = sessionData?.session?.user?.id ?? null;
      }
    } catch {
      currentUserId = null;
    }

    // Filter to only actions for the authenticated user, retain other users' actions
    const toProcess: OfflineAction[] = [];
    const otherUserActions: OfflineAction[] = [];
    for (const act of initialQueue) {
      if (!authChecked || (currentUserId && act.userId === currentUserId)) {
        toProcess.push(act);
      } else {
        otherUserActions.push(act);
      }
    }

    if (toProcess.length === 0) {
      isFlushing = false;
      return { syncedCount: 0, errors: 0 };
    }

    const coalesced = coalesceActions(toProcess);
    const retryActions: OfflineAction[] = [];

    for (const action of coalesced) {
      const result = await executeOfflineAction(action);
      if (result.ok) {
        syncedCount++;
      } else if (result.retry) {
        // Keep in queue for next connectivity window
        retryActions.push(action);
        errors++;
      } else {
        // Fatal non-retryable error (e.g. row deleted or auth denied), drop it
        errors++;
      }
    }

    // Re-read latest queue to preserve concurrent additions during flush
    const latestQueue = await getOfflineQueue();
    const initialIds = new Set(initialQueue.map((a) => a.id));
    const concurrentActions = latestQueue.filter((a) => !initialIds.has(a.id));

    await saveOfflineQueue([...otherUserActions, ...retryActions, ...concurrentActions]);
  } catch (err) {
    console.warn('[offlineSync] flushOfflineSyncQueue error:', err);
  } finally {
    isFlushing = false;
  }

  return { syncedCount, errors };
}

/**
 * Initialize offline sync listener.
 * Automatically flushes the queue whenever the device transitions to online.
 */
export function initOfflineSync(): () => void {
  const triggerFlush = async () => {
    try {
      if (supabase?.auth?.getSession) {
        const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        if (!data?.session?.user?.id) return;
      }
      await flushOfflineSyncQueue().catch(() => {});
    } catch {
      // ignore
    }
  };

  // Attempt immediate flush on startup if online
  NetInfo.fetch()
    .then((state) => {
      if (!deriveOffline(state as ConnectivitySnapshot)) {
        triggerFlush();
      }
    })
    .catch(() => {});

  const unsubscribe = NetInfo.addEventListener((state) => {
    if (!deriveOffline(state as ConnectivitySnapshot)) {
      triggerFlush();
    }
  });

  return unsubscribe;
}
