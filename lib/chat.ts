import { supabase } from '@/lib/supabase';
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
  metadata: { amount?: number; currency?: string; note?: string } | null;
  offer_status: OfferStatus | null;
  created_at: string;
  updated_at?: string;
}

export interface ConversationRow {
  id: string;
  listing_id: string | null;
  buyer_id: string;
  seller_id: string;
  last_message: string | null;
  last_sender_id?: string | null;
  updated_at: string;
  listing?: Pick<Listing, 'id' | 'title' | 'price' | 'images' | 'is_sold'> | null;
  buyer?: Pick<User, 'id' | 'username' | 'avatar_url' | 'full_name'> | null;
  seller?: Pick<User, 'id' | 'username' | 'avatar_url' | 'full_name'> | null;
}

const CONVERSATION_SELECT = `
  id, listing_id, buyer_id, seller_id, last_message, last_sender_id, updated_at,
  listing:listings(id, title, price, images, is_sold),
  buyer:profiles!conversations_buyer_id_fkey(id, username, avatar_url, full_name),
  seller:profiles!conversations_seller_id_fkey(id, username, avatar_url, full_name)
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
  const amountInDollars = Number(args.amount.toFixed(2));
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: args.conversationId,
      sender_id: args.senderId,
      content: args.note?.trim() || `Offer: $${amountInDollars.toFixed(2)}`,
      kind: 'offer',
      metadata: { amount: amountInDollars, currency: 'USD', note: args.note?.trim() || null },
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

export type MessageEvent =
  | { type: 'insert'; message: ChatMessage }
  | { type: 'update'; message: ChatMessage };

export function subscribeToMessages(
  conversationId: string,
  onEvent: (e: MessageEvent) => void,
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
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
  const channel = supabase
    .channel(`inbox:${userId}`)
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

export function otherParticipant(
  conv: ConversationRow,
  userId: string,
): NonNullable<ConversationRow['buyer']> | null {
  if (!conv.buyer || !conv.seller) return null;
  if (conv.buyer_id === userId) return conv.seller;
  if (conv.seller_id === userId) return conv.buyer;
  return null;
}
