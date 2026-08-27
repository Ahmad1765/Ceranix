import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/currency';
import type { User, Listing } from '@/types';

export type MessageKind = 'text' | 'offer' | 'system';
export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'withdrawn';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  kind: MessageKind;
  metadata: {
    amount?: number;
    currency?: string;
    note?: string;
    order_status?: string;
    payment_status?: string;
    paid?: boolean;
  } | null;
  offer_status: OfferStatus | null;
  created_at: string;
  updated_at?: string;
  /** Client-only: an optimistic message still in flight. Never selected. */
  pending?: boolean;
  /** Client-only: the send failed and the row offers a retry. Never selected. */
  failed?: boolean;
}

export interface ConversationRow {
  id: string;
  listing_id: string | null;
  buyer_id: string;
  seller_id: string;
  last_message: string | null;
  last_sender_id?: string | null;
  updated_at: string;
  buyer_last_read_at?: string | null;
  seller_last_read_at?: string | null;
  listing?: Pick<Listing, 'id' | 'title' | 'price' | 'images' | 'thumbnails' | 'is_sold'> | null;
  buyer?: Pick<User, 'id' | 'username' | 'avatar_url' | 'full_name' | 'location' | 'rating' | 'total_sales'> | null;
  seller?: Pick<User, 'id' | 'username' | 'avatar_url' | 'full_name' | 'location' | 'rating' | 'total_sales'> | null;
}

const CONVERSATION_SELECT = `
  id, listing_id, buyer_id, seller_id, last_message, last_sender_id, updated_at,
  buyer_last_read_at, seller_last_read_at,
  listing:listings(id, title, price, images, thumbnails, is_sold),
  buyer:profiles!conversations_buyer_id_fkey(id, username, avatar_url, full_name, location, rating, total_sales),
  seller:profiles!conversations_seller_id_fkey(id, username, avatar_url, full_name, location, rating, total_sales)
`;

export async function listConversations(userId: string): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('[chat] listConversations', error.message);
    return [];
  }
  return (data ?? []) as unknown as ConversationRow[];
}

export async function getConversation(conversationId: string): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', conversationId)
    .maybeSingle();
  if (error) {
    console.warn('[chat] getConversation', error.message);
    return null;
  }
  return (data as unknown as ConversationRow) ?? null;
}

// Finds an existing conversation between (buyerId, sellerId, listingId)
// or creates a new one. Buyer initiates from a listing.
export async function getOrCreateConversation(args: {
  buyerId: string;
  sellerId: string;
  listingId: string;
}): Promise<ConversationRow | null> {
  const { buyerId, sellerId, listingId } = args;
  if (buyerId === sellerId) {
    console.warn('[chat] cannot message yourself');
    return null;
  }

  const { data: existing } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .maybeSingle();
  if (existing) return existing as unknown as ConversationRow;

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
    })
    .select(CONVERSATION_SELECT)
    .single();
  if (error) {
    // Unique violation means another tab/race created it — refetch.
    if (error.code === '23505') {
      const { data: again } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('listing_id', listingId)
        .eq('buyer_id', buyerId)
        .eq('seller_id', sellerId)
        .maybeSingle();
      return (again as unknown as ConversationRow) ?? null;
    }
    console.warn('[chat] getOrCreateConversation', error.message);
    return null;
  }
  return created as unknown as ConversationRow;
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, kind, metadata, offer_status, created_at, updated_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[chat] fetchMessages', error.message);
    return [];
  }
  return (data ?? []) as unknown as ChatMessage[];
}

export async function sendMessage(args: {
  conversationId: string;
  senderId: string;
  content: string;
}): Promise<ChatMessage | null> {
  const trimmed = args.content.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: args.conversationId,
      sender_id: args.senderId,
      content: trimmed,
      kind: 'text',
    })
    .select('id, conversation_id, sender_id, content, kind, metadata, offer_status, created_at, updated_at')
    .single();
  if (error) {
    console.warn('[chat] sendMessage', error.message);
    return null;
  }
  return data as unknown as ChatMessage;
}

export async function sendOffer(args: {
  conversationId: string;
  senderId: string;
  amount: number;
  note?: string;
}): Promise<ChatMessage | null> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) return null;
  const amountValue = Number(args.amount.toFixed(2));
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: args.conversationId,
      sender_id: args.senderId,
      content: args.note?.trim() || `Offer: ${formatPrice(amountValue)}`,
      kind: 'offer',
      metadata: { amount: amountValue, currency: 'PKR', note: args.note?.trim() || null },
      offer_status: 'pending',
    })
    .select('id, conversation_id, sender_id, content, kind, metadata, offer_status, created_at, updated_at')
    .single();
  if (error) {
    console.warn('[chat] sendOffer', error.message);
    return null;
  }
  return data as unknown as ChatMessage;
}

