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
import { getOptimizedImageUrl, cardImageUrl } from '@/lib/images';
import { reportListing } from '@/lib/reports';
import {
  isSupportConversation,
  sendSupportBotReply,
  generateSupportResponse,
  SUPPORT_BOT_USER_ID,
  SUPPORT_BOT_NAME,
  SUPPORT_BOT_AVATAR,
} from '@/lib/support';
import {
  fetchMessages,
  fetchReactions,
  getConversation,
  markConversationRead,
  sendMessage,
  deleteMessage,
  sendOffer,
  acceptChatOffer,
  counterOffer,
  setReaction,
  subscribeToMessages,
  subscribeToReactions,
  updateOfferStatus,
  otherParticipant,
  isImageMessage,
  getMessageImageUrl,
  type ChatMessage,
  type ConversationRow,
  type MessageReaction,
} from '@/lib/chat';
import { deleteListingImages } from '@/lib/upload';
import { buildThreadRows, listingStatus, type ThreadRow } from '@/components/chat';

const FETCH_MESSAGES_TIMEOUT = Symbol('FETCH_MESSAGES_TIMEOUT');

async function cleanupMessageImage(msg: ChatMessage) {
  if (isImageMessage(msg)) {
    const imgUrl = getMessageImageUrl(msg);
    if (imgUrl && imgUrl.includes('/listing-images/')) {
      try {
        await deleteListingImages([imgUrl]);
      } catch (err) {
        console.warn('[chat] deleteListingImages cleanup error', err);
      }
    }
  }
}

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

  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const canceledTempIdsRef = useRef<Set<string>>(new Set());
  const activeDeliveriesRef = useRef<Map<string, Promise<ChatMessage | null>>>(new Map());

  useEffect(() => {
    setInput(initialInput);
  }, [conversationId, initialInput]);

  // ── Initial Parallel Fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      let loaded:
        | [
            Awaited<ReturnType<typeof getConversation>>,
            ChatMessage[] | typeof FETCH_MESSAGES_TIMEOUT,
            MessageReaction[],
          ]
        | null = null;
      try {
        loaded = await Promise.all([
          withTimeout(getConversation(conversationId), 12_000, null),
          withTimeout<ChatMessage[] | typeof FETCH_MESSAGES_TIMEOUT>(
            fetchMessages(conversationId),
            12_000,
            FETCH_MESSAGES_TIMEOUT,
          ),
          withTimeout(fetchReactions(conversationId), 12_000, [] as MessageReaction[]),
        ]);
      } catch (e) {
        console.warn('[conversation] load failed', e);
      }

      if (cancelled) return;
      if (loaded !== null) {
        setConv(loaded[0]);
        const msgsResult = loaded[1];
        const isTimeout = msgsResult === FETCH_MESSAGES_TIMEOUT;
        let initialMsgs: ChatMessage[] = isTimeout ? [] : msgsResult;
        if (!isTimeout && isSupportConversation(loaded[0]) && initialMsgs.length === 0) {
          initialMsgs = [
            {
              id: 'support-welcome-initial',
              conversation_id: conversationId,
              sender_id: SUPPORT_BOT_USER_ID,
              content:
                `👋 Welcome to Ceranix Support!\n\n` +
                `How can we assist you today? Feel free to ask about your orders, Buyer Protection, payments, or selling on Ceranix.`,
              kind: 'text',
              metadata: null,
              offer_status: null,
              created_at: (loaded[0] as any)?.created_at || loaded[0]?.updated_at || new Date().toISOString(),
              updated_at: loaded[0]?.updated_at || new Date().toISOString(),
            },
          ];
        }
        setMessages(initialMsgs);
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
        if (event.type === 'delete') {
          return prev.filter((m) => m.id !== event.messageId);
        }
        return prev.map((m) => (m.id === event.message.id ? { ...m, ...event.message } : m));
      });
    });
    return unsub;
  }, [conversationId]);

  // ── Read Receipts Synchronization ────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    markConversationRead(conversationId, user.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: qk.inbox(user.id) });
      })
      .catch((error) => {
        console.warn('[chat] markConversationRead error', error);
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
  const listingThumb = conv?.listing
    ? getOptimizedImageUrl(cardImageUrl(conv.listing, 0), { width: 120 })
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

      if (canceledTempIdsRef.current.has(tempId)) {
        canceledTempIdsRef.current.delete(tempId);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      const deliverPromise = (async (): Promise<ChatMessage | null> => {
        let saved: ChatMessage | null = null;
        let failure: unknown = null;
        try {
          saved = await sendMessage({ conversationId, senderId: user.id, content: text });
        } catch (e) {
          failure = e;
        }

        if (canceledTempIdsRef.current.has(tempId)) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId && (!saved || m.id !== saved.id)));
          return saved;
        }

        const delivered = saved;
        if (delivered) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === delivered.id)) return prev.filter((m) => m.id !== tempId);
            return prev.map((m) => (m.id === tempId ? delivered : m));
          });

          // Trigger intelligent support concierge automated response if talking to Support
          if (isSupport) {
            let botReply: ChatMessage | null = null;
            try {
              botReply = await sendSupportBotReply(conversationId, text);
            } catch (err) {
              console.warn('[conversation] support bot reply error', err);
            }

            if (!botReply) {
              try {
                botReply = await sendMessage({
                  conversationId,
                  senderId: SUPPORT_BOT_USER_ID,
                  content: generateSupportResponse(text),
                });
              } catch (persistErr) {
                console.warn('[conversation] support bot fallback persist failed', persistErr);
              }
            }

            if (botReply) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === botReply!.id)) return prev;
                return [...prev, botReply!];
              });
            } else {
              toast.show('Support is temporarily unavailable. Please try again.', {
                variant: 'default',
                icon: 'alert-triangle',
              });
            }
          }
          return delivered;
        }

        console.warn('[conversation] send failed', failure ?? 'insert returned no row');
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
        );
        return null;
      })();

      activeDeliveriesRef.current.set(tempId, deliverPromise);
      try {
        await deliverPromise;
      } finally {
        activeDeliveriesRef.current.delete(tempId);
      }
    },
    [conversationId, isSupport, toast, user],
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

  const addOptimisticMessage = useCallback((msg: ChatMessage) => {
    pinnedRef.current = true;
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSendImage = useCallback(
    async (imageUrl: string, tempId?: string) => {
      if (!user || !conversationId) return;
      const tId = tempId || `temp-${Date.now()}`;

      if (canceledTempIdsRef.current.has(tId)) {
        canceledTempIdsRef.current.delete(tId);
        if (imageUrl && imageUrl.includes('/listing-images/')) {
          deleteListingImages([imageUrl]).catch((err) =>
            console.warn('[chat] deleteListingImages cleanup error', err),
          );
        }
        setMessages((prev) => prev.filter((m) => m.id !== tId));
        return;
      }

      if (!tempId) {
        const temp: ChatMessage = {
          id: tId,
          conversation_id: conversationId,
          sender_id: user.id,
          content: imageUrl,
          kind: 'text',
          metadata: { image_url: imageUrl },
          offer_status: null,
          created_at: new Date().toISOString(),
          pending: true,
        };
        pinnedRef.current = true;
        setMessages((prev) => [...prev, temp]);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tId
              ? { ...m, content: imageUrl, metadata: { ...m.metadata, image_url: imageUrl } }
              : m,
          ),
        );
      }

      const sendPromise = (async (): Promise<ChatMessage | null> => {
        let saved: ChatMessage | null = null;
        let failure: unknown = null;
        try {
          saved = await sendMessage({
            conversationId,
            senderId: user.id,
            content: imageUrl,
            metadata: { image_url: imageUrl },
          });
        } catch (e) {
          failure = e;
        }

        if (canceledTempIdsRef.current.has(tId)) {
          setMessages((prev) => prev.filter((m) => m.id !== tId && (!saved || m.id !== saved.id)));
          return saved;
        }

        if (saved) {
          const delivered = saved;
          setMessages((prev) => {
            if (prev.some((m) => m.id === delivered.id)) return prev.filter((m) => m.id !== tId);
            return prev.map((m) => (m.id === tId ? delivered : m));
          });
          return delivered;
        }

        console.warn('[conversation] send image failed', failure ?? 'insert returned no row');
        setMessages((prev) =>
          prev.map((m) => (m.id === tId ? { ...m, pending: false, failed: true } : m)),
        );
        return null;
      })();

      activeDeliveriesRef.current.set(tId, sendPromise);
      try {
        await sendPromise;
      } finally {
        activeDeliveriesRef.current.delete(tId);
      }
    },
    [conversationId, user],
  );

  const handleRetry = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, pending: true, failed: false } : m)),
      );
      if (isImageMessage(msg)) {
        handleSendImage(getMessageImageUrl(msg) || msg.content, msg.id);
      } else {
        deliver(msg.content, msg.id);
      }
    },
    [deliver, handleSendImage],
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

      try {
        if (offerStatus === 'accepted') {
          await acceptChatOffer(msg.id);
          if (convListingId) {
            queryClient.invalidateQueries({ queryKey: qk.listing(convListingId) });
          }
          if (user?.id) {
            queryClient.invalidateQueries({ queryKey: qk.inbox(user.id) });
          }
          toast.show('Offer accepted! Order created.', {
            variant: 'success',
            icon: 'check',
          });
        } else {
          const ok = await updateOfferStatus(msg.id, 'declined');
          if (!ok) throw new Error('Could not decline offer');
          toast.show('Offer declined', {
            variant: 'info',
            icon: 'x',
          });
        }
      } catch (err: any) {
        setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, offer_status: prev } : x)));
        Alert.alert('Could not update offer', err.message || 'Please try again.');
      }
    },
    [convListingId, queryClient, toast, user?.id],
  );

  const handleCounterOffer = useCallback(
    async (parentMsg: ChatMessage, amount: number, note?: string) => {
      if (!user || !conversationId) return false;
      try {
        const saved = await counterOffer({
          conversationId,
          senderId: user.id,
          parentOfferId: parentMsg.id,
          amount,
          note,
        });
        if (saved) {
          pinnedRef.current = true;
          setMessages((prev) => [
            ...prev.map((m) => (m.id === parentMsg.id ? { ...m, offer_status: 'countered' as const } : m)),
            saved,
          ]);
          toast.show('Counter-offer sent', { variant: 'success', icon: 'check' });
          return true;
        }
        return false;
      } catch (e: any) {
        captureError(e, { fn: 'conversation.counterOffer' });
        toast.show("Couldn't send counter-offer", { variant: 'default', icon: 'alert-triangle' });
        return false;
      }
    },
    [conversationId, toast, user],
  );

  // ── Message Deletion ───────────────────────────────────────────────────
  const handleDeleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!user || !conversationId) return false;

      const targetIndex = messagesRef.current.findIndex((m) => m.id === messageId);
      const targetMsg = targetIndex !== -1 ? messagesRef.current[targetIndex] : null;

      if (!targetMsg && !activeDeliveriesRef.current.has(messageId)) {
        return false;
      }

      // 1. Failed messages: preserve immediate local removal, but clean up referenced uploaded photo
      if (targetMsg?.failed) {
        await cleanupMessageImage(targetMsg);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return true;
      }

      // 2. Pending messages with active delivery:
      // Track canceled temporary ID, defer deletion until delivery finishes,
      // and do not report as successfully deleted while delivery is active.
      const activeDelivery = activeDeliveriesRef.current.get(messageId);
      if (activeDelivery) {
        canceledTempIdsRef.current.add(messageId);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        const saved = await activeDelivery;
        canceledTempIdsRef.current.delete(messageId);
        if (saved) {
          try {
            const ok = await deleteMessage({
              conversationId,
              messageId: saved.id,
              userId: user.id,
            });
            await cleanupMessageImage(saved);
            return ok;
          } catch (err) {
            console.warn('[chat] deleteMessage for deferred temp message failed', err);
            return false;
          }
        }
        return true;
      }

      // 3. Temporary or pending messages not currently active in delivery pipeline
      if (messageId.startsWith('temp-') || targetMsg?.pending) {
        canceledTempIdsRef.current.add(messageId);
        if (targetMsg) {
          await cleanupMessageImage(targetMsg);
        }
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return true;
      }

      // 4. Persisted messages: optimistically remove, delete on server, rollback on failure
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      const rollback = () => {
        setMessages((current) => {
          if (!targetMsg || current.some((m) => m.id === targetMsg.id)) return current;
          const next = [...current];
          const insertIdx = Math.min(Math.max(0, targetIndex), next.length);
          next.splice(insertIdx, 0, targetMsg);
          return next;
        });
      };

      try {
        const ok = await deleteMessage({
          conversationId,
          messageId,
          userId: user.id,
        });

        if (!ok) {
          rollback();
          return false;
        }

        if (targetMsg) {
          await cleanupMessageImage(targetMsg);
        }

        return true;
      } catch (err) {
        console.warn('[chat] handleDeleteMessage error', err);
        rollback();
        return false;
      }
    },
    [conversationId, user],
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
    handleSendImage,
    addOptimisticMessage,
    handleRetry,
    handleDeleteMessage,
    handleSendOffer,
    handleCounterOffer,
    handleOfferResponse,
    handleReport,
  };
}
