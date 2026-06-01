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
import { safeBack } from '@/lib/nav';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '@/lib/auth';
import { fetchListingById } from '@/lib/listings';
import { getOrCreateConversation, sendMessage, sendOffer } from '@/lib/chat';
import { getOptimizedImageUrl } from '@/lib/images';
import { useToast } from '@/lib/toast';
import type { Listing } from '@/types';
import { colors, radii } from '@/lib/theme';
import { Button } from '@/components/ui';
import { HIT_SLOP_8 } from '@/lib/responsive';

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
  const compact = winHeight < 700 || winWidth < 360;
  const amountFontSize = compact ? 28 : 32;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [hasToggled, setHasToggled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!listingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'white' }}>
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => safeBack()}>
            <Feather name="x" size={24} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>Listing unavailable</Text>
          <Text style={{ fontSize: 13, color: colors.mute, marginTop: 6, textAlign: 'center' }}>
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
  const thumb = listing.images?.[0] ? getOptimizedImageUrl(listing.images[0], { width: 240 }) : null;
  const sellerInitial = sellerName.trim().charAt(0).toUpperCase();

  const CTA_HEIGHT = 52;
  const CTA_VPAD = 14;
  const ctaTotalHeight = CTA_HEIGHT + CTA_VPAD * 2 + Math.max(insets.bottom, 8);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
          }}
        >
          <Pressable onPress={() => safeBack()} hitSlop={HIT_SLOP_8} style={{ padding: 4 }}>
            <Feather name="x" size={22} color={colors.ink} />
          </Pressable>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {mode === 'offer' ? 'Make an offer' : 'New message'}
          </Text>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 14,
            paddingHorizontal: 14,
            paddingBottom: ctaTotalHeight + 16,
          }}
        >
          {/* Recipient */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: colors.mute, marginRight: 8 }}>To</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.panel,
                borderRadius: 999,
                paddingLeft: 4,
                paddingRight: 12,
                paddingVertical: 4,
                maxWidth: '100%',
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: colors.purpleSoft,
                  overflow: 'hidden',
                  marginRight: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sellerAvatar ? (
                  <Image source={{ uri: sellerAvatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.purple }}>{sellerInitial}</Text>
                )}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
                {sellerName}
              </Text>
            </View>
          </View>

          {/* Listing card */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.panel,
              borderRadius: 16,
              padding: 12,
              marginBottom: 18,
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: colors.divider,
                marginRight: 12,
              }}
            >
              {thumb && <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
                {listing.title}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.purple, marginTop: 2 }}>
                ${listing.price}
                {listing.size ? (
                  <Text style={{ fontSize: 12, color: colors.mute, fontWeight: '600' }}>
                    {'  '}· Size {listing.size}
                  </Text>
                ) : null}
              </Text>
            </View>
          </View>

          {/* Mode toggle */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.panel,
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
                    ...(active
                      ? {
                          boxShadow: '0px 1px 3px rgba(0,0,0,0.06)',
                          ...(Platform.OS === 'android' ? { elevation: 1 } : {}),
                        }
                      : {}),
                  })}
                >
                  <Feather
                    name={m === 'message' ? 'message-circle' : 'tag'}
                    size={14}
                    color={active ? colors.ink : colors.mute}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colors.ink : colors.mute }}>
                    {m === 'message' ? 'Message' : 'Offer'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'message' ? (
            <View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.mute, marginBottom: 8, letterSpacing: 0.6 }}>
                YOUR MESSAGE
              </Text>
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 14,
                  padding: 14,
                  minHeight: compact ? 110 : 140,
                }}
              >
                <TextInput
                  placeholder="Hi! I have a question about this item..."
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  autoFocus={!hasToggled && initialMode === 'message'}
                  textAlignVertical="top"
                  placeholderTextColor={colors.muteSoft}
                  style={{ fontSize: 15, color: colors.ink, padding: 0, minHeight: compact ? 90 : 120 }}
                />
              </View>

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: colors.mute,
                  marginTop: 18,
                  marginBottom: 8,
                  letterSpacing: 0.6,
                }}
              >
                QUICK REPLIES
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
                      borderColor: colors.hairline,
                      backgroundColor: 'white',
                      opacity: pressed ? 0.7 : 1,
                      flexShrink: 1,
                    })}
                  >
                    <Text style={{ fontSize: 12.5, color: colors.ink, fontWeight: '600' }} numberOfLines={1}>
                      {q}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.mute, marginBottom: 8, letterSpacing: 0.6 }}>
                YOUR OFFER
              </Text>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: compact ? 12 : 14,
                  backgroundColor: colors.purpleSoft,
                  borderRadius: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: amountFontSize,
                    fontWeight: '900',
                    color: colors.purple,
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
                    color: colors.ink,
                    flex: 1,
                    padding: 0,
                    lineHeight: amountFontSize * 1.15,
                  }}
                  placeholderTextColor="rgba(15,15,15,0.45)"
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
                          backgroundColor: selected ? colors.ink : colors.panel,
                          alignItems: 'center',
                          opacity: pressed ? 0.75 : 1,
                        })}
                      >
                        <Text
                          style={{ fontSize: 13, fontWeight: '700', color: selected ? 'white' : colors.ink }}
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

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: colors.mute,
                  marginTop: 18,
                  marginBottom: 8,
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
                placeholderTextColor={colors.muteSoft}
                style={{
                  fontSize: 14,
                  color: colors.ink,
                  backgroundColor: colors.panel,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  minHeight: compact ? 50 : 60,
                  textAlignVertical: 'top',
                }}
              />
            </View>
          )}

          <Text style={{ fontSize: 11, color: colors.muteSoft, marginTop: 22, lineHeight: 16 }}>
            Be kind and respectful. Use Ceranix's payment flow for a safe transaction.
          </Text>
        </ScrollView>

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 14,
            paddingTop: CTA_VPAD,
            paddingBottom: Math.max(insets.bottom, 8) + 6,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
            backgroundColor: 'white',
          }}
        >
          <Button
            label={
              sending
                ? 'Sending…'
                : mode === 'offer'
                  ? offerValid
                    ? `Send offer · $${amountNum}`
                    : 'Enter an amount'
                  : msgValid
                    ? 'Send message'
                    : 'Type a message'
            }
            variant="primary"
            size="lg"
            icon={mode === 'offer' ? 'tag' : 'send'}
            full
            loading={sending}
            disabled={!canSend}
            onPress={handleSend}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
