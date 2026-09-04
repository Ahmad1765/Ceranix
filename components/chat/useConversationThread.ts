// ─────────────────────────────────────────────────────────────────────────────
// USE CONVERSATION THREAD HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Realtime WebSocket Lifecycle & Optimistic State
//
// 1. WebSocket Subscriptions & Cleanups:
//    In React Native / React 19, multiple mounting or dynamic route changes
//    (e.g., navigating from one chat to another) can cause memory leaks and
//    duplicate message receipts if subscriptions aren't torn down cleanly.
//    Returning the `unsub` callback directly from `useEffect` ensures that
//    Supabase Realtime channels are cleanly closed whenever `conversationId` changes.
//
// 2. Optimistic Message Insertion:
//    When a user presses "Send", we immediately generate a local temporary message
//    (`id: temp-...`, `pending: true`) and append it to `messages`.
//    Once the database responds, we replace the temporary message with the real
//    database entity. If the network drops, `failed: true` triggers an in-place retry button.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { User as AuthUser } from '@supabase/supabase-js';
import { qk } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { capture } from '@/lib/analytics';
import { captureError } from '@/lib/sentry';
import { withTimeout } from '@/lib/async';
import { maybeSoftAskForPush } from '@/lib/notifications';
import { getOptimizedImageUrl } from '@/lib/images';
import { reportListing } from '@/lib/reports';
import {
  isSupportConversation,
  sendSupportBotReply,
  SUPPORT_BOT_NAME,
  SUPPORT_BOT_AVATAR,
} from '@/lib/support';
import {
  fetchMessages,
  fetchReactions,
  getConversation,
  markConversationRead,
  sendMessage,
  sendOffer,
  setReaction,
  subscribeToMessages,
  subscribeToReactions,
  updateOfferStatus,
  otherParticipant,
  type ChatMessage,
  type ConversationRow,
  type MessageReaction,
} from '@/lib/chat';
import { buildThreadRows, listingStatus, type ThreadRow } from '@/components/chat';

