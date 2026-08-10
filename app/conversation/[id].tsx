import { capture } from '@/lib/analytics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '@/lib/auth';
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
import { getOptimizedImageUrl } from '@/lib/images';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { captureError } from '@/lib/sentry';
import { colors, radii, type as typography } from '@/lib/theme';
import { formatPrice, CURRENCY_SYMBOL } from '@/lib/currency';
import { Button, EmptyState } from '@/components/ui';
import { explainCoverage } from '@/components/SafetyBanner';
import { reportListing, REPORT_REASONS } from '@/lib/reports';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { withTimeout } from '@/lib/async';
import { maybeSoftAskForPush } from '@/lib/notifications';
import {
  buildThreadRows,
  ChatActionSheet,
  Composer,
  DateDivider,
  ListingBar,
  listingStatus,
  MessageRow,
  ReactionPicker,
  SafetyNote,
  ThreadHeader,
  type Anchor,
  type ChatAction,
  type MessageAction,
  type ThreadRow,
} from '@/components/chat';

/** Breathing room under the composer at rest. The dock is white on a white
 *  page, so there's no edge to see — the gap only reads as deliberate once
 *  it's clearly bigger than the row's own 8px padding. Phones with a home
 *  indicator already pay more than this via the safe-area inset. */
const DOCK_GAP = 32;

/** With the keyboard up the screen is short and the keyboard's own top edge
 *  supplies the boundary, so a hair of separation is enough. */
const DOCK_GAP_KEYBOARD = 8;

/** One shared empty array so an unreacted message keeps a stable prop identity
 *  and never re-renders its row for nothing. */
const EMPTY_REACTIONS: string[] = [];

// Is the software keyboard up? The bottom dock pads itself by the safe-area
// inset at rest, but once the keyboard covers that area the padding has to
// collapse or the composer floats above the keyboard with a gap.
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // iOS gets the `will` events so the dock moves with the keyboard rather
    // than snapping after it lands. Android only emits `did`.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

