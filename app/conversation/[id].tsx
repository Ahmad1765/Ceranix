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

const BRAND_PURPLE = '#6C47FF';
const BRAND_PURPLE_SOFT = '#f1edff';
const BRAND_INK = '#0a0a0a';
const BRAND_LIME = '#d8f53a';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({
  msg,
  mine,
  isSeller,
  onAccept,
  onDecline,
}: {
  msg: ChatMessage;
  mine: boolean;
  isSeller: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (msg.kind === 'offer') {
    const amount = msg.metadata?.amount ?? 0;
    const status = msg.offer_status ?? 'pending';
    const canRespond = !mine && isSeller && status === 'pending';
    return (
      <View style={{ paddingHorizontal: 14, marginBottom: 12, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View
          style={{
            maxWidth: '85%',
            backgroundColor: mine ? BRAND_PURPLE : '#fafafa',
            borderWidth: mine ? 0 : 1,
            borderColor: '#eee',
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
                backgroundColor: mine ? 'rgba(255,255,255,0.18)' : BRAND_PURPLE_SOFT,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 6,
              }}
            >
              <Feather name="tag" size={11} color={mine ? 'white' : BRAND_PURPLE} />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: mine ? 'rgba(255,255,255,0.85)' : BRAND_PURPLE, textTransform: 'uppercase' }}>
              {mine ? 'You offered' : 'Offer'}
            </Text>
          </View>
          <Text style={{ fontSize: 28, fontWeight: '900', color: mine ? 'white' : BRAND_INK, letterSpacing: -0.8 }}>
            ${amount}
          </Text>
          {msg.metadata?.note ? (
            <Text style={{ fontSize: 13, color: mine ? 'rgba(255,255,255,0.85)' : '#374151', marginTop: 6 }}>
              {msg.metadata.note}
            </Text>
          ) : null}

          {status !== 'pending' && (
            <View
              style={{
                marginTop: 10,
                alignSelf: 'flex-start',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor:
                  status === 'accepted'
                    ? 'rgba(34,197,94,0.18)'
                    : status === 'declined'
                    ? 'rgba(239,68,68,0.18)'
                    : 'rgba(255,255,255,0.18)',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.4,
                  color: mine
                    ? 'white'
                    : status === 'accepted'
                    ? '#15803d'
                    : status === 'declined'
                    ? '#b91c1c'
                    : '#6b7280',
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
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'white',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_INK }}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={onAccept}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: BRAND_INK,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.85 : 1,
                  flexDirection: 'row',
                  gap: 4,
                })}
              >
                <Feather name="check" size={14} color={BRAND_LIME} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: 'white' }}>Accept</Text>
              </Pressable>
            </View>
          )}

          <Text style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.6)' : '#9ca3af', marginTop: 8 }}>
            {formatTime(msg.created_at)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', marginBottom: 8, paddingHorizontal: 14, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '80%',
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 18,
          borderTopRightRadius: mine ? 4 : 18,
          borderTopLeftRadius: mine ? 18 : 4,
          backgroundColor: mine ? BRAND_INK : '#f4f4f5',
        }}
      >
        <Text style={{ fontSize: 15, lineHeight: 20, color: mine ? 'white' : BRAND_INK }}>
          {msg.content}
        </Text>
        <Text style={{ fontSize: 10, marginTop: 4, color: mine ? 'rgba(255,255,255,0.55)' : '#9ca3af' }}>
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
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 14 }} />
            <Text style={{ fontSize: 20, fontWeight: '900', color: BRAND_INK, letterSpacing: -0.3 }}>Make an offer</Text>
            {listingPrice && (
              <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                Listed at <Text style={{ fontWeight: '700', color: BRAND_INK }}>${listingPrice}</Text>
              </Text>
            )}

            <View
              style={{
                marginTop: 18,
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: '#fafafa',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#eee',
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: '900', color: BRAND_INK, marginRight: 6 }}>$</Text>
              <TextInput
                placeholder="0"
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={{ fontSize: 28, fontWeight: '900', color: BRAND_INK, flex: 1, padding: 0 }}
                placeholderTextColor="#d1d5db"
                autoFocus
              />
            </View>

            {suggestions.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {suggestions.map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setAmount(String(v))}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: parsed === v ? BRAND_INK : '#e5e7eb',
                      backgroundColor: parsed === v ? BRAND_INK : 'white',
                      alignItems: 'center',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: parsed === v ? 'white' : BRAND_INK }}>
                      ${v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 18, marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Note (optional)
            </Text>
            <TextInput
              placeholder="Add a quick note to the seller"
              value={note}
              onChangeText={setNote}
              multiline
              style={{
                fontSize: 14,
                color: BRAND_INK,
                backgroundColor: '#fafafa',
                borderWidth: 1,
                borderColor: '#eee',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                minHeight: 60,
                textAlignVertical: 'top',
              }}
              placeholderTextColor="#9ca3af"
            />

            <Pressable
              onPress={handleSubmit}
              disabled={!valid || sending}
              style={({ pressed }) => ({
                marginTop: 18,
                height: 52,
                borderRadius: 14,
                backgroundColor: valid ? BRAND_INK : '#e5e7eb',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {sending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ fontSize: 15, fontWeight: '800', color: valid ? 'white' : '#9ca3af', letterSpacing: 0.2 }}>
                  Send offer
                </Text>
              )}
            </Pressable>
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
    (async () => {
      setLoading(true);
      const [c, m] = await Promise.all([
        getConversation(conversationId),
        fetchMessages(conversationId),
      ]);
      if (cancelled) return;
      setConv(c);
      setMessages(m);
      setLoading(false);
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
    // Optimistic insert
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

    const saved = await sendMessage({ conversationId, senderId: user.id, content: text });
    if (saved) {
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? saved : m)));
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      Alert.alert('Could not send', 'Please try again in a moment.');
    }
    setSending(false);
  }, [conversationId, input, sending, user]);

  const handleSendOffer = useCallback(
    async (amount: number, note: string) => {
      if (!user || !conversationId) return;
      const saved = await sendOffer({ conversationId, senderId: user.id, amount, note });
      if (saved) {
        setMessages((prev) =>
          prev.some((m) => m.id === saved.id) ? prev : [...prev, saved],
        );
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
      setMessages((m) =>
        m.map((x) => (x.id === msg.id ? { ...x, offer_status: status } : x)),
      );
      const ok = await updateOfferStatus(msg.id, status);
      if (!ok) {
        setMessages((m) =>
          m.map((x) => (x.id === msg.id ? { ...x, offer_status: prev } : x)),
        );
        Alert.alert('Could not update offer', 'Please try again.');
      } else {
        toast.show(status === 'accepted' ? 'Offer accepted 🎉' : 'Offer declined', {
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
        onAccept={() => handleOfferResponse(item, 'accepted')}
        onDecline={() => handleOfferResponse(item, 'declined')}
      />
    ),
    [user, isSeller, handleOfferResponse],
  );

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND_PURPLE} />
      </SafeAreaView>
    );
  }

  if (!conv) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'white' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
          <Pressable onPress={() => router.back()}>
            <Feather name="chevron-left" size={26} color="black" />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: BRAND_INK }}>Conversation unavailable</Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 6, textAlign: 'center' }}>
            This thread may have been removed or you might not have access.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const otherAvatar = other?.avatar_url ? getOptimizedImageUrl(other.avatar_url, { width: 120 }) : null;
  const listingThumb = conv.listing?.images?.[0]
    ? getOptimizedImageUrl(conv.listing.images[0], { width: 200 })
    : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Pressable onPress={() => router.back()} style={{ marginRight: 8, padding: 4 }}>
            <Feather name="chevron-left" size={26} color="black" />
          </Pressable>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: '#f3f4f6',
              overflow: 'hidden',
              marginRight: 10,
            }}
          >
            {otherAvatar ? (
              <Image source={{ uri: otherAvatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="user" size={18} color="#9ca3af" />
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: BRAND_INK }} numberOfLines={1}>
              {other?.full_name || other?.username || 'User'}
            </Text>
            {other?.username && (
              <Text style={{ fontSize: 11, color: '#6b7280' }} numberOfLines={1}>
                @{other.username}
              </Text>
            )}
          </View>
        </View>
        {other?.id && (
          <Pressable onPress={() => router.push(`/user/${other.id}` as any)} hitSlop={8} style={{ padding: 6 }}>
            <Feather name="info" size={20} color={BRAND_INK} />
          </Pressable>
        )}
      </View>

      {/* Product context */}
      {conv.listing && (
        <Pressable
          onPress={() => conv.listing_id && router.push(`/product/${conv.listing_id}` as any)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: pressed ? '#f3f0ff' : '#fafafa',
            borderBottomWidth: 1,
            borderBottomColor: '#f1f1f1',
          })}
        >
          <View style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: '#eee', marginRight: 12 }}>
            {listingThumb && (
              <Image source={{ uri: listingThumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_INK }} numberOfLines={1}>
              {conv.listing.title}
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              ${conv.listing.price}{conv.listing.is_sold ? ' · Sold' : ''}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color="#9ca3af" />
        </Pressable>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingTop: 14, paddingBottom: 14 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingHorizontal: 40, paddingTop: 60 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: BRAND_PURPLE_SOFT,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Feather name="message-circle" size={22} color={BRAND_PURPLE} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_INK, textAlign: 'center' }}>
              Say hi — start the conversation
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4, textAlign: 'center' }}>
              Ask a question, request more photos, or send an offer.
            </Text>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f1f1', backgroundColor: 'white', gap: 8 }}>
          {/* Offer trigger — only buyer can send an offer */}
          {!isSeller && (
            <Pressable
              onPress={() => setOfferVisible(true)}
              style={({ pressed }) => ({
                height: 40,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: BRAND_PURPLE_SOFT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="tag" size={14} color={BRAND_PURPLE} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_PURPLE }}>Offer</Text>
            </Pressable>
          )}
          <View
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 120,
              backgroundColor: '#f4f4f5',
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
              justifyContent: 'center',
            }}
          >
            <TextInput
              placeholder="Write a message..."
              placeholderTextColor="#9ca3af"
              value={input}
              onChangeText={setInput}
              multiline
              style={{ fontSize: 15, color: BRAND_INK, padding: 0, maxHeight: 100 }}
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
              backgroundColor: input.trim() ? BRAND_INK : '#e5e7eb',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {sending ? (
              <ActivityIndicator size="small" color={input.trim() ? 'white' : '#9ca3af'} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={input.trim() ? 'white' : '#9ca3af'} />
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
