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
import { colors, radii, shadow, type as typography } from '@/lib/theme';
import { formatPrice } from '@/lib/currency';
import { Button, EmptyState, SafeContainer, ThumbButton } from '@/components/ui';
import { explainCoverage } from '@/components/SafetyBanner';
import { reportListing, REPORT_REASONS } from '@/lib/reports';
import { confirm } from '@/lib/confirm';
import { blockUser, unblockUser, isUserBlocked, BLOCK_REASONS } from '@/lib/blocks';
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
  const [focusedInput, setFocusedInput] = useState<'amount' | 'note' | null>(null);

  useEffect(() => {
    if (!visible) {
      setAmount('');
      setNote('');
      setSending(false);
      setFocusedInput(null);
    }
  }, [visible]);

  const suggestions = useMemo(() => {
    if (!listingPrice) return [];
    return [
      { label: '10% off', pct: 10, amount: Math.round(listingPrice * 0.9) },
      { label: '15% off', pct: 15, amount: Math.round(listingPrice * 0.85) },
      { label: '20% off', pct: 20, amount: Math.round(listingPrice * 0.8) },
    ].filter((v) => v.amount > 0);
  }, [listingPrice]);

  const parsed = parseInt(amount, 10);
  const valid = Number.isFinite(parsed) && parsed > 0;

  const diff = listingPrice && valid ? listingPrice - parsed : 0;
  const savePct = listingPrice && valid ? Math.round((diff / listingPrice) * 100) : 0;

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
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
        }}
      >
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 22,
              paddingTop: 14,
              paddingBottom: Platform.OS === 'ios' ? 38 : 28,
              ...shadow.lg,
            }}
          >
            {/* Handle bar */}
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(15,15,15,0.15)',
                alignSelf: 'center',
                marginBottom: 16,
              }}
            />

            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <View>
                <Text style={{ fontSize: 19, fontFamily: typography.family.sansBold, color: colors.ink }}>
                  Make an Offer
                </Text>
                <Text style={{ fontSize: 12.5, color: colors.muteSoft, marginTop: 2 }}>
                  Direct binding offer to the seller
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="button"
                accessibilityLabel="Close offer sheet"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="x" size={18} color={colors.ink} />
              </Pressable>
            </View>

            {/* Asking Price Banner */}
            {listingPrice ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: colors.panel,
                  borderRadius: radii.md,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  marginBottom: 14,
                  borderWidth: 1,
                  borderColor: colors.hairline,
                }}
              >
                <Text style={{ fontSize: 13, color: colors.mute, fontFamily: typography.family.sansSemibold }}>
                  Original asking price
                </Text>
                <Text style={{ fontSize: 14, fontFamily: typography.family.sansBold, color: colors.ink }}>
                  {formatPrice(listingPrice)}
                </Text>
              </View>
            ) : null}

            {/* Preset discount chips */}
            {suggestions.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {suggestions.map((s) => {
                  const isSelected = amount === String(s.amount);
                  return (
                    <Pressable
                      key={s.amount}
                      onPress={() => setAmount(String(s.amount))}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 6,
                        borderRadius: radii.md,
                        backgroundColor: isSelected ? colors.purpleSoft : colors.white,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderColor: isSelected ? colors.purple : colors.hairline,
                        ...shadow.sm,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: isSelected ? colors.purple : 'rgba(108,71,255,0.08)',
                          paddingHorizontal: 6,
                          paddingVertical: 1.5,
                          borderRadius: radii.pill,
                          marginBottom: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontFamily: typography.family.sansBold,
                            color: isSelected ? colors.white : colors.purple,
                            textTransform: 'uppercase',
                          }}
                        >
                          {s.label}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontFamily: typography.family.sansBold,
                          color: isSelected ? colors.purple : colors.ink,
                        }}
                      >
                        {formatPrice(s.amount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Custom Amount Input */}
            <View style={{ marginBottom: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.panel,
                  borderRadius: radii.md,
                  borderWidth: 1.5,
                  borderColor: focusedInput === 'amount' ? colors.purple : colors.hairline,
                  paddingHorizontal: 14,
                }}
              >
                <Feather
                  name="tag"
                  size={16}
                  color={focusedInput === 'amount' ? colors.purple : colors.muteSoft}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  onFocus={() => setFocusedInput('amount')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Enter custom offer amount"
                  keyboardType="numeric"
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontFamily: typography.family.sansBold,
                    color: colors.ink,
                    paddingVertical: 12,
                  }}
                  placeholderTextColor={colors.muteSoft}
                />
                {valid && (
                  <Pressable onPress={() => setAmount('')} hitSlop={6}>
                    <Feather name="x-circle" size={16} color={colors.muteSoft} />
                  </Pressable>
                )}
              </View>

              {/* Dynamic Savings Helper Pill */}
              {valid && listingPrice ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    marginTop: 6,
                    paddingHorizontal: 4,
                  }}
                >
                  {diff > 0 ? (
                    <>
                      <Feather name="check" size={12} color="#059669" />
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: typography.family.sansSemibold,
                          color: '#059669',
                        }}
                      >
                        You save {formatPrice(diff)} ({savePct}% below asking)
                      </Text>
                    </>
                  ) : diff === 0 ? (
                    <Text style={{ fontSize: 12, color: colors.muteSoft }}>
                      Matches full asking price
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: colors.purple }}>
                      {formatPrice(Math.abs(diff))} above asking price
                    </Text>
                  )}
                </View>
              ) : null}
            </View>

            {/* Note Input */}
            <View
              style={{
                backgroundColor: colors.panel,
                borderRadius: radii.md,
                borderWidth: 1.5,
                borderColor: focusedInput === 'note' ? colors.purple : colors.hairline,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginBottom: 16,
              }}
            >
              <TextInput
                value={note}
                onChangeText={setNote}
                onFocus={() => setFocusedInput('note')}
                onBlur={() => setFocusedInput(null)}
                placeholder="Add a message for the seller (optional)"
                multiline
                style={{
                  fontSize: 13.5,
                  fontFamily: typography.family.sans,
                  color: colors.ink,
                  minHeight: 52,
                  textAlignVertical: 'top',
                }}
                placeholderTextColor={colors.muteSoft}
              />
            </View>

            {/* Submit Button */}
            <Button
              label={
                sending
                  ? 'Sending offer…'
                  : valid
                  ? `Send Offer · ${formatPrice(parsed)}`
                  : 'Enter offer amount'
              }
              variant="primary"
              size="lg"
              full
              disabled={!valid || sending}
              loading={sending}
              onPress={handleSubmit}
            />
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
  const [blockSheetOpen, setBlockSheetOpen] = useState(false);

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

  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!user?.id || !other?.id) return;
    isUserBlocked(user.id, other.id).then(setIsBlocked);
  }, [user?.id, other?.id]);

  const handleToggleBlock = useCallback(async () => {
    if (!user?.id || !other?.id) return;
    const targetName = other.username ? `@${other.username}` : (other.full_name || 'this user');
    if (isBlocked) {
      const ok = await confirm({
        title: `Unblock ${targetName}?`,
        message: 'They will be able to message you and interact with your listings again.',
        confirmLabel: 'Unblock',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
      const success = await unblockUser({ blockerId: user.id, blockedId: other.id });
      if (success) {
        setIsBlocked(false);
        toast.show(`Unblocked ${targetName}`);
      }
    } else {
      setBlockSheetOpen(true);
    }
  }, [user?.id, other?.id, other?.username, other?.full_name, isBlocked, toast]);

  const handleBlockWithReason = useCallback(
    async (reasonLabel: string) => {
      if (!user?.id || !other?.id) return;
      setBlockSheetOpen(false);
      const targetName = other.username ? `@${other.username}` : (other.full_name || 'this user');

      const success = await blockUser({
        blockerId: user.id,
        blockedId: other.id,
        blockedUsername: other.username ?? undefined,
        reason: reasonLabel,
      });
      if (success) {
        setIsBlocked(true);
        toast.show(`Blocked ${targetName}`, {
          variant: 'default',
          icon: 'slash',
        });
      } else {
        toast.show('Failed to block user. Please try again.');
      }
    },
    [user?.id, other?.id, other?.username, other?.full_name, toast],
  );


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
    ...(other?.id
      ? [
          {
            id: 'block',
            label: isBlocked
              ? `Unblock ${other.username ? `@${other.username}` : 'user'}`
              : `Block ${other.username ? `@${other.username}` : 'user'}`,
            hint: isBlocked ? 'Allow messages from this user' : 'Prevent messages and interaction',
            icon: 'slash' as const,
            tone: isBlocked ? ('default' as const) : ('destructive' as const),
            onPress: handleToggleBlock,
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
        {isBlocked ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.panel,
            }}
          >
            <Text
              style={{
                fontFamily: typography.family.sans,
                fontSize: 13,
                color: colors.muteSoft,
                flex: 1,
                marginRight: 12,
              }}
            >
              You have blocked this user.
            </Text>
            <Pressable
              onPress={handleToggleBlock}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: radii.pill,
                backgroundColor: colors.ink,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansSemibold,
                  fontSize: 12,
                  color: colors.white,
                }}
              >
                Unblock
              </Text>
            </Pressable>
          </View>
        ) : (
          <Composer
            value={input}
            onChangeText={setInput}
            onSend={handleSend}
            onPlus={() => setPlusOpen(true)}
          />
        )}
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

      <ChatActionSheet
        visible={blockSheetOpen}
        title="WHY ARE YOU BLOCKING THIS USER?"
        actions={BLOCK_REASONS.map((r) => ({
          id: r.id,
          label: r.label,
          hint: r.hint,
          icon: r.icon as any,
          tone: 'destructive' as const,
          onPress: () => handleBlockWithReason(r.label),
        }))}
        onClose={() => setBlockSheetOpen(false)}
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
