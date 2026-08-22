import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { captureError } from '@/lib/sentry';

const BLOCKED_USERS_KEY = (userId: string) => `carrinex_blocked_users_${userId}`;

const blockMutationLocks = new Map<string, Promise<unknown>>();

async function runWithBlockLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = blockMutationLocks.get(key) || Promise.resolve();
  let release: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  blockMutationLocks.set(key, current);
  try {
    await prev;
    return await fn();
  } finally {
    release!();
    if (blockMutationLocks.get(key) === current) {
      blockMutationLocks.delete(key);
    }
  }
}

export const BLOCK_REASONS = [
  {
    id: 'harassment',
    label: 'Harassment or offensive behavior',
    hint: 'Hostility, abusive messages, or unwanted contact',
    icon: 'alert-circle' as const,
  },
  {
    id: 'scam',
    label: 'Suspicious activity or scam',
    hint: 'Attempted off-app payment, phishing, or fraud',
    icon: 'shield-off' as const,
  },
  {
    id: 'spam',
    label: 'Spam or unsolicited advertising',
    hint: 'Repeated promotional messages or unsolicited offers',
    icon: 'mail' as const,
  },
  {
    id: 'inappropriate',
    label: 'Inappropriate content',
    hint: 'Violates community guidelines or standards',
    icon: 'slash' as const,
  },
  {
    id: 'no_longer_interested',
    label: 'No longer wish to communicate',
    hint: 'Prefer not to receive contact from this user',
    icon: 'user-x' as const,
  },
  {
    id: 'other',
    label: 'Other reason',
    hint: 'Other issue or concern',
    icon: 'more-horizontal' as const,
  },
];

export async function getBlockedUserIds(blockerId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(BLOCKED_USERS_KEY(blockerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[blocks] failed to read blocked users', e);
    return [];
  }
}

export async function isUserBlocked(blockerId: string, targetUserId: string): Promise<boolean> {
  const list = await getBlockedUserIds(blockerId);
  return list.includes(targetUserId);
}

export async function blockUser(opts: {
  blockerId: string;
  blockedId: string;
  blockedUsername?: string;
  reason?: string;
}): Promise<boolean> {
  const { blockerId, blockedId, blockedUsername, reason = 'Blocked from conversation' } = opts;
  return runWithBlockLock(blockerId, async () => {
    try {
      // 1. Update local storage (serialized)
      const current = await getBlockedUserIds(blockerId);
      if (!current.includes(blockedId)) {
        const updated = [...current, blockedId];
        await AsyncStorage.setItem(BLOCKED_USERS_KEY(blockerId), JSON.stringify(updated));
      }

      // 2. Track in reports table for moderation log
      try {
        const details = blockedUsername ? `${reason} (@${blockedUsername})` : reason;
        const { error } = await supabase.from('reports').insert({
          reporter_id: blockerId,
          reported_user_id: blockedId,
          reason: 'blocked_user',
          details,
        });
        if (error) {
          console.warn('[blocks] report insert error', error.message);
          captureError(error, { fn: 'blockUser:reportInsert' });
        }
      } catch (insertErr: unknown) {
        captureError(insertErr, { fn: 'blockUser:reportInsert' });
      }

      return true;
    } catch (e: unknown) {
      captureError(e, { fn: 'blockUser' });
      return false;
    }
  });
}

export async function unblockUser(opts: {
  blockerId: string;
  blockedId: string;
}): Promise<boolean> {
  const { blockerId, blockedId } = opts;
  return runWithBlockLock(blockerId, async () => {
    try {
      const current = await getBlockedUserIds(blockerId);
      const updated = current.filter((id) => id !== blockedId);
      await AsyncStorage.setItem(BLOCKED_USERS_KEY(blockerId), JSON.stringify(updated));
      return true;
    } catch (e: unknown) {
      captureError(e, { fn: 'unblockUser' });
      return false;
    }
  });
}