function OfferSheet({
  visible,
  listingPrice,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  listingPrice: number | null;
  onClose: () => void;
  onSubmit: (amount: number, note: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAmount('');
      setNote('');
      setSending(false);
    }
  }, [visible]);

  const suggestions = useMemo(() => {
    if (!listingPrice) return [];
    return [
      Math.round(listingPrice * 0.7),
      Math.round(listingPrice * 0.8),
      Math.round(listingPrice * 0.9),
    ].filter((v) => v > 0);
  }, [listingPrice]);

  const parsed = parseInt(amount, 10);
  const valid = Number.isFinite(parsed) && parsed > 0;

  const handleSubmit = async () => {
    if (!valid) return;
    setSending(true);
    // No `finally` — see lib/errors.ts. Equivalent: the catch neither returns
    // nor re-throws, so control always reaches the call below.
    try {
      await onSubmit(parsed, note);
    } catch (e) {
      // The parent already surfaces toast/Alert on failure. Swallow here so
      // the rejection doesn't bubble as an unhandled promise.
      console.warn('[OfferSheet] submit failed', e);
    }
    setSending(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: radii['4xl'],
              borderTopRightRadius: radii['4xl'],
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 28,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 44,
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.hairline,
                marginBottom: 16,
              }}
            />
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 20,
                color: colors.ink,
                letterSpacing: -0.3,
              }}
            >
              Make an offer
            </Text>
            {listingPrice && (
              <Text
                style={{
                  fontFamily: typography.family.sans,
                  fontSize: 13,
                  color: colors.mute,
                  marginTop: 4,
                }}
              >
                Listed at{' '}
                <Text style={{ fontFamily: typography.family.sansBold, color: colors.ink }}>
                  {formatPrice(listingPrice)}
                </Text>
              </Text>
            )}

            <View
              style={{
                marginTop: 18,
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: colors.primarySoft,
                borderRadius: radii.xl,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 22,
                  color: colors.primary,
                  marginRight: 8,
                }}
              >
                {CURRENCY_SYMBOL}
              </Text>
              <TextInput
                placeholder="0"
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 28,
                  color: colors.ink,
                  flex: 1,
                  padding: 0,
                }}
                placeholderTextColor={colors.muteSoft}
                autoFocus
              />
            </View>

            {suggestions.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {suggestions.map((v) => {
                  const selected = parsed === v;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => setAmount(String(v))}
                      style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: radii.pill,
                        backgroundColor: selected ? colors.ink : colors.panel,
                        alignItems: 'center',
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: typography.family.sansBold,
                          fontSize: 13,
                          color: selected ? colors.white : colors.ink,
                        }}
                      >
                        {formatPrice(v)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 11,
                color: colors.mute,
                marginTop: 18,
                marginBottom: 6,
                letterSpacing: 0.6,
              }}
            >
              NOTE (OPTIONAL)
            </Text>
            <TextInput
              placeholder="Add a quick note to the seller"
              value={note}
              onChangeText={setNote}
              multiline
              style={{
                fontFamily: typography.family.sans,
                fontSize: 14,
                color: colors.ink,
                backgroundColor: colors.panel,
                borderRadius: radii.lg,
                paddingHorizontal: 14,
                paddingVertical: 12,
                minHeight: 60,
                textAlignVertical: 'top',
              }}
              placeholderTextColor={colors.muteSoft}
            />

            <View style={{ marginTop: 18 }}>
              <Button
                label={sending ? 'Sending…' : 'Send offer'}
                variant="primary"
                size="lg"
                full
                disabled={!valid || sending}
                loading={sending}
                onPress={handleSubmit}
              />
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === 'string' ? id : '';
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  const listRef = useRef<FlatList<ThreadRow>>(null);

  const [conv, setConv] = useState<ConversationRow | null>(null);
  // Narrowed once and used by every memoized callback below instead of
  // `conv?.listing_id` / `conv?.listing?.price` inline.
  //
  // React Compiler will not compile a component whose manual memoization it
  // can't preserve, and a body that reads `conv.listing_id` under a dep list
  // saying `conv?.listing_id` made it infer the whole `conv` object as the true
  // dependency ("Inferred less specific property than source") — four separate
  // times, which bailed out this entire screen. Depending on primitives makes
  // the inferred and declared dependencies agree, and is also strictly more
  // precise: these callbacks no longer churn when an unrelated field of `conv`
  // changes (e.g. last_message on every incoming realtime event).
  const convListingId = conv?.listing_id ?? null;
  const convListingPrice = conv?.listing?.price ?? null;
  const convListingSold = conv?.listing?.is_sold ?? false;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [pressed, setPressed] = useState<{ msg: ChatMessage; anchor: Anchor } | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [offerVisible, setOfferVisible] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // The `finally` this replaces ran `if (!cancelled) setLoading(false)` on
      // every path, including the early `return` — which is exactly what the
      // `if (cancelled) return` plus the trailing call below do. Rewritten
      // because React Compiler cannot lower a finalizer and bails out of the
      // whole screen over one; see lib/errors.ts.
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

  // Contextual soft-ask. Opening a conversation is the one moment where "let us
  // notify you" is self-evidently useful, so this is where the OS dialog is
  // spent — never on cold launch, and at most once ever (the helper keeps its
  // own AsyncStorage flag and bails unless the status is still undetermined).
  useEffect(() => {
    if (!user?.id || !conversationId) return;
    maybeSoftAskForPush(user.id).catch(() => {});
  }, [user?.id, conversationId]);

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

  // Mark read on open, and again whenever a message arrives while the thread is
  // on screen — otherwise reading a live conversation would leave the dot
  // behind the moment they sent something after you opened it. Keyed on the
  // message count so it re-stamps per message rather than per render.
  //
  // The inbox is invalidated rather than patched: it's a different screen with
  // its own query, and it re-reads on focus anyway.
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    markConversationRead(conversationId).then(() => {
      queryClient.invalidateQueries({ queryKey: qk.inbox(user.id) });
    });
  }, [conversationId, user?.id, messages.length, queryClient]);

  useEffect(() => {
    if (!conversationId) return;
    return subscribeToReactions(conversationId, (event) => {
      setReactions((prev) => {
        // Both branches drop the sender's existing row first — one reaction per
        // person per message, so an emoji swap is a replace, not an append.
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

  // Auto-follow the bottom, but only while the thread is already parked there.
  //
  // This used to be an unconditional `onContentSizeChange -> scrollToEnd`, plus
  // a scroll-to-end on every message count change. In a virtualized list the
  // content size changes *while you scroll* — rows mount and get measured — so
  // every drag upward immediately snapped back down. The thread was
  // unscrollable past the first screen.
  //
  // `pinnedRef` holds the last observed distance-to-bottom, which is always
  // read *before* the growth that triggers the follow, so an arriving message
  // still scrolls into view when you were at the bottom, and doesn't when you
  // were reading history.
  const pinnedRef = useRef(true);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    pinnedRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 60;
  }, []);
  const followEnd = useCallback(() => {
    if (pinnedRef.current) listRef.current?.scrollToEnd({ animated: false });
  }, []);

  const other = useMemo(() => (user && conv ? otherParticipant(conv, user.id) : null), [user, conv]);
  const isSeller = !!user && !!conv && conv.seller_id === user.id;
  const rows = useMemo(() => buildThreadRows(messages), [messages]);

  // Indexed once per reaction change rather than filtered inside every row —
  // and the array identity per message stays stable, so MessageRow's memo holds.
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

  // Optimistic, then persisted: a reaction is a one-tap gesture and waiting a
  // round-trip to see it makes the whole thread feel remote. On failure the
  // realtime feed and the next fetch both correct it.
  const handleReact = useCallback(
    async (emoji: string) => {
      const msg = pressed?.msg;
      if (!user || !msg) return;
      const current = myReactionOn(msg.id);
      const removing = current === emoji;
      setPressed(null);

      setReactions((prev) => {
        const rest = prev.filter((r) => !(r.message_id === msg.id && r.user_id === user.id));
        return removing ? rest : [...rest, { message_id: msg.id, user_id: user.id, emoji }];
      });

      // A clear is a NULL emoji, not a delete — see subscribeToReactions.
      const ok = await setReaction({
        messageId: msg.id,
        userId: user.id,
        emoji: removing ? null : emoji,
      });
      if (!ok) {
        setReactions(await fetchReactions(conversationId));
        toast.show("Couldn't save reaction", { variant: 'default', icon: 'alert-triangle' });
      }
    },
    [conversationId, myReactionOn, pressed?.msg, toast, user],
  );

  const handleCopy = useCallback(async () => {
    const msg = pressed?.msg;
    if (!msg) return;
    const text =
      msg.kind === 'offer' && msg.metadata?.amount
        ? formatPrice(msg.metadata.amount)
        : msg.content;
    await Clipboard.setStringAsync(text);
    toast.show('Copied', { variant: 'success', icon: 'check' });
  }, [pressed?.msg, toast]);

  // One send path for both the first attempt and any retry, so a retried
  // message goes through exactly the same dedupe as the original.
  const deliver = useCallback(
    async (text: string, tempId: string) => {
      if (!user || !conversationId) return;

      // The old shape used `throw new Error('insert returned no row')` inside
      // the try to funnel "no row" into its own catch. React Compiler can't
      // lower a ThrowStatement inside a try/catch and bailed out of this whole
      // screen over it. Branching on the result instead is equivalent — both
      // paths always led to the same failure handling.
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
          // Realtime may have already inserted the saved message — dedupe.
          if (prev.some((m) => m.id === delivered.id)) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => (m.id === tempId ? delivered : m));
        });
        return;
      }

      // Threw, or the insert returned no row — same outcome for the sender. The
      // message stays in the thread carrying a "Tap to retry" stamp instead of
      // vanishing behind an alert, so nothing typed is ever lost.
      console.warn('[conversation] send failed', failure ?? 'insert returned no row');
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
    },
    [conversationId, user],
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
    // Sending is an explicit "I'm done reading history" — follow your own
    // message down even if you'd scrolled up before typing it.
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

  const handleSendOffer = useCallback(
    async (amount: number, note: string) => {
      if (!user || !conversationId) return;
      try {
        const saved = await sendOffer({ conversationId, senderId: user.id, amount, note });
        if (saved) {
          pinnedRef.current = true;
          setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
          setOfferVisible(false);
          toast.show('Offer sent', { variant: 'success', icon: 'check' });
          capture('offer_made', { listing_id: convListingId, amount });
        } else {
          // Sheet stays open so the user can retry without retyping.
          Alert.alert('Could not send offer', 'Please try again.');
        }
      } catch (e: any) {
        captureError(e, { fn: 'conversation.sendOffer' });
        toast.show("Couldn't send offer", { variant: 'default', icon: 'alert-triangle' });
      }
    },
    [conversationId, user, toast, convListingId],
  );

  const handleOfferResponse = useCallback(
    async (msg: ChatMessage, status: 'accepted' | 'declined') => {
      const prev = msg.offer_status ?? 'pending';
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, offer_status: status } : x)));
      const ok = await updateOfferStatus(msg.id, status);
      if (!ok) {
        setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, offer_status: prev } : x)));
        Alert.alert('Could not update offer', 'Please try again.');
      } else {
        toast.show(status === 'accepted' ? 'Offer accepted' : 'Offer declined', {
          variant: status === 'accepted' ? 'success' : 'info',
        });
      }
    },
    [toast],
  );

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

  const openListing = useCallback(() => {
    if (convListingId) router.push(`/product/${convListingId}` as any);
  }, [convListingId]);

  const senderName = other?.full_name || other?.username || 'User';

  const renderRow = useCallback(
    ({ item }: { item: ThreadRow }) => {
      if (item.type === 'date') return <DateDivider iso={item.iso} />;
      return (
        <MessageRow
          msg={item.msg}
          mine={!!user && item.msg.sender_id === user.id}
          isSeller={isSeller}
          grouped={item.grouped}
          lastOfGroup={item.lastOfGroup}
          senderName={senderName}
          listingId={convListingId}
          listingPrice={convListingPrice}
          listingSold={convListingSold}
          reactions={byMessage.get(item.msg.id) ?? EMPTY_REACTIONS}
          onAccept={() => handleOfferResponse(item.msg, 'accepted')}
          onDecline={() => handleOfferResponse(item.msg, 'declined')}
          onPay={(amount) =>
            convListingId && router.push(`/payment/${convListingId}?offer=${amount}` as any)
          }
          onRetry={() => handleRetry(item.msg)}
          onLongPress={(anchor) => setPressed({ msg: item.msg, anchor })}
        />
      );
    },
    [
      user,
      isSeller,
      senderName,
      byMessage,
      convListingId,
      convListingPrice,
      convListingSold,
      handleOfferResponse,
      handleRetry,
    ],
  );

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="arrow-left" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!conv) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="arrow-left" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <EmptyState
          icon="alert-circle"
          title="Conversation unavailable"
          description="This thread may have been removed."
        />
      </SafeAreaView>
    );
  }

  const otherAvatar = other?.avatar_url
    ? getOptimizedImageUrl(other.avatar_url, { width: 120 })
    : null;
  const listingThumb = conv.listing?.images?.[0]
    ? getOptimizedImageUrl(conv.listing.images[0], { width: 200 })
    : null;
  const status = listingStatus(conv.listing);
  const canOffer = !isSeller && !!conv.listing_id && status === 'active';

  const plusActions: ChatAction[] = [
    ...(canOffer
      ? [
          {
            id: 'offer',
            label: 'Make an offer',
            hint: conv.listing?.price ? `Listed at ${formatPrice(conv.listing.price)}` : undefined,
            icon: 'tag' as const,
            tone: 'primary' as const,
            onPress: () => setOfferVisible(true),
          },
        ]
      : []),
    ...(conv.listing_id
      ? [
          {
            id: 'listing',
            label: 'View listing',
            icon: 'external-link' as const,
            onPress: openListing,
          },
        ]
      : []),
    {
      id: 'coverage',
      label: "How you're covered",
      hint: 'Buyer Protection, payments, and support',
      icon: 'shield' as const,
      onPress: explainCoverage,
    },
  ];

  const messageActions: MessageAction[] = [
    { id: 'copy', label: 'Copy', icon: 'copy', onPress: handleCopy },
  ];

  const overflowActions: ChatAction[] = [
    ...(other?.id
      ? [
          {
            id: 'profile',
            label: 'View profile',
            icon: 'user' as const,
            onPress: () => router.push(`/user/${other.id}` as any),
          },
        ]
      : []),
    ...(conv.listing_id
      ? [
          {
            id: 'listing',
            label: 'View listing',
            icon: 'external-link' as const,
            onPress: openListing,
          },
        ]
      : []),
    {
      id: 'coverage',
      label: "How you're covered",
      icon: 'shield' as const,
      onPress: explainCoverage,
    },
    ...(conv.listing_id
      ? [
          {
            id: 'report',
            label: 'Report this conversation',
            icon: 'flag' as const,
            onPress: () => setReportOpen(true),
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ThreadHeader
        name={senderName}
        subtitle={other?.username ? `@${other.username}` : null}
        avatar={otherAvatar}
        onBack={() => safeBack()}
        onPressIdentity={other?.id ? () => router.push(`/user/${other.id}` as any) : undefined}
        onOverflow={() => setOverflowOpen(true)}
      />

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        // flexGrow + flex-end pins a short thread to the bottom of the screen,
        // where a conversation belongs, instead of stranding two bubbles under
        // the header. Once the content overflows, this is a no-op.
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 12 }}
        onContentSizeChange={followEnd}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<SafetyNote onPress={explainCoverage} />}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 32, paddingVertical: 16 }}>
            <Text
              style={{
                fontFamily: typography.family.sans,
                fontSize: 13,
                color: colors.muteSoft,
                textAlign: 'center',
              }}
            >
              No messages yet. Ask a question, or send an offer.
            </Text>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
            backgroundColor: colors.white,
            // The composer never sits flush against the bottom edge — it reads
            // as cut off, and on a gesture-bar phone the send button lands in
            // the swipe-up zone. The safe-area inset already buys that gap
            // where there is one; DOCK_GAP is the floor everywhere else (web,
            // older Android, and whenever the keyboard has eaten the inset).
            paddingBottom: keyboardUp ? DOCK_GAP_KEYBOARD : Math.max(insets.bottom, DOCK_GAP),
          }}
        >
          {conv.listing_id && (
            <ListingBar
              title={conv.listing?.title ?? 'Listing removed'}
              price={conv.listing?.price ?? null}
              thumb={listingThumb}
              status={status}
              onPress={openListing}
            />
          )}
          <Composer
            value={input}
            onChangeText={setInput}
            onSend={handleSend}
            onPlus={() => setPlusOpen(true)}
          />
        </View>
      </KeyboardAvoidingView>

      <ReactionPicker
        anchor={pressed?.anchor ?? null}
        selected={pressed ? myReactionOn(pressed.msg.id) : null}
        actions={messageActions}
        onSelect={handleReact}
        onClose={() => setPressed(null)}
      />

      <ChatActionSheet
        visible={plusOpen}
        actions={plusActions}
        onClose={() => setPlusOpen(false)}
      />

      <ChatActionSheet
        visible={overflowOpen}
        actions={overflowActions}
        onClose={() => setOverflowOpen(false)}
      />

      <ChatActionSheet
        visible={reportOpen}
        title="WHY ARE YOU REPORTING THIS?"
        actions={REPORT_REASONS.map((r) => ({
          id: r.id,
          label: r.label,
          icon: 'flag' as const,
          onPress: () => handleReport(r.id),
        }))}
        onClose={() => setReportOpen(false)}
      />

      <OfferSheet
        visible={offerVisible}
        listingPrice={conv.listing?.price ?? null}
        onClose={() => setOfferVisible(false)}
        onSubmit={handleSendOffer}
      />
    </SafeAreaView>
  );
}