export async function updateOfferStatus(
  messageId: string,
  status: Exclude<OfferStatus, 'pending'>,
): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .update({ offer_status: status })
    .eq('id', messageId)
    .eq('kind', 'offer');
  if (error) {
    console.warn('[chat] updateOfferStatus', error.message);
    return false;
  }
  return true;
}

// ── Reactions ─────────────────────────────────────────────────────────────
// One emoji per person per message, enforced by a unique key in the database:
// picking a second emoji replaces the first, picking the same one again clears
// it.
//
// Clearing sets `emoji` to NULL rather than deleting the row. That isn't
// squeamishness about deletes — Realtime can't filter DELETE events at all, and
// strips their payload down to the primary key on an RLS-enabled table, so a
// delete could never tell a thread *which* message just lost its reaction. An
// update carries the whole row and respects the conversation filter. See
// supabase/migrations/20260731164411_message_reactions_clear_as_update.sql.

/** The quick-reaction row, in the order it's drawn. */
export const REACTION_EMOJI = ['💜', '🤝', '💯', '🔥', '👍'] as const;

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

/** A row as it arrives from Postgres, where a cleared reaction is a NULL emoji. */
type MessageReactionRow = Omit<MessageReaction, 'emoji'> & { emoji: string | null };

export async function fetchReactions(conversationId: string): Promise<MessageReaction[]> {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .eq('conversation_id', conversationId)
    // Skip the tombstones — a cleared reaction is a row that still exists.
    .not('emoji', 'is', null);
  if (error) {
    console.warn('[chat] fetchReactions', error.message);
    return [];
  }
  return (data ?? []) as MessageReaction[];
}

/** Sets, replaces, or (with `emoji: null`) clears this user's reaction. */
export async function setReaction(args: {
  messageId: string;
  userId: string;
  emoji: string | null;
}): Promise<boolean> {
  // conversation_id is deliberately absent: the BEFORE trigger fills it, and
  // Postgres checks NOT NULL after BEFORE triggers run.
  const { error } = await supabase.from('message_reactions').upsert(
    { message_id: args.messageId, user_id: args.userId, emoji: args.emoji },
    { onConflict: 'message_id,user_id' },
  );
  if (error) {
    console.warn('[chat] setReaction', error.message);
    return false;
  }
  return true;
}

export type ReactionEvent =
  | { type: 'set'; reaction: MessageReaction }
  | { type: 'cleared'; messageId: string; userId: string };

export function subscribeToReactions(
  conversationId: string,
  onEvent: (e: ReactionEvent) => void,
): () => void {
  const channelName = `reactions:${conversationId}:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        // INSERT is a first reaction, UPDATE is a swap or a clear — the unique
        // key means a person's second pick lands on their existing row. DELETE
        // is deliberately not handled: rows are never deleted, precisely
        // because Realtime can't filter or populate those events under RLS.
        event: '*',
        schema: 'public',
        table: 'message_reactions',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as MessageReactionRow | undefined;
        if (!row?.message_id || !row?.user_id) return;
        onEvent(
          row.emoji
            ? { type: 'set', reaction: { ...row, emoji: row.emoji } }
            : { type: 'cleared', messageId: row.message_id, userId: row.user_id },
        );
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export type MessageEvent =
  | { type: 'insert'; message: ChatMessage }
  | { type: 'update'; message: ChatMessage };

export function subscribeToMessages(
  conversationId: string,
  onEvent: (e: MessageEvent) => void,
): () => void {
  const channelName = `messages:${conversationId}:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onEvent({ type: 'insert', message: payload.new as ChatMessage }),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onEvent({ type: 'update', message: payload.new as ChatMessage }),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToInbox(
  userId: string,
  onChange: () => void,
): () => void {
  // Conversations are bumped via trigger when a message lands. Re-listing on
  // any conversation change involving the user keeps the inbox live.
  const channelName = `inbox:${userId}:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `buyer_id=eq.${userId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `seller_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function formatChatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Does this thread have something in it the viewer hasn't seen?
 *
 *  Two conditions, both required: someone else spoke last, and they spoke after
 *  the viewer last opened the thread. The second half is what was missing —
 *  without it the dot could only ever be cleared by replying. */
export function isConversationUnread(conv: ConversationRow, userId: string): boolean {
  if (!conv.last_sender_id || conv.last_sender_id === userId) return false;
  const readAt = conv.buyer_id === userId ? conv.buyer_last_read_at : conv.seller_last_read_at;
  if (!readAt) return true; // never opened
  return new Date(conv.updated_at).getTime() > new Date(readAt).getTime();
}

/** Stamps "I've seen this" for the calling participant. Fire-and-forget: a
 *  failed read receipt must never block opening a thread. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) console.warn('[chat] markConversationRead', error.message);
}

export function otherParticipant(
  conv: ConversationRow,
  userId: string,
): NonNullable<ConversationRow['buyer']> | null {
  if (!conv.buyer || !conv.seller) return null;
  if (conv.buyer_id === userId) return conv.seller;
  if (conv.seller_id === userId) return conv.buyer;
  return null;
}
