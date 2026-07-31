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
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  fetchMessages,
  getConversation,
  sendMessage,
  sendOffer,
  subscribeToMessages,
  updateOfferStatus,
  otherParticipant,
  type ChatMessage,
  type ConversationRow,
} from '@/lib/chat';
import { getOptimizedImageUrl } from '@/lib/images';
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
  SafetyNote,
  ThreadHeader,
  type ChatAction,
  type ThreadRow,
} from '@/components/chat';

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
    try {
      await onSubmit(parsed, note);
    } catch (e) {
      // The parent already surfaces toast/Alert on failure. Swallow here so
      // the rejection doesn't bubble as an unhandled promise.
      console.warn('[OfferSheet] submit failed', e);
    } finally {
      setSending(false);
    }
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
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  const listRef = useRef<FlatList<ThreadRow>>(null);

  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
      try {
        const [c, m] = await Promise.all([
          withTimeout(getConversation(conversationId), 12_000, null),
          withTimeout(fetchMessages(conversationId), 12_000, []),
        ]);
        if (cancelled) return;
        setConv(c);
        setMessages(m);
      } catch (e) {
        console.warn('[conversation] load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
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

  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [messages.length]);

  const other = useMemo(() => (user && conv ? otherParticipant(conv, user.id) : null), [user, conv]);
  const isSeller = !!user && !!conv && conv.seller_id === user.id;
  const rows = useMemo(() => buildThreadRows(messages), [messages]);

  // One send path for both the first attempt and any retry, so a retried
  // message goes through exactly the same dedupe as the original.
  const deliver = useCallback(
    async (text: string, tempId: string) => {
      if (!user || !conversationId) return;
      try {
        const saved = await sendMessage({ conversationId, senderId: user.id, content: text });
        if (saved) {
          setMessages((prev) => {
            // Realtime may have already inserted the saved message — dedupe.
            if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m.id !== tempId);
            return prev.map((m) => (m.id === tempId ? saved : m));
          });
          return;
        }
        throw new Error('insert returned no row');
      } catch (e) {
        // The message stays in the thread carrying a "Tap to retry" stamp
        // instead of vanishing behind an alert — nothing typed is ever lost.
        console.warn('[conversation] send failed', e);
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
        );
      }
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
          setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
          setOfferVisible(false);
          toast.show('Offer sent', { variant: 'success', icon: 'check' });
          capture('offer_made', { listing_id: conv?.listing_id ?? null, amount });
        } else {
          // Sheet stays open so the user can retry without retyping.
          Alert.alert('Could not send offer', 'Please try again.');
        }
      } catch (e: any) {
        captureError(e, { fn: 'conversation.sendOffer' });
        toast.show("Couldn't send offer", { variant: 'default', icon: 'alert-triangle' });
      }
    },
    [conversationId, user, toast, conv?.listing_id],
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
      if (!user || !conv?.listing_id) return;
      const ok = await reportListing({
        listingId: conv.listing_id,
        reporterId: user.id,
        reason,
        reportedUserId: other?.id ?? null,
      });
      toast.show(ok ? 'Report sent — thank you' : "Couldn't send report", {
        variant: ok ? 'success' : 'default',
        icon: ok ? 'check' : 'alert-triangle',
      });
    },
    [conv?.listing_id, other?.id, toast, user],
  );

  const openListing = useCallback(() => {
    if (conv?.listing_id) router.push(`/product/${conv.listing_id}` as any);
  }, [conv?.listing_id]);

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
          listingId={conv?.listing_id ?? null}
          listingPrice={conv?.listing?.price ?? null}
          listingSold={conv?.listing?.is_sold ?? false}
          onAccept={() => handleOfferResponse(item.msg, 'accepted')}
          onDecline={() => handleOfferResponse(item.msg, 'declined')}
          onPay={(amount) =>
            conv?.listing_id && router.push(`/payment/${conv.listing_id}?offer=${amount}` as any)
          }
          onRetry={() => handleRetry(item.msg)}
        />
      );
    },
    [
      user,
      isSeller,
      senderName,
      conv?.listing_id,
      conv?.listing?.price,
      conv?.listing?.is_sold,
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
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
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
            // The inset only needs paying for while the keyboard isn't already
            // covering it.
            paddingBottom: keyboardUp ? 0 : insets.bottom,
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