export function useConversationThread(
  conversationId: string,
  user: AuthUser | null,
  initialInput: string = '',
) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ThreadRow>>(null);
  const pinnedRef = useRef(true);

  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState(initialInput);

  useEffect(() => {
    if (initialInput) {
      setInput(initialInput);
    }
  }, [initialInput]);

  // ── Initial Parallel Fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      let loaded:
        | [Awaited<ReturnType<typeof getConversation>>, ChatMessage[], MessageReaction[]]
        | null = null;
      try {
        loaded = await Promise.all([
          withTimeout(getConversation(conversationId), 12_000, null),
          withTimeout(fetchMessages(conversationId), 12_000, []),
          withTimeout(fetchReactions(conversationId), 12_000, [] as MessageReaction[]),
        ]);
      } catch (e) {
        console.warn('[conversation] load failed', e);
      }

      if (cancelled) return;
      if (loaded !== null) {
        setConv(loaded[0]);
        setMessages(loaded[1]);
        setReactions(loaded[2]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // ── Push Notification Permission Soft-Ask ────────────────────────────────
  useEffect(() => {
    if (!user?.id || !conversationId) return;
    maybeSoftAskForPush(user.id).catch(() => {});
  }, [user?.id, conversationId]);

  // ── Realtime Messages Subscription ───────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const unsub = subscribeToMessages(conversationId, (event) => {
      setMessages((prev) => {
        if (event.type === 'insert') {
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        }
        return prev.map((m) => (m.id === event.message.id ? { ...m, ...event.message } : m));
      });
    });
    return unsub;
  }, [conversationId]);

  // ── Read Receipts Synchronization ────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    markConversationRead(conversationId).then(() => {
      queryClient.invalidateQueries({ queryKey: qk.inbox(user.id) });
    });
  }, [conversationId, user?.id, messages.length, queryClient]);

  // ── Realtime Reactions Subscription ──────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    return subscribeToReactions(conversationId, (event) => {
      setReactions((prev) => {
        if (event.type === 'cleared') {
          return prev.filter(
            (r) => !(r.message_id === event.messageId && r.user_id === event.userId),
          );
        }
        const { message_id, user_id, emoji } = event.reaction;
        const rest = prev.filter((r) => !(r.message_id === message_id && r.user_id === user_id));
        return [...rest, { message_id, user_id, emoji }];
      });
    });
  }, [conversationId]);

  // ── Scroll & Pin to Bottom Handlers ──────────────────────────────────────
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    pinnedRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 60;
  }, []);

  const followEnd = useCallback(() => {
    if (pinnedRef.current) listRef.current?.scrollToEnd({ animated: false });
  }, []);

  // ── Derived Participant & Listing State ──────────────────────────────────
  const isSupport = useMemo(() => isSupportConversation(conv), [conv]);
  const other = useMemo(() => (user && conv ? otherParticipant(conv, user.id) : null), [user, conv]);
  const isSeller = !!user && !!conv && conv.seller_id === user.id;
  const rows = useMemo(() => buildThreadRows(messages), [messages]);

  const convListingId = conv?.listing_id ?? null;
  const convListingPrice = conv?.listing?.price ?? null;
  const convListingSold = conv?.listing?.is_sold ?? false;
  const status = conv?.listing ? listingStatus(conv.listing) : null;
  const canOffer = !isSeller && !!conv?.listing_id && status === 'active';

  const senderName = isSupport
    ? SUPPORT_BOT_NAME
    : other?.full_name || other?.username || 'User';
  const otherAvatar = isSupport
    ? SUPPORT_BOT_AVATAR
    : other?.avatar_url
    ? getOptimizedImageUrl(other.avatar_url, { width: 120 })
    : null;
  const listingThumb = conv?.listing?.images?.[0]
    ? getOptimizedImageUrl(conv.listing.images[0], { width: 120 })
    : null;

  // ── Reaction Mapping ─────────────────────────────────────────────────────
  const byMessage = useMemo(() => {
    const map = new Map<string, string[]>();
    reactions.forEach((r) => {
      const list = map.get(r.message_id);
      if (list) list.push(r.emoji);
      else map.set(r.message_id, [r.emoji]);
    });
    return map;
  }, [reactions]);

  const myReactionOn = useCallback(
    (messageId: string) =>
      reactions.find((r) => r.message_id === messageId && r.user_id === user?.id)?.emoji ?? null,
    [reactions, user?.id],
  );

  const handleReact = useCallback(
    async (msgId: string, emoji: string) => {
      if (!user) return;
      const current = myReactionOn(msgId);
      const removing = current === emoji;

      setReactions((prev) => {
        const rest = prev.filter((r) => !(r.message_id === msgId && r.user_id === user.id));
        return removing ? rest : [...rest, { message_id: msgId, user_id: user.id, emoji }];
      });

      const ok = await setReaction({
        messageId: msgId,
        userId: user.id,
        emoji: removing ? null : emoji,
      });
      if (!ok) {
        setReactions(await fetchReactions(conversationId));
        toast.show("Couldn't save reaction", { variant: 'default', icon: 'alert-triangle' });
      }
    },
    [conversationId, myReactionOn, toast, user],
  );

  // ── Outgoing Messages Delivery ───────────────────────────────────────────
  const deliver = useCallback(
    async (text: string, tempId: string) => {
      if (!user || !conversationId) return;

      let saved: ChatMessage | null = null;
      let failure: unknown = null;
      try {
        saved = await sendMessage({ conversationId, senderId: user.id, content: text });
      } catch (e) {
        failure = e;
      }

      const delivered = saved;
      if (delivered) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === delivered.id)) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => (m.id === tempId ? delivered : m));
        });

        // Trigger intelligent support concierge automated response if talking to Support
        if (isSupport) {
          void sendSupportBotReply(conversationId, text);
        }
        return;
      }

      console.warn('[conversation] send failed', failure ?? 'insert returned no row');
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
    },
    [conversationId, isSupport, user],
  );

  const handleSend = useCallback(() => {
    if (!user || !conversationId) return;
    const text = input.trim();
    if (!text) return;
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: user.id,
      content: text,
      kind: 'text',
      metadata: null,
      offer_status: null,
      created_at: new Date().toISOString(),
      pending: true,
    };
    pinnedRef.current = true;
    setMessages((prev) => [...prev, temp]);
    setInput('');
    deliver(text, temp.id);
  }, [conversationId, deliver, input, user]);

  const handleRetry = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, pending: true, failed: false } : m)),
      );
      deliver(msg.content, msg.id);
    },
    [deliver],
  );

  // ── Offer Workflows ──────────────────────────────────────────────────────
  const handleSendOffer = useCallback(
    async (amount: number, note: string) => {
      if (!user || !conversationId) return false;
      try {
        const saved = await sendOffer({ conversationId, senderId: user.id, amount, note });
        if (saved) {
          pinnedRef.current = true;
          setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
          toast.show('Offer sent', { variant: 'success', icon: 'check' });
          capture('offer_made', { listing_id: convListingId, amount });
          return true;
        } else {
          Alert.alert('Could not send offer', 'Please try again.');
          return false;
        }
      } catch (e: any) {
        captureError(e, { fn: 'conversation.sendOffer' });
        toast.show("Couldn't send offer", { variant: 'default', icon: 'alert-triangle' });
        return false;
      }
    },
    [conversationId, user, toast, convListingId],
  );

  const handleOfferResponse = useCallback(
    async (msg: ChatMessage, offerStatus: 'accepted' | 'declined') => {
      const prev = msg.offer_status ?? 'pending';
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, offer_status: offerStatus } : x)));
      const ok = await updateOfferStatus(msg.id, offerStatus);
      if (!ok) {
        setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, offer_status: prev } : x)));
        Alert.alert('Could not update offer', 'Please try again.');
      } else {
        toast.show(offerStatus === 'accepted' ? 'Offer accepted' : 'Offer declined', {
          variant: offerStatus === 'accepted' ? 'success' : 'info',
        });
      }
    },
    [toast],
  );

  // ── Reporting ────────────────────────────────────────────────────────────
  const handleReport = useCallback(
    async (reason: string) => {
      if (!user || !convListingId) return;
      const ok = await reportListing({
        listingId: convListingId,
        reporterId: user.id,
        reason,
        reportedUserId: other?.id ?? null,
      });
      toast.show(ok ? 'Report sent — thank you' : "Couldn't send report", {
        variant: ok ? 'success' : 'default',
        icon: ok ? 'check' : 'alert-triangle',
      });
    },
    [convListingId, other?.id, toast, user],
  );

  return {
    conv,
    messages,
    reactions,
    loading,
    input,
    setInput,
    listRef,
    pinnedRef,
    onScroll,
    followEnd,
    other,
    isSeller,
    rows,
    convListingId,
    convListingPrice,
    convListingSold,
    status,
    canOffer,
    senderName,
    otherAvatar,
    listingThumb,
    byMessage,
    myReactionOn,
    handleReact,
    handleSend,
    handleRetry,
    handleSendOffer,
    handleOfferResponse,
    handleReport,
  };
}
