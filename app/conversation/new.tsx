import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { useListingQuery } from '@/lib/queries';
import { getOrCreateConversation, sendMessage, sendOffer } from '@/lib/chat';
import { getOptimizedImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { orderTotal } from '@/lib/fees';
import { useToast } from '@/lib/toast';
import { captureError } from '@/lib/sentry';
import { colors, radii, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { BRAND } from '@/lib/brand';

type Mode = 'message' | 'offer';

const TEAL_BRAND = '#007782';

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
        fontFamily: type.family.sansBold,
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
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams<{
    listing?: string;
    mode?: string;
    amount?: string;
    bundle_ids?: string;
  }>();
  const listingId = typeof params.listing === 'string' ? params.listing : '';
  const initialMode: Mode = params.mode === 'offer' ? 'offer' : 'message';
  const initialAmountRaw = typeof params.amount === 'string' ? params.amount : '';
  const initialAmount = initialAmountRaw ? String(parseFloat(initialAmountRaw) || '') : '';
  const bundleIdsParam = typeof params.bundle_ids === 'string' ? params.bundle_ids : '';
  const bundleItemIds = useMemo(
    () => bundleIdsParam.split(',').filter(Boolean),
    [bundleIdsParam],
  );
  const isBundle = bundleItemIds.length > 0;
  const bundleCount = 1 + bundleItemIds.length;

  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const compact = winHeight < 700 || winWidth < 360;

  const listingQ = useListingQuery(listingId || null);
  const listing = listingQ.data ?? null;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedCard, setSelectedCard] = useState<'tier10' | 'tier20' | 'custom'>('custom');

  const messageRef = useRef<any>(null);
  const amountRef = useRef<any>(null);

  // Preset tiers: 10% and 20%
  const preset10 = useMemo(() => {
    if (!listing || listing.price <= 0) return 0;
    return Math.max(1, Math.round(listing.price * 0.9));
  }, [listing]);

  const preset20 = useMemo(() => {
    if (!listing || listing.price <= 0) return 0;
    return Math.max(1, Math.round(listing.price * 0.8));
  }, [listing]);

  useEffect(() => {
    if (listing && listing.price > 0 && !amount) {
      setAmount(String(preset20 || Math.round(listing.price * 0.8)));
      setSelectedCard('custom');
    }
  }, [listing, preset20]);

  const handleSelectCard = (card: 'tier10' | 'tier20' | 'custom') => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedCard(card);

    if (card === 'tier10') {
      setAmount(String(preset10));
      amountRef.current?.blur?.();
    } else if (card === 'tier20') {
      setAmount(String(preset20));
      amountRef.current?.blur?.();
    } else if (card === 'custom') {
      amountRef.current?.focus?.();
    }
  };

  const handleCustomChange = (text: string) => {
    const clean = text.replace(/[^0-9.]/g, '');
    setSelectedCard('custom');
    setAmount(clean);
  };

  const loadError = listingQ.error;
  useEffect(() => {
    if (loadError) captureError(loadError, { fn: 'conversationNew.fetchListing' });
  }, [loadError]);

  const amountNum = parseFloat(amount) || 0;
  const offerValid =
    mode === 'offer' &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    (!listing || amountNum < listing.price || isBundle);
  const msgValid = mode === 'message' && message.trim().length > 0;
  const canSend = (offerValid || msgValid) && !sending;

  const totalWithProtection = useMemo(() => {
    if (amountNum <= 0) return 0;
    return orderTotal(amountNum);
  }, [amountNum]);

  const handleSend = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to send messages or offers.');
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
          isBundle: isBundle,
          bundleItemIds: isBundle ? bundleItemIds : undefined,
          bundleCount: isBundle ? bundleCount : undefined,
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
      toast.show(mode === 'offer' ? (isBundle ? 'Bundle offer sent' : 'Offer sent') : 'Message sent', {
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

  const handleLearnWhy = () => {
    Alert.alert(
      'Daily Offer Limit',
      'To prevent spam and keep negotiations active and meaningful for sellers, buyers are limited to 25 offers per day.',
      [{ text: 'Got it' }]
    );
  };

  if (!listing && listingId && listingQ.isPending) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={TEAL_BRAND} />
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
          <Text style={{ fontSize: 18, fontFamily: type.family.sansBold, color: colors.ink }}>
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

  const thumb = listing.images?.[0] ? getOptimizedImageUrl(listing.images[0], { width: 240 }) : null;

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: isDark ? theme.background : '#FFFFFF', overflow: 'hidden' }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Top Header */}
        <View
          style={[
            styles.headerBar,
            { borderBottomColor: isDark ? theme.hairline : '#E5E7EB' },
          ]}
        >
          <Pressable
            onPress={() => safeBack()}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={[styles.closeText, { color: isDark ? theme.ink : '#15191A' }]}>Close</Text>
          </Pressable>

          <Text
            style={[
              styles.headerTitle,
              { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
            ]}
          >
            {mode === 'offer' ? 'Make an offer' : 'Send a message'}
          </Text>

          {mode === 'message' ? (
            <Pressable
              onPress={() => setMode('offer')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.modeSwitchBtn}
            >
              <Text style={[styles.modeSwitchText, { color: TEAL_BRAND, fontFamily: type.family.sansMedium }]}>
                Offer
              </Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 24) + 80,
          }}
        >
          {/* Item Card Row */}
          <View style={styles.itemRow}>
            {thumb ? (
              <Image
                source={{ uri: thumb }}
                style={styles.itemImage}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.itemImagePlaceholder, { backgroundColor: isDark ? theme.panel : '#F3F4F6' }]}>
                <Feather name="tag" size={22} color={theme.mute} />
              </View>
            )}

            <View style={styles.itemDetails}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.itemTitle,
                    { flex: 1, color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                  ]}
                >
                  {listing.title}
                </Text>
                {isBundle && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: '#5356EE',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
                      Bundle · {bundleCount} items
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.itemPrice, { color: isDark ? theme.mute : '#5A6566' }]}>
                {isBundle ? `Base item price: ${formatPrice(listing.price)}` : `Item price: ${formatPrice(listing.price)}`}
              </Text>
            </View>
          </View>

          {mode === 'offer' ? (
            <>
              {/* 3 Preset Tier Cards */}
              <View style={styles.cardsRow}>
                {/* 10% off card */}
                <Pressable
                  onPress={() => handleSelectCard('tier10')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: isDark ? theme.panel : '#FFFFFF',
                      borderColor: selectedCard === 'tier10' ? TEAL_BRAND : isDark ? theme.border : '#E5E7EB',
                      borderWidth: selectedCard === 'tier10' ? 2 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`10% off: ${formatPrice(preset10)}`}
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                    ]}
                  >
                    {formatPrice(preset10)}
                  </Text>
                  <Text style={[styles.cardBottomText, { color: TEAL_BRAND, fontFamily: type.family.sansMedium }]}>
                    10% off
                  </Text>
                </Pressable>

                {/* 20% off card */}
                <Pressable
                  onPress={() => handleSelectCard('tier20')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: isDark ? theme.panel : '#FFFFFF',
                      borderColor: selectedCard === 'tier20' ? TEAL_BRAND : isDark ? theme.border : '#E5E7EB',
                      borderWidth: selectedCard === 'tier20' ? 2 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`20% off: ${formatPrice(preset20)}`}
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                    ]}
                  >
                    {formatPrice(preset20)}
                  </Text>
                  <Text style={[styles.cardBottomText, { color: TEAL_BRAND, fontFamily: type.family.sansMedium }]}>
                    20% off
                  </Text>
                </Pressable>

                {/* Custom card */}
                <Pressable
                  onPress={() => handleSelectCard('custom')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: isDark ? theme.panel : '#FFFFFF',
                      borderColor: selectedCard === 'custom' ? TEAL_BRAND : isDark ? theme.border : '#E5E7EB',
                      borderWidth: selectedCard === 'custom' ? 2 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Custom set a price"
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: isDark ? theme.ink : '#15191A', fontFamily: type.family.sansBold },
                    ]}
                  >
                    Custom
                  </Text>
                  <Text style={[styles.cardBottomText, { color: TEAL_BRAND, fontFamily: type.family.sansMedium }]}>
                    Set a price
                  </Text>
                </Pressable>
              </View>

              {/* Input Section with underline */}
              <Pressable
                onPress={() => {
                  setSelectedCard('custom');
                  amountRef.current?.focus?.();
                }}
                style={styles.inputSection}
              >
                <View style={styles.displayRow}>
                  <TextInput
                    ref={amountRef}
                    value={amount}
                    onChangeText={handleCustomChange}
                    placeholder="0"
                    placeholderTextColor={isDark ? theme.mute : '#9CA3AF'}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    style={[
                      styles.amountInput,
                      {
                        color: isDark ? theme.ink : '#15191A',
                        fontFamily: type.family.sansBold,
                      },
                    ]}
                  />
                </View>

                {/* Underline */}
                <View
                  style={[
                    styles.underline,
                    {
                      backgroundColor:
                        selectedCard === 'custom'
                          ? TEAL_BRAND
                          : isDark
                          ? '#4B5563'
                          : '#6B7280',
                    },
                  ]}
                />

                {/* Fee breakdown helper text */}
                <Text style={[styles.feeHelperText, { color: isDark ? theme.mute : '#5A6566' }]}>
                  {amountNum > 0
                    ? `${formatPrice(totalWithProtection)} incl. Buyer Protection fee`
                    : `incl. Buyer Protection fee`}
                </Text>
              </Pressable>

              {/* Action Button: "Offer $15.00" */}
              <View style={styles.actionButtonContainer}>
                <Pressable
                  onPress={handleSend}
                  disabled={!offerValid || sending}
                  style={({ pressed }) => [
                    styles.actionButton,
                    {
                      backgroundColor: TEAL_BRAND,
                      opacity: !offerValid || sending ? 0.5 : pressed ? 0.88 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    amountNum > 0 ? `Offer ${formatPrice(amountNum)}` : 'Make an offer'
                  }
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { fontFamily: type.family.sansBold },
                    ]}
                  >
                    {sending
                      ? 'Sending offer…'
                      : amountNum > 0
                      ? `Offer ${formatPrice(amountNum)}`
                      : 'Make an offer'}
                  </Text>
                </Pressable>
              </View>

              {/* Subtext: "25 offers left for today. Learn why." */}
              <View style={styles.limitRow}>
                <Text style={[styles.limitText, { color: isDark ? theme.mute : '#5A6566' }]}>
                  25 offers left for today.{' '}
                </Text>
                <Pressable onPress={handleLearnWhy} hitSlop={6}>
                  <Text style={styles.learnWhyText}>Learn why.</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {/* Message mode */}
              <View style={{ marginTop: 16 }}>
                <Eyebrow>Your message</Eyebrow>
                <View
                  style={{
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    minHeight: compact ? 120 : 140,
                    backgroundColor: isDark ? theme.panel : colors.surface,
                    borderWidth: 1,
                    borderColor: isDark ? theme.border : colors.border,
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
                      color: isDark ? theme.ink : colors.ink,
                      padding: 0,
                      minHeight: compact ? 100 : 120,
                    }}
                  />
                </View>
              </View>

              {/* Quick replies */}
              <View style={{ marginTop: 20 }}>
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
                          borderColor: active ? TEAL_BRAND : isDark ? theme.border : colors.border,
                          backgroundColor: active ? TEAL_BRAND : isDark ? theme.panel : colors.surface,
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontFamily: type.family.sansSemibold,
                            color: active ? '#FFFFFF' : isDark ? theme.ink : colors.ink,
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

              {/* Message Send Button */}
              <View style={{ marginTop: 24 }}>
                <Pressable
                  onPress={handleSend}
                  disabled={!msgValid || sending}
                  style={({ pressed }) => [
                    styles.actionButton,
                    {
                      backgroundColor: TEAL_BRAND,
                      opacity: !msgValid || sending ? 0.5 : pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { fontFamily: type.family.sansBold },
                    ]}
                  >
                    {sending ? 'Sending message…' : 'Send message'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 50,
  },
  closeText: {
    fontSize: 16,
    color: '#15191A',
  },
  headerTitle: {
    fontSize: 17,
    color: '#15191A',
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 50,
  },
  modeSwitchBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 50,
    alignItems: 'flex-end',
  },
  modeSwitchText: {
    fontSize: 15,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  itemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 16,
    color: '#15191A',
    marginBottom: 3,
  },
  itemPrice: {
    fontSize: 14,
    color: '#5A6566',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  presetCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTopText: {
    fontSize: 15,
    color: '#15191A',
    marginBottom: 2,
    textAlign: 'center',
  },
  cardBottomText: {
    fontSize: 12.5,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 20,
  },
  displayRow: {
    paddingVertical: 2,
  },
  amountInput: {
    fontSize: 24,
    color: '#15191A',
    padding: 0,
    margin: 0,
    height: 34,
  },
  underline: {
    height: 1.5,
    backgroundColor: '#6B7280',
    marginTop: 4,
    marginBottom: 6,
    width: '100%',
  },
  feeHelperText: {
    fontSize: 13,
    color: '#5A6566',
  },
  actionButtonContainer: {
    marginBottom: 12,
  },
  actionButton: {
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  limitText: {
    fontSize: 13,
    color: '#5A6566',
  },
  learnWhyText: {
    fontSize: 13,
    color: TEAL_BRAND,
    textDecorationLine: 'underline',
  },
});
