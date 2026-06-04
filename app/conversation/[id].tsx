import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
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
import { colors, radii } from '@/lib/theme';
import { Button, EmptyState } from '@/components/ui';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { withTimeout } from '@/lib/async';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({
  msg,
  mine,
  isSeller,
  listingId,
  listingSold,
  onAccept,
  onDecline,
}: {
  msg: ChatMessage;
  mine: boolean;
  isSeller: boolean;
  listingId: string | null;
  listingSold: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (msg.kind === 'offer') {
    const amount = msg.metadata?.amount ?? 0;
    const status = msg.offer_status ?? 'pending';
    const canRespond = !mine && isSeller && status === 'pending';
    // Buyer sees a Pay CTA on their own accepted offer until the listing is
    // marked sold. Seller sees a passive "Awaiting payment" status.
    const canPay = mine && !isSeller && status === 'accepted' && !!listingId && !listingSold;
    const awaitingPayment = !mine && isSeller && status === 'accepted' && !listingSold;

    return (
      <View style={{ paddingHorizontal: 14, marginBottom: 12, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View
          style={{
            maxWidth: '85%',
            backgroundColor: mine ? colors.purple : colors.purpleSoft,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: mine ? 'rgba(255,255,255,0.22)' : 'white',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 6,
              }}
            >
              <Feather name="tag" size={11} color={mine ? 'white' : colors.purple} />
            </View>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 1,
                color: mine ? 'rgba(255,255,255,0.9)' : colors.purple,
                textTransform: 'uppercase',
              }}
            >
              {mine ? 'You offered' : 'Offer'}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '900',
              color: mine ? 'white' : colors.ink,
              letterSpacing: -0.8,
            }}
          >
            ${amount}
          </Text>
          {msg.metadata?.note ? (
            <Text
              style={{
                fontSize: 13,
                color: mine ? 'rgba(255,255,255,0.9)' : colors.ink,
                marginTop: 6,
              }}
            >
              {msg.metadata.note}
            </Text>
          ) : null}

          {status !== 'pending' && (
            <View
              style={{
                marginTop: 10,
                alignSelf: 'flex-start',
                paddingHorizontal: 9,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor:
                  status === 'accepted'
                    ? 'rgba(108,71,255,0.18)'
                    : status === 'declined'
                      ? 'rgba(15,15,15,0.18)'
                      : 'rgba(255,255,255,0.18)',
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: '800',
                  letterSpacing: 0.6,
                  color: mine
                    ? 'white'
                    : status === 'accepted'
                      ? colors.primary
                      : status === 'declined'
                        ? colors.ink
                        : colors.mute,
                  textTransform: 'uppercase',
                }}
              >
                {status}
              </Text>
            </View>
          )}

          {canRespond && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={onDecline}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 38,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'white',
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={onAccept}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 38,
                  borderRadius: 999,
                  backgroundColor: colors.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.85 : 1,
                  flexDirection: 'row',
                  gap: 5,
                })}
              >
                <Feather name="check" size={14} color="white" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: 'white' }}>Accept</Text>
              </Pressable>
            </View>
          )}

          {canPay && (
            <Pressable
              onPress={() =>
                router.push(`/payment/${listingId}?offer=${amount}` as any)
              }
              style={({ pressed }) => ({
                marginTop: 12,
                height: 40,
                borderRadius: 999,
                backgroundColor: colors.purple,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Feather name="credit-card" size={14} color="white" />
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: 'white' }}>
                Pay ${amount}
              </Text>
            </Pressable>
          )}

          {awaitingPayment && (
            <View
              style={{
                marginTop: 10,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: 'rgba(15,15,15,0.05)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Feather name="clock" size={11} color={colors.muteSoft} />
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.muteSoft }}>
                Awaiting buyer payment
              </Text>
            </View>
          )}

          {status === 'accepted' && listingSold && (
            <View
              style={{
                marginTop: 10,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: 'rgba(108,71,255,0.12)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Feather name="check-circle" size={11} color={colors.purple} />
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.purple }}>
                Paid · sold
              </Text>
            </View>
          )}

          <Text
            style={{
              fontSize: 10,
              color: mine ? 'rgba(255,255,255,0.6)' : colors.muteSoft,
              marginTop: 8,
            }}
          >
            {formatTime(msg.created_at)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        marginBottom: 6,
        paddingHorizontal: 14,
        justifyContent: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <View
        style={{
          maxWidth: '78%',
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 18,
          borderTopRightRadius: mine ? 6 : 18,
          borderTopLeftRadius: mine ? 18 : 6,
          backgroundColor: mine ? colors.purple : colors.panel,
        }}
      >
        <Text style={{ fontSize: 15, lineHeight: 20, color: mine ? 'white' : colors.ink }}>
          {msg.content}
        </Text>
        <Text
          style={{
            fontSize: 10,
            marginTop: 3,
            color: mine ? 'rgba(255,255,255,0.6)' : colors.muteSoft,
            textAlign: mine ? 'right' : 'left',
          }}
        >
          {formatTime(msg.created_at)}
        </Text>
      </View>
    </View>
  );
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
    await onSubmit(parsed, note);
    setSending(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: 'white',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
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
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 }}>
              Make an offer
            </Text>
            {listingPrice && (
              <Text style={{ fontSize: 13, color: colors.mute, marginTop: 4 }}>
                Listed at <Text style={{ fontWeight: '700', color: colors.ink }}>${listingPrice}</Text>
              </Text>
            )}

            <View
              style={{
                marginTop: 18,
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: colors.purpleSoft,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: '900', color: colors.purple, marginRight: 6 }}>$</Text>
              <TextInput
                placeholder="0"
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={{ fontSize: 28, fontWeight: '900', color: colors.ink, flex: 1, padding: 0 }}
                placeholderTextColor="rgba(15,15,15,0.45)"
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
                        borderRadius: 999,
                        backgroundColor: selected ? colors.ink : colors.panel,
                        alignItems: 'center',
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? 'white' : colors.ink }}>
                        ${v}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
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
                fontSize: 14,
                color: colors.ink,
                backgroundColor: colors.panel,
                borderRadius: 14,
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
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [offerVisible, setOfferVisible] = useState(false);

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

  const handleSend = useCallback(async () => {
    if (!user || !conversationId || sending) return;
    const text = input.trim();
    if (!text) return;
    setSending(true);
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: user.id,
      content: text,
      kind: 'text',
      metadata: null,
      offer_status: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    setInput('');

    try {
      const saved = await sendMessage({ conversationId, senderId: user.id, content: text });
      if (saved) {
        // Realtime may have already inserted the saved message — dedupe.
        setMessages((prev) => {
          const realtimeAlreadyInserted = prev.some((m) => m.id === saved.id);
          if (realtimeAlreadyInserted) {
            // Remove the temp; the real message is already present.
            return prev.filter((m) => m.id !== temp.id);
          }
          // Replace the temp with the saved message.
          return prev.map((m) => (m.id === temp.id ? saved : m));
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== temp.id));
        Alert.alert('Could not send', 'Please try again in a moment.');
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      Alert.alert('Could not send', 'Please try again in a moment.');
    } finally {
      setSending(false);
    }
  }, [conversationId, input, sending, user]);

  const handleSendOffer = useCallback(
    async (amount: number, note: string) => {
      if (!user || !conversationId) return;
      const saved = await sendOffer({ conversationId, senderId: user.id, amount, note });
      if (saved) {
        setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
        setOfferVisible(false);
        toast.show('Offer sent', { variant: 'success', icon: 'check' });
      } else {
        Alert.alert('Could not send offer', 'Please try again.');
      }
    },
    [conversationId, user, toast],
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

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        msg={item}
        mine={!!user && item.sender_id === user.id}
        isSeller={isSeller}
        listingId={conv?.listing_id ?? null}
        listingSold={conv?.listing?.is_sold ?? false}
        onAccept={() => handleOfferResponse(item, 'accepted')}
        onDecline={() => handleOfferResponse(item, 'declined')}
      />
    ),
    [user, isSeller, conv?.listing_id, conv?.listing?.is_sold, handleOfferResponse],
  );

  if (loading) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  if (!conv) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'white' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
          <Pressable onPress={() => safeBack()}>
            <Feather name="chevron-left" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <EmptyState icon="alert-circle" title="Conversation unavailable" description="This thread may have been removed." />
      </SafeAreaView>
    );
  }

  const otherAvatar = other?.avatar_url ? getOptimizedImageUrl(other.avatar_url, { width: 120 }) : null;
  const listingThumb = conv.listing?.images?.[0]
    ? getOptimizedImageUrl(conv.listing.images[0], { width: 200 })
    : null;
  const otherInitial = (other?.full_name || other?.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingTop: 6,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="chevron-left" size={24} color={colors.ink} />
          </Pressable>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.purpleSoft,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
              marginLeft: 2,
            }}
          >
            {otherAvatar ? (
              <Image source={{ uri: otherAvatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.purple }}>{otherInitial}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
              {other?.full_name || other?.username || 'User'}
            </Text>
            {other?.username && (
              <Text style={{ fontSize: 11, color: colors.mute }} numberOfLines={1}>
                @{other.username}
              </Text>
            )}
          </View>
        </View>
        {other?.id && (
          <Pressable
            onPress={() => router.push(`/user/${other.id}` as any)}
            hitSlop={HIT_SLOP_8}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.panel,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="user" size={16} color={colors.ink} />
          </Pressable>
        )}
      </View>

      {/* Product ticket */}
      {conv.listing && (
        <Pressable
          onPress={() => conv.listing_id && router.push(`/product/${conv.listing_id}` as any)}
          style={({ pressed }) => ({
            marginHorizontal: 12,
            marginTop: 10,
            marginBottom: 6,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: radii.xl,
            backgroundColor: pressed ? colors.purpleSoft : colors.panel,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              overflow: 'hidden',
              backgroundColor: colors.divider,
              marginRight: 12,
            }}
          >
            {listingThumb && (
              <Image source={{ uri: listingThumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
              {conv.listing.title}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.purple, marginTop: 2 }}>
              ${conv.listing.price}
              {conv.listing.is_sold ? ' · Sold' : ''}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.muteSoft} />
        </Pressable>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 14 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <EmptyState
            icon="message-circle"
            title="Say hi"
            description="Start the conversation — ask a question or send an offer."
          />
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
            backgroundColor: 'white',
            gap: 8,
          }}
        >
          {!isSeller && (
            <Pressable
              onPress={() => setOfferVisible(true)}
              style={({ pressed }) => ({
                height: 40,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: colors.purpleSoft,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Feather name="tag" size={14} color={colors.purple} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.purple }}>Offer</Text>
            </Pressable>
          )}
          <View
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 120,
              backgroundColor: colors.panel,
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
              justifyContent: 'center',
            }}
          >
            <TextInput
              placeholder="Write a message..."
              placeholderTextColor={colors.muteSoft}
              value={input}
              onChangeText={setInput}
              multiline
              style={{
                fontSize: 15,
                color: colors.ink,
                padding: 0,
                maxHeight: 100,
                // RN-Web: kill the browser's default input focus ring.
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || sending}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: input.trim() ? colors.purple : colors.panel,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {sending ? (
              <ActivityIndicator size="small" color={input.trim() ? 'white' : colors.muteSoft} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={input.trim() ? 'white' : colors.muteSoft} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <OfferSheet
        visible={offerVisible}
        listingPrice={conv.listing?.price ?? null}
        onClose={() => setOfferVisible(false)}
        onSubmit={handleSendOffer}
      />
    </SafeAreaView>
  );
}
