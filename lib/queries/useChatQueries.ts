// ─────────────────────────────────────────────────────────────────────────────
// CHAT & INBOX QUERY HOOKS
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Reactive Realtime + Query Invalidation
// In peer-to-peer messaging, incoming messages arrive via Supabase Realtime WebSockets.
// Rather than attempting complex manual merging of raw WebSocket packets across
// every screen, the Realtime listener simply calls `queryClient.invalidateQueries(qk.inbox(userId))`.
// This guarantees that the cached inbox state is always authoritative and consistent
// with database constraints.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { listConversations, type ConversationRow } from '@/lib/chat';
import { qk } from './keys';

/**
 * Fetch all active chat conversations for the current user.
 * Displays the latest message snippet, counterparty info, and listing details.
 */
export function useInboxQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.inbox(userId),
    enabled: !!userId,
    queryFn: (): Promise<ConversationRow[]> => listConversations(userId as string),
  });
}
