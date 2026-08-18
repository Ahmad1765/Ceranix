import { capture } from '@/lib/analytics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { formatPrice } from '@/lib/currency';
import { Button, EmptyState, SafeContainer, ThumbButton } from '@/components/ui';
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
  ListingThumb,
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

/** Breathing room under composer when keyboard is up */
const DOCK_GAP_KEYBOARD = 6;

/** One shared empty array so an unreacted message keeps a stable prop identity */
const EMPTY_REACTIONS: string[] = [];

// Is the software keyboard up?
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
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
    try {
      await onSubmit(parsed, note);
    } catch (e) {
      console.warn('[OfferSheet] submit failed', e);
    }
    setSending(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'flex-end',
        }}
      >
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 34,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                Make an offer
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="button"
                accessibilityLabel="Close offer sheet"
              >
                <Feather name="x" size={20} color={colors.mute} />
              </Pressable>
            </View>

            {listingPrice ? (
              <Text style={{ fontSize: 13, color: colors.mute, marginBottom: 12 }}>
                Asking price: {formatPrice(listingPrice)}
              </Text>
            ) : null}

            {suggestions.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setAmount(String(s))}
                    style={{
                      flex: 1,
                      paddingVertical: 9,
                      borderRadius: radii.md,
                      backgroundColor: colors.panel,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: amount === String(s) ? colors.purple : colors.hairline,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: amount === String(s) ? colors.purple : colors.ink,
                      }}
                    >
                      {formatPrice(s)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Enter offer amount"
              keyboardType="numeric"
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.ink,
                backgroundColor: colors.panel,
                borderRadius: radii.md,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
              }}
              placeholderTextColor={colors.muteSoft}
            />

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a message for the seller (optional)"
              multiline
              style={{
                fontSize: 14,
                color: colors.ink,
                backgroundColor: colors.panel,
                borderRadius: radii.md,
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
        return;
      }

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
      <SafeContainer edges={['top', 'left', 'right']} backgroundColor={colors.white} style={{ flex: 1 }}>
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
      </SafeContainer>
    );
  }

  if (!conv) {
    return (
      <SafeContainer edges={['top', 'left', 'right']} backgroundColor={colors.white} style={{ flex: 1 }}>
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
      </SafeContainer>
    );
  }

  const otherAvatar = other?.avatar_url
    ? getOptimizedImageUrl(other.avatar_url, { width: 120 })
    : null;
  const listingThumb = conv.listing?.images?.[0]
    ? getOptimizedImageUrl(conv.listing.images[0], { width: 120 })
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
    <SafeContainer
      mode="keyboard-avoiding"
      noScroll
      edges={['top', 'left', 'right']}
      backgroundColor={colors.white}
      style={{ flex: 1 }}
    >
      {/* Sticky Context Header (Z: 30) */}
      <View
        style={{
          zIndex: 30,
          backgroundColor: colors.white,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        }}
      >
        <ThreadHeader
          name={senderName}
          subtitle={other?.username ? `@${other.username}` : null}
          avatar={otherAvatar}
          onBack={() => safeBack()}
          onPressIdentity={other?.id ? () => router.push(`/user/${other.id}` as any) : undefined}
          onOverflow={() => setOverflowOpen(true)}
        />

        {/* Sticky Product Context Bar */}
        {conv.listing_id && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open listing ${conv.listing?.title ?? 'Listing'}`}
            onPress={openListing}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.hairline,
              backgroundColor: pressed ? '#F8F8FA' : colors.white,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <ListingThumb uri={listingThumb} width={44} height={44} status={status} radius={radii.sm} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: typography.family.sansBold,
                    fontSize: 13.5,
                    color: colors.ink,
                  }}
                >
                  {conv.listing?.title ?? 'Listing removed'}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: typography.family.sans,
                    fontSize: 12,
                    color: colors.mute,
                    marginTop: 2,
                  }}
                >
                  {status === 'removed'
                    ? 'No longer available'
                    : conv.listing?.price != null
                      ? formatPrice(conv.listing.price)
                      : '—'}
                </Text>
              </View>
            </View>

            {!isSeller && status === 'active' && convListingId ? (
              <View style={{ width: 94 }}>
                <ThumbButton
                  label="Buy Now"
                  variant="primary"
                  size="sm"
                  onPress={() => router.push(`/payment/${convListingId}` as any)}
                  accessibilityLabel="Buy now"
                />
              </View>
            ) : (
              <Feather name="chevron-right" size={18} color={colors.muteSoft} />
            )}
          </Pressable>
        )}
      </View>

      {/* Message Thread Surface */}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
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

      {/* Native iMessage-Style Composer Dock */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.hairline,
          backgroundColor: colors.white,
          paddingBottom: keyboardUp ? DOCK_GAP_KEYBOARD : Math.max(insets.bottom, 12),
        }}
      >
        <Composer
          value={input}
          onChangeText={setInput}
          onSend={handleSend}
          onPlus={() => setPlusOpen(true)}
        />
      </View>

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
    </SafeContainer>
  );
}
