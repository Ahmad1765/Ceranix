import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '@/lib/auth';
import { fetchListingById } from '@/lib/listings';
import { getOrCreateConversation, sendMessage, sendOffer } from '@/lib/chat';
import { getOptimizedImageUrl } from '@/lib/images';
import { useToast } from '@/lib/toast';
import type { Listing } from '@/types';

const BRAND_PURPLE = '#6C47FF';
const BRAND_PURPLE_SOFT = '#f1edff';
const BRAND_INK = '#0a0a0a';
const BRAND_LIME = '#d8f53a';

type Mode = 'message' | 'offer';

const QUICK_REPLIES = [
  'Hi! Is this still available?',
  'Could you send more photos?',
  'Would you bundle this with another item?',
];

export default function NewConversationScreen() {
  const params = useLocalSearchParams<{ listing?: string; mode?: string; amount?: string }>();
  const listingId = typeof params.listing === 'string' ? params.listing : '';
  const initialMode: Mode = params.mode === 'offer' ? 'offer' : 'message';
  const initialAmount = typeof params.amount === 'string' ? params.amount : '';

  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  // Small phones (e.g. iPhone SE) get tighter spacing + smaller hero number.
  const compact = winHeight < 700 || winWidth < 360;
  const amountFontSize = compact ? 26 : 32;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  // Only autoFocus the input that matches the *initial* mode. Toggling later
  // re-mounts the input, and browser scrollIntoView on the new focus was
  // pushing the body sideways on web.
  const [hasToggled, setHasToggled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!listingId) {
      setLoading(false);
      return;
    }
    fetchListingById(listingId).then((row) => {
      if (cancelled) return;
      setListing(row);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const offerSuggestions = useMemo(() => {
    if (!listing) return [];
    return [
      Math.round(listing.price * 0.7),
      Math.round(listing.price * 0.8),
      Math.round(listing.price * 0.9),
    ].filter((v) => v > 0);
  }, [listing]);

  const amountNum = parseInt(amount, 10);
  const offerValid = mode === 'offer' && Number.isFinite(amountNum) && amountNum > 0;
  const msgValid = mode === 'message' && message.trim().length > 0;
  const canSend = (offerValid || msgValid) && !sending;

  const handleSend = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to send messages.');
      return;
    }
    if (!listing) return;
    if (listing.seller_id === user.id) {
      Alert.alert('Heads up', "You can't message yourself.");
      return;
    }
    setSending(true);

    const conv = await getOrCreateConversation({
      buyerId: user.id,
      sellerId: listing.seller_id,
      listingId: listing.id,
    });
    if (!conv) {
      setSending(false);
      Alert.alert('Could not start chat', 'Please try again.');
      return;
    }

    let ok = false;
    if (mode === 'offer') {
      const saved = await sendOffer({
        conversationId: conv.id,
        senderId: user.id,
        amount: amountNum,
        note: note.trim() || undefined,
      });
      ok = !!saved;
    } else {
      const saved = await sendMessage({
        conversationId: conv.id,
        senderId: user.id,
        content: message,
      });
      ok = !!saved;
    }

    setSending(false);
    if (!ok) {
      Alert.alert('Could not send', 'Please try again.');
      return;
    }
    toast.show(mode === 'offer' ? 'Offer sent' : 'Message sent', {
      variant: 'success',
      icon: 'check',
    });
    router.replace(`/conversation/${conv.id}` as any);
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND_PURPLE} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'white' }}>
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()}>
            <Feather name="x" size={26} color="black" />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: BRAND_INK }}>Listing unavailable</Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 6, textAlign: 'center' }}>
            This item may have been removed.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const sellerName = listing.seller?.full_name || listing.seller?.username || 'Seller';
  const sellerAvatar = listing.seller?.avatar_url
    ? getOptimizedImageUrl(listing.seller.avatar_url, { width: 120 })
    : null;
  const thumb = listing.images?.[0] ? getOptimizedImageUrl(listing.images[0], { width: 200 })
    : null;

  // CTA height + safe-area bottom inset → leave this much room at the bottom
  // of the scroll content so nothing gets parked under the floating button.
  const CTA_HEIGHT = 52;
  const CTA_VPAD = 14;
  const ctaTotalHeight = CTA_HEIGHT + CTA_VPAD * 2 + Math.max(insets.bottom, 8);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'white' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        // On iOS modal presentations the system shifts the whole screen; small
        // additional offset prevents a 1-px gap at the keyboard top edge.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#f1f1f1',
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 4 }}>
            <Feather name="x" size={24} color="black" />
          </Pressable>
          <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND_INK }} numberOfLines={1}>
            {mode === 'offer' ? 'Make an offer' : 'New message'}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: ctaTotalHeight + 16,
          }}
        >
          <View>
            {/* Recipient */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 13, color: '#6b7280', marginRight: 8 }}>To</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f4f4f5',
                  borderRadius: 999,
                  paddingLeft: 4,
                  paddingRight: 12,
                  paddingVertical: 4,
                  maxWidth: '100%',
                }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#e5e7eb', overflow: 'hidden', marginRight: 8 }}>
                  {sellerAvatar ? (
                    <Image source={{ uri: sellerAvatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="user" size={12} color="#9ca3af" />
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_INK, flexShrink: 1 }} numberOfLines={1}>
                  {sellerName}
                </Text>
              </View>
            </View>

            {/* Listing card */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fafafa',
                borderRadius: 16,
                padding: 12,
                borderWidth: 1,
                borderColor: '#eee',
                marginBottom: 18,
              }}
            >
              <View style={{ width: 60, height: 60, borderRadius: 12, overflow: 'hidden', backgroundColor: '#eee', marginRight: 12 }}>
                {thumb && <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_INK }} numberOfLines={1}>
                  {listing.title}
                </Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }} numberOfLines={1}>
                  ${listing.price}
                  {listing.size ? ` · Size ${listing.size}` : ''}
                </Text>
              </View>
            </View>

            {/* Mode switch */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#f3f4f6',
                padding: 4,
                borderRadius: 12,
                marginBottom: 18,
              }}
            >
              {(['message', 'offer'] as Mode[]).map((m) => {
                const active = mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setMode(m);
                      setHasToggled(true);
                    }}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 9,
                      borderRadius: 9,
                      backgroundColor: active ? 'white' : 'transparent',
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 6,
                      opacity: pressed ? 0.8 : 1,
                      ...(active && Platform.OS === 'ios'
                        ? {
                            shadowColor: '#000',
                            shadowOpacity: 0.06,
                            shadowRadius: 3,
                            shadowOffset: { width: 0, height: 1 },
                          }
                        : {}),
                      ...(active && Platform.OS === 'android' ? { elevation: 1 } : {}),
                    })}
                  >
                    <Feather
                      name={m === 'message' ? 'message-circle' : 'tag'}
                      size={14}
                      color={active ? BRAND_INK : '#6b7280'}
                    />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: active ? BRAND_INK : '#6b7280' }}>
                      {m === 'message' ? 'Message' : 'Offer'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === 'message' ? (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Your message
                </Text>
                <View style={{ backgroundColor: '#fafafa', borderRadius: 14, borderWidth: 1, borderColor: '#eee', padding: 14, minHeight: compact ? 110 : 140 }}>
                  <TextInput
                    placeholder="Hi! I have a question about this item..."
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    autoFocus={!hasToggled && initialMode === 'message'}
                    textAlignVertical="top"
                    placeholderTextColor="#9ca3af"
                    style={{ fontSize: 15, color: BRAND_INK, padding: 0, minHeight: compact ? 90 : 120 }}
                  />
                </View>

                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 18, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Quick replies
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {QUICK_REPLIES.map((q) => (
                    <Pressable
                      key={q}
                      onPress={() => setMessage(q)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: '#e5e7eb',
                        backgroundColor: 'white',
                        opacity: pressed ? 0.7 : 1,
                        flexShrink: 1,
                      })}
                    >
                      <Text style={{ fontSize: 12, color: BRAND_INK, fontWeight: '600' }} numberOfLines={1}>
                        {q}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Your offer
                </Text>
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: compact ? 12 : 14,
                    backgroundColor: '#fafafa',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#eee',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: amountFontSize,
                      fontWeight: '900',
                      color: BRAND_INK,
                      marginRight: 6,
                      lineHeight: amountFontSize * 1.15,
                    }}
                  >
                    $
                  </Text>
                  <TextInput
                    placeholder="0"
                    value={amount}
                    onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    style={{
                      fontSize: amountFontSize,
                      fontWeight: '900',
                      color: BRAND_INK,
                      flex: 1,
                      padding: 0,
                      lineHeight: amountFontSize * 1.15,
                    }}
                    placeholderTextColor="#d1d5db"
                    autoFocus={!hasToggled && initialMode === 'offer'}
                    maxLength={7}
                  />
                </View>

                {offerSuggestions.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {offerSuggestions.map((v) => {
                      const selected = amountNum === v;
                      return (
                        <Pressable
                          key={v}
                          onPress={() => setAmount(String(v))}
                          style={({ pressed }) => ({
                            flexGrow: 1,
                            flexBasis: 0,
                            minWidth: 80,
                            paddingVertical: 10,
                            paddingHorizontal: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: selected ? BRAND_INK : '#e5e7eb',
                            backgroundColor: selected ? BRAND_INK : 'white',
                            alignItems: 'center',
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text
                            style={{ fontSize: 13, fontWeight: '700', color: selected ? 'white' : BRAND_INK }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            ${v}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 18, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Note (optional)
                </Text>
                <TextInput
                  placeholder="Add a quick note to the seller"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  placeholderTextColor="#9ca3af"
                  style={{
                    fontSize: 14,
                    color: BRAND_INK,
                    backgroundColor: '#fafafa',
                    borderWidth: 1,
                    borderColor: '#eee',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    minHeight: compact ? 50 : 60,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            )}

            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 22, lineHeight: 16 }}>
              Be kind and respectful. Use Carrinex's payment flow for a safe transaction.
            </Text>
          </View>
        </ScrollView>

        {/* Floating CTA bar */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: CTA_VPAD,
            paddingBottom: Math.max(insets.bottom, 8) + 6,
            borderTopWidth: 1,
            borderTopColor: '#f1f1f1',
            backgroundColor: 'white',
          }}
        >
          <View>
            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              style={({ pressed }) => ({
                height: CTA_HEIGHT,
                borderRadius: 14,
                backgroundColor: canSend ? BRAND_INK : '#e5e7eb',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                opacity: pressed && canSend ? 0.9 : 1,
                transform: [{ scale: pressed && canSend ? 0.99 : 1 }],
              })}
            >
              {sending ? (
                <ActivityIndicator color={canSend ? 'white' : '#9ca3af'} />
              ) : (
                <>
                  <Feather
                    name={mode === 'offer' ? 'tag' : 'send'}
                    size={16}
                    color={canSend ? BRAND_LIME : '#9ca3af'}
                  />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: canSend ? 'white' : '#9ca3af', letterSpacing: 0.2 }} numberOfLines={1}>
                    {mode === 'offer'
                      ? offerValid
                        ? `Send offer · $${amountNum}`
                        : 'Enter an amount'
                      : msgValid
                      ? 'Send message'
                      : 'Type a message'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
