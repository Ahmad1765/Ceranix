// Pure decision behind the Activity tab dot (useActivityDot.ts). Kept free of
// React Native so vitest can load it (activityDot.test.ts).

import { isConversationUnread, type ConversationRow } from '@/lib/chat';

/**
 * New activity = any unread conversation (the inbox's own rule) or a sale newer
 * than the last time Activity was opened.
 */
export function hasNewActivity(
  conversations: ConversationRow[] | undefined,
  userId: string,
  latestSaleAt: string | null,
  seenAt: string | null,
): boolean {
  if ((conversations ?? []).some((c) => isConversationUnread(c, userId))) return true;
  if (!latestSaleAt || !seenAt) return false;
  return new Date(latestSaleAt).getTime() > new Date(seenAt).getTime();
}
