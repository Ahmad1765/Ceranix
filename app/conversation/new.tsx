import { useEffect, useMemo, useRef, useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Pressable, ScrollView, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useAuth } from '@/lib/auth';
import { useListingQuery } from '@/lib/queries';
import { getOrCreateConversation, sendMessage, sendOffer } from '@/lib/chat';
import { getOptimizedImageUrl } from '@/lib/images';
import { formatPrice, CURRENCY_SYMBOL } from '@/lib/currency';
import { useToast } from '@/lib/toast';
import { captureError } from '@/lib/sentry';
import { colors, radii, shadow } from '@/lib/theme';

type Mode = 'message' | 'offer';

const QUICK_REPLIES = [
  'Hi! Is this still available?',
  'Could you send more photos?',
  'Would you bundle this with another item?',
  'Is the price negotiable?',
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 10,
        color: colors.mute,
      }}
    >
      {children}
    </Text>
  );
}

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

  // The item being messaged/offered on. Shared cache with the product screen the
  // buyer just came from, so the compose sheet opens on a populated hero rather
  // than a spinner.
  const listingQ = useListingQuery(listingId || null);
  const listing = listingQ.data ?? null;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [hasToggled, setHasToggled] = useState(false);

  const messageRef = useRef<TextInput>(null);
  const amountRef = useRef<TextInput>(null);

  // Focus the active field on first mount without triggering the
  // browser's scrollIntoView (which on react-native-web shifts the
  // page horizontally and clips the hero on the left edge).
  useEffect(() => {
    if (hasToggled) return;
    const target = initialMode === 'offer' ? amountRef.current : messageRef.current;
    if (!target) return;
    const id = requestAnimationFrame(() => {
      try {
        (target as any).focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep reporting a failed listing load to Sentry. React Query owns the retry
  // and the UI state now, but it does not report anywhere, and this screen sits
  // in the offer path — a silent failure here is a buyer who can't make an
  // offer and nobody knowing about it. Fires once per settled error, not once
  // per attempt, since `error` is only populated after the retries are spent.
  const loadError = listingQ.error;
  useEffect(() => {
    if (loadError) captureError(loadError, { fn: 'conversationNew.fetchListing' });
  }, [loadError]);

  const offerSuggestions = useMemo(() => {
    if (!listing || listing.price <= 0) return [];
    // Money snap: round suggestions down to a tier that reads naturally for
    // the price band. Avoids ugly $13.30 / $55.30 numbers and prevents
    // -10% on a $5 item from rounding back up to the list price.
    const step =
      listing.price <= 20 ? 1 :
      listing.price <= 100 ? 5 :
      listing.price <= 500 ? 10 :
      25;
    const snap = (n: number) => Math.max(step, Math.floor(n / step) * step);

    const snapped = [0.3, 0.2, 0.1]
      .map((off) => snap(listing.price * (1 - off)))
      .filter((v) => v > 0 && v < listing.price);
    const unique = Array.from(new Set(snapped));

    return unique.map((value) => ({
      value,
      label: `-${Math.round(((listing.price - value) / listing.price) * 100)}%`,
    }));
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

    try {
      const conv = await getOrCreateConversation({
        buyerId: user.id,
        sellerId: listing.seller_id,
        listingId: listing.id,
      });
      if (!conv) {
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

      if (!ok) {
        Alert.alert('Could not send', 'Please try again.');
        return;
      }
      toast.show(mode === 'offer' ? 'Offer sent' : 'Message sent', {
        variant: 'success',
        icon: 'check',
      });
      router.replace(`/conversation/${conv.id}` as any);
    } catch (err) {
      captureError(err, { fn: 'conversationNew.send' });
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Still in flight with nothing cached. A missing listing param disables the
  // query, so it falls straight through to "Listing unavailable" below — what
  // the old `if (!listingId) setLoading(false)` produced.
  if (!listing && listingId && listingQ.isPending) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
          <Pressable onPress={() => safeBack()} hitSlop={12}>
            <Feather name="x" size={24} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              backgroundColor: colors.panel,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Feather name="alert-circle" size={24} color={colors.mute} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
            Listing unavailable
          </Text>
          <Text
            style={{ fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20, color: colors.mute }}
          >
            This item may have been removed or is no longer for sale.
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

  const ctaBottomPad = Math.max(insets.bottom, 12) + 12;
  const ctaTotalHeight = 58 + 12 + ctaBottomPad;

  const heroTitle = mode === 'offer' ? 'Make an offer' : 'Send a message';
  const heroSub =
    mode === 'offer'
      ? 'Sellers respond faster to fair, friendly offers.'
      : 'Ask a quick question — sellers usually reply within a day.';

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: colors.background, overflow: 'hidden' }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
          >
            <Feather name="x" size={24} color={colors.ink} />
          </Pressable>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
            {mode === 'offer' ? 'Offer' : 'Message'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: ctaTotalHeight + 24,
          }}
        >
          {/* Hero */}
          <Text
            style={{
              fontSize: 30,
              fontWeight: '800',
              letterSpacing: -0.6,
              lineHeight: 36,
              marginTop: 6,
              color: colors.ink,
            }}
          >
            {heroTitle}
          </Text>
          <Text
            style={{ fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 320, color: colors.mute }}
          >
            {heroSub}
          </Text>

          {/* Listing + seller card */}
          <View
            style={{
              borderRadius: 18,
              padding: 14,
              marginTop: 22,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 14,
                  overflow: 'hidden',
                  marginRight: 12,
                  backgroundColor: colors.panel,
                }}
              >
                {thumb && (
                  <Image
                    source={{ uri: thumb }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}
                  numberOfLines={1}
                >
                  {listing.title}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatPrice(listing.price)}
                  </Text>
                  {listing.size ? (
                    <Text
                      style={{ fontSize: 12, fontWeight: '600', marginLeft: 8, color: colors.mute }}
                    >
                      Size {listing.size}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            <View
              style={{
                marginTop: 14,
                paddingTop: 12,
                flexDirection: 'row',
                alignItems: 'center',
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', marginRight: 10, color: colors.mute }}>
                To
              </Text>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                  backgroundColor: colors.purpleSoft,
                }}
              >
                {sellerAvatar ? (
                  <Image
                    source={{ uri: sellerAvatar }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.purple }}>
                    {sellerInitial}
                  </Text>
                )}
              </View>
              <Text
                style={{ fontSize: 13, fontWeight: '700', flex: 1, color: colors.ink }}
                numberOfLines={1}
              >
                {sellerName}
              </Text>
            </View>
          </View>

          {/* Mode segmented */}
          <View style={{ marginTop: 26 }}>
            <Eyebrow>What would you like to send?</Eyebrow>
            <View
              style={{
                padding: 4,
                borderRadius: 14,
                flexDirection: 'row',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
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
                      paddingVertical: 11,
                      borderRadius: 10,
                      backgroundColor: active ? colors.panel : 'transparent',
                      borderWidth: active ? 1 : 0,
                      borderColor: active ? colors.border : 'transparent',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                  >
                    <Feather
                      name={m === 'message' ? 'message-circle' : 'tag'}
                      size={14}
                      color={active ? colors.ink : colors.mute}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: active ? '700' : '500',
                        color: active ? colors.ink : colors.mute,
                      }}
                    >
                      {m === 'message' ? 'Message' : 'Offer'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Mode-specific content */}
          {mode === 'message' ? (
            <>
              {/* Message field */}
              <View style={{ marginTop: 28 }}>
                <Eyebrow>Your message</Eyebrow>
                <View
                  style={{
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    minHeight: compact ? 120 : 150,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <TextInput
                    ref={messageRef}
                    placeholder="Hi! I have a question about this item…"
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor={colors.mute}
                    style={{
                      fontSize: 15,
                      color: colors.ink,
                      padding: 0,
                      minHeight: compact ? 100 : 130,
                      outlineStyle: 'none',
                      outlineWidth: 0,
                      borderWidth: 0,
                    } as any}
                  />
                </View>
              </View>

              {/* Quick replies */}
              <View style={{ marginTop: 26 }}>
                <Eyebrow>Quick replies</Eyebrow>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {QUICK_REPLIES.map((q) => {
                    const active = message === q;
                    return (
                      <Pressable
                        key={q}
                        onPress={() => setMessage(q)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? colors.purple : colors.border,
                          backgroundColor: active ? colors.purple : colors.surface,
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: active ? '#FFFFFF' : colors.ink,
                          }}
                          numberOfLines={1}
                        >
                          {q}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Hero amount input */}
              <View style={{ marginTop: 28 }}>
                <Eyebrow>Your offer</Eyebrow>
                <View
                  style={{
                    borderRadius: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text
                        style={{ fontSize: 26, fontWeight: '800', marginRight: 6, color: colors.purple }}
                      >
                        {CURRENCY_SYMBOL}
                      </Text>
                      <TextInput
                        ref={amountRef}
                        placeholder="0"
                        value={amount}
                        onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        maxLength={7}
                        placeholderTextColor={colors.mute}
                        style={{
                          fontSize: 32,
                          fontWeight: '800',
                          color: colors.ink,
                          flex: 1,
                          padding: 0,
                          outlineStyle: 'none',
                          outlineWidth: 0,
                          borderWidth: 0,
                        } as any}
                      />
                    </View>
                    {offerValid && amountNum < listing.price ? (
                      <Text style={{ fontSize: 12, marginTop: 4, color: colors.mute }}>
                        {Math.round(((listing.price - amountNum) / listing.price) * 100)}% off the
                        listed price
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={{ fontSize: 12, fontWeight: '600', color: colors.mute }}
                  >
                    USD
                  </Text>
                </View>

                {/* Suggestions */}
                {offerSuggestions.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {offerSuggestions.map((s) => {
                      const selected = amountNum === s.value;
                      return (
                        <Pressable
                          key={s.value}
                          onPress={() => setAmount(String(s.value))}
                          style={({ pressed }) => ({
                            flex: 1,
                            paddingVertical: 12,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: selected ? colors.purple : colors.border,
                            backgroundColor: selected ? colors.purple : colors.surface,
                            alignItems: 'center',
                            transform: [{ scale: pressed ? 0.97 : 1 }],
                          })}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              letterSpacing: 0.4,
                              color: selected ? 'rgba(255,255,255,0.85)' : colors.mute,
                            }}
                          >
                            {s.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '800',
                              color: selected ? '#FFFFFF' : colors.ink,
                              marginTop: 2,
                            }}
                            numberOfLines={1}
                          >
                            {formatPrice(s.value)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Note */}
              <View style={{ marginTop: 26 }}>
                <Eyebrow>Add a note (optional)</Eyebrow>
                <View
                  style={{
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    minHeight: compact ? 70 : 90,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <TextInput
                    placeholder="Why does this offer make sense? Keep it friendly."
                    value={note}
                    onChangeText={setNote}
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor={colors.mute}
                    style={{
                      fontSize: 14,
                      color: colors.ink,
                      padding: 0,
                      minHeight: compact ? 50 : 70,
                      outlineStyle: 'none',
                      outlineWidth: 0,
                      borderWidth: 0,
                    } as any}
                  />
                </View>
              </View>
            </>
          )}

          {/* Footer hint */}
          <View
            style={{
              marginTop: 28,
              padding: 14,
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'flex-start',
              backgroundColor: colors.purpleSoft,
            }}
          >
            <Feather
              name="shield"
              size={14}
              color={colors.purple}
              style={{ marginTop: 2, marginRight: 10 }}
            />
            <Text
              style={{ fontSize: 12, lineHeight: 18, flex: 1, fontWeight: '500', color: colors.ink }}
            >
              Keep payments inside Carranix — off-platform deals aren&apos;t protected.
            </Text>
          </View>
        </ScrollView>

        {/* Sticky CTA */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: ctaBottomPad,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => ({
              height: 54,
              borderRadius: 16,
              backgroundColor: canSend ? colors.purple : colors.panel,
              borderWidth: canSend ? 0 : 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: sending ? 0.7 : 1,
              transform: [{ scale: pressed && canSend ? 0.985 : 1 }],
              overflow: 'hidden',
            })}
          >
            <View
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 54,
                backgroundColor: canSend ? 'rgba(0,0,0,0.12)' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Feather
                  name={mode === 'offer' ? 'tag' : 'send'}
                  size={18}
                  color={canSend ? '#FFFFFF' : colors.mute}
                />
              )}
            </View>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: canSend ? '#FFFFFF' : colors.mute,
                letterSpacing: 0.2,
                marginRight: 54,
              }}
            >
              {sending
                ? 'Sending…'
                : mode === 'offer'
                  ? offerValid
                    ? `Send offer · ${formatPrice(amountNum)}`
                    : 'Enter an amount'
                  : msgValid
                    ? 'Send message'
                    : 'Type a message'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
