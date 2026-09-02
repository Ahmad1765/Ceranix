import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, router, Redirect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { useListingQuery } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { supabase } from '@/lib/supabase';
import { buyerProtectionFee, formatPrice, shippingFee } from '@/lib/fees';
import { computeBundlePricing } from '@/lib/bundle';
import { AddressSheet, type AddressForm } from '@/components/settings/AddressSheet';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import {
  PaymentOptionsModal,
  type PaymentMethodOption,
  type SelectedPaymentMethod,
} from '@/components/payment/PaymentOptionsModal';
import { paymentService, normalizeAddressInput } from '@/lib/paymentService';
import { ShippingAddressSchema } from '@/lib/schemas/order';
import { getOrCreateConversation } from '@/lib/chat';
import { setListingSold, SELECT_LISTING_WITH_SELLER } from '@/lib/listings';
import type { ShippingAddress, Listing } from '@/types';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

export default function PaymentScreen() {
  const { theme, isDark } = useTheme();
  const {
    id,
    offer,
    bundle_ids,
    bundle_total,
    fulfillment: fulfillmentParam,
    paymentMethod: paymentMethodParam,
  } = useLocalSearchParams<{
    id: string;
    offer?: string;
    bundle_ids?: string;
    bundle_total?: string;
    fulfillment?: string;
    paymentMethod?: string;
  }>();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();

  const listingQ = useListingQuery(id ? String(id) : null);
  const listing = listingQ.data ?? null;

  const bundleIdsParam = typeof bundle_ids === 'string' ? bundle_ids : '';
  const bundleItemIds = useMemo(
    () => bundleIdsParam.split(',').filter(Boolean),
    [bundleIdsParam],
  );
  const isBundle = bundleItemIds.length > 0;

  const [bundledListings, setBundledListings] = useState<Listing[]>([]);
  const [bundleFetchStatus, setBundleFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    isBundle ? 'loading' : 'idle',
  );
  const [bundleFetchError, setBundleFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (bundleItemIds.length === 0) {
      setBundledListings([]);
      setBundleFetchStatus('idle');
      setBundleFetchError(null);
      return;
    }
    let active = true;
    setBundleFetchStatus('loading');
    setBundleFetchError(null);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select(SELECT_LISTING_WITH_SELLER)
          .in('id', bundleItemIds);

        if (!active) return;

        if (error) {
          console.warn('[payment] Error fetching bundle listings', error.message);
          setBundleFetchStatus('error');
          setBundleFetchError(error.message || 'Failed to load bundle listings.');
          toast.show('Failed to load bundle items. Please try again.', {
            variant: 'default',
            icon: 'alert-triangle',
          });
          return;
        }

        const rows = (data as unknown as Listing[]) ?? [];
        if (rows.length !== bundleItemIds.length) {
          setBundleFetchStatus('error');
          setBundleFetchError('One or more bundled items are no longer available.');
          toast.show('Some items in this bundle are no longer available.', {
            variant: 'default',
            icon: 'alert-triangle',
          });
          return;
        }

        setBundledListings(rows);
        setBundleFetchStatus('success');
      } catch (err: any) {
        if (!active) return;
        setBundleFetchStatus('error');
        setBundleFetchError(err?.message || 'Error loading bundle items.');
        toast.show('Error loading bundle items.', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [bundleIdsParam, bundleItemIds, toast]);

  const allOrderItems = useMemo(
    () => (listing ? [listing, ...bundledListings] : []),
    [listing, bundledListings],
  );

  // Checkout states
  const initialMethod: PaymentMethodOption =
    paymentMethodParam === 'cod' || paymentMethodParam === 'apple_pay' || paymentMethodParam === 'card'
      ? paymentMethodParam
      : 'card';
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodOption>(initialMethod);
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(true);
  const [hasChosenMethod, setHasChosenMethod] = useState(
    Boolean(paymentMethodParam && paymentMethodParam !== 'card'),
  );
  const [fulfillment, setFulfillment] = useState<string>(fulfillmentParam || 'delivery');

  useEffect(() => {
    if (paymentMethodParam === 'cod' || paymentMethodParam === 'apple_pay') {
      setSelectedMethod(paymentMethodParam);
      setHasChosenMethod(true);
    } else if (paymentMethodParam === 'card') {
      setSelectedMethod('card');
      setHasChosenMethod(Boolean(cardLast4));
    }
  }, [paymentMethodParam, cardLast4]);

  useEffect(() => {
    if (fulfillmentParam) {
      setFulfillment(fulfillmentParam);
    }
  }, [fulfillmentParam]);

  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);
  const [bpSheetOpen, setBpSheetOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  // Fetch buyer's default shipping address
  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('shipping_addresses')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_default', true)
          .maybeSingle();

        if (active) {
          if (!error && data) {
            setShippingAddress(data as ShippingAddress);
          } else {
            const { data: anyAddr } = await supabase
              .from('shipping_addresses')
              .select('*')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();
            if (active && anyAddr) {
              setShippingAddress(anyAddr as ShippingAddress);
            }
          }
        }
      } catch {
        // ignore address fetch errors
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id, profile]);

  const offerAmount = (() => {
    const n = Number(offer);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  })();

  const bundleCalculation = useMemo(() => {
    if (!listing) return null;
    const addOnPrices = bundledListings.map((b) => Number(b.price ?? 0));
    return computeBundlePricing(listing.price, addOnPrices, listing.seller?.bundle_discount_pct);
  }, [listing, bundledListings]);

  const bundleSavings = bundleCalculation?.savings ?? 0;
  const bundleSubtotal = bundleCalculation?.subtotal ?? Number(listing?.price ?? 0);
  const bundleDiscountPct = bundleCalculation?.pct ?? 0;

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator color={theme.purple} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return <Redirect href="/auth/login" />;
  }

  if (!listing && id && listingQ.isPending) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator color={theme.purple} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Feather name="alert-circle" size={32} color={theme.mute} />
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.ink, marginTop: 12, fontFamily: typography.family.sansBold }}>Item unavailable</Text>
        <Pressable
          onPress={() => safeBack()}
          style={{
            marginTop: 16,
            height: 44,
            borderRadius: 10,
            paddingHorizontal: 20,
            backgroundColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: theme.background, fontWeight: '700', fontSize: 14, fontFamily: typography.family.sansBold }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Price breakdown calculations
  const explicitBundleTotal = bundle_total ? Number(bundle_total) : null;
  const itemPrice =
    offerAmount ??
    (isBundle
      ? explicitBundleTotal && explicitBundleTotal > 0
        ? explicitBundleTotal
        : bundleCalculation?.total ?? Number(listing.price ?? 0)
      : Number(listing.price ?? 0));

  const bpFee = buyerProtectionFee(itemPrice);
  const deliveryFee = fulfillment === 'handshake' ? 0 : shippingFee(itemPrice);
  const salesTax = 0;
  const totalAmount = Math.round((itemPrice + bpFee + deliveryFee + salesTax) * 100) / 100;

  const handleSaveAddress = async (form: AddressForm) => {
    let validated: any;
    try {
      const normalized = normalizeAddressInput(form);
      validated = ShippingAddressSchema.parse(normalized);
    } catch {
      toast.show('Please fill in required address fields', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }

    const payload = {
      user_id: user.id,
      recipient_name: validated.recipientName.trim(),
      line1: validated.line1.trim(),
      line2: validated.line2?.trim() || null,
      city: validated.city.trim(),
      state: validated.state?.trim() || null,
      postal_code: validated.postalCode.trim(),
      country: validated.country.trim(),
      phone: validated.phone?.trim() || null,
      is_default: true,
    };

    const previousAddress = shippingAddress;
    const mockAddress: ShippingAddress = {
      id: `mock_addr_${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setShippingAddress(mockAddress);
    setAddressSheetOpen(false);

    try {
      const { data, error } = await (supabase
        .from('shipping_addresses')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single() as any);

      if (error) {
        throw error;
      }
      if (data) {
        setShippingAddress(data as ShippingAddress);
      }
      toast.show('Shipping address saved', { variant: 'default', icon: 'check' });
    } catch (err: any) {
      setShippingAddress(previousAddress);
      toast.show(err?.message || 'Could not save address. Please try again.', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  };

  const handleSelectPaymentMethod = (selected: SelectedPaymentMethod) => {
    setSelectedMethod(selected.method);
    if (selected.cardBrand) setCardBrand(selected.cardBrand);
    if (selected.cardLast4) setCardLast4(selected.cardLast4);
    if (selected.saveCard !== undefined) setSaveCard(selected.saveCard);
    if (selected.method !== 'card' || selected.cardLast4) {
      setHasChosenMethod(true);
    }
    setPaymentOptionsOpen(false);
  };

  const handlePay = async () => {
    if (paying) return;

    if (isBundle && bundleFetchStatus !== 'success') {
      toast.show(
        bundleFetchStatus === 'error'
          ? (bundleFetchError || 'Unable to checkout: some bundle items could not be loaded.')
          : 'Please wait for bundle items to load.',
        {
          variant: 'default',
          icon: 'alert-circle',
        },
      );
      return;
    }

    if (!shippingAddress) {
      toast.show('Please confirm your delivery address', {
        variant: 'default',
        icon: 'map-pin',
      });
      setAddressSheetOpen(true);
      return;
    }

    const isMethodReady = hasChosenMethod && (selectedMethod !== 'card' || Boolean(cardLast4));
    if (!isMethodReady) {
      toast.show('Please choose a payment method', {
        variant: 'default',
        icon: 'credit-card',
      });
      setPaymentOptionsOpen(true);
      return;
    }

    tap('medium');
    setPaying(true);

    try {
      const result = await paymentService.checkout({
        listingId: String(listing.id),
        paymentMethod: selectedMethod === 'cod' ? 'cod' : 'card',
        buyerId: user.id,
        sellerId: listing.seller_id,
        listingPrice: Number(listing.price),
        offerAmount: itemPrice,
        shippingAddress,
      });

      // Mark all items sold
      const allItemIds = [String(listing.id), ...bundleItemIds];
      try {
        await Promise.all(
          allItemIds.map(async (itemId) => {
            try {
              await setListingSold(itemId, true);
            } catch {
              // ignore
            }
          }),
        );
      } catch {
        // ignore fallback
      }

      const isPaid = result.status === 'paid';
      const allTitles = allOrderItems.map((item) => item.title).filter(Boolean);
      const orderMessageContent =
        isBundle && allTitles.length > 1
          ? `Done!\nThank you, your order for a ${allTitles.length}-item bundle (${allTitles.join(', ')}) has been received.`
          : isPaid
            ? "Done!\nThank you, we have received your payment. It's being processed."
            : "Done!\nYour order has been placed. It's being processed.";

      try {
        const conv = await getOrCreateConversation({
          buyerId: user.id,
          sellerId: listing.seller_id,
          listingId: listing.id,
        });
        if (conv?.id) {
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            sender_id: user.id,
            content: orderMessageContent,
            kind: 'system',
            metadata: {
              paid: isPaid,
              payment_status: isPaid ? 'paid' : result.status,
              order_status: result.status,
              amount: totalAmount,
              is_bundle: isBundle,
              bundle_item_ids: isBundle ? bundleItemIds : null,
            },
          });
        }
      } catch {
        // chat confirmation fallback
      }

      router.replace({
        pathname: '/orders',
        params: {
          side: 'bought',
          justPaid: isPaid ? '1' : '0',
          title: isBundle && allTitles.length > 1 ? `Bundle (${allTitles.length} items)` : listing.title,
          amount: String(totalAmount),
        },
      } as any);
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not complete payment', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setPaying(false);
    }
  };

  const imageUrl = listing
    ? getOptimizedImageUrl(cardImageUrl(listing, 0), { width: 240 })
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [
            {
              width: 36,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Feather name="x" size={22} color={theme.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
          {isBundle ? 'Bundle Checkout' : 'Payment'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        {isBundle ? (
          <View style={{ marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Feather name="package" size={16} color={theme.purple} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink, fontFamily: typography.family.sansBold }}>
                Bundle ({1 + bundleItemIds.length} items)
              </Text>
            </View>
            {bundleFetchStatus === 'loading' ? (
              <View style={{ paddingVertical: 20, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.purple} />
                <Text style={{ fontSize: 13, color: theme.mute, marginTop: 8 }}>Loading bundle items...</Text>
              </View>
            ) : bundleFetchStatus === 'error' ? (
              <View
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                  borderWidth: 1,
                  borderColor: isDark ? '#EF4444' : '#FCA5A5',
                }}
              >
                <Text style={{ fontSize: 13, color: isDark ? '#FCA5A5' : '#991B1B', fontWeight: '600' }}>
                  {bundleFetchError || 'Could not load bundle items. Please go back and try again.'}
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {allOrderItems.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      width: 130,
                      padding: 8,
                      borderRadius: 12,
                      backgroundColor: theme.panel,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Image
                      source={{ uri: getOptimizedImageUrl(cardImageUrl(item, 0), { width: 260 }) }}
                      style={{ width: '100%', height: 100, borderRadius: 8, backgroundColor: theme.panel }}
                      contentFit="cover"
                    />
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: theme.ink, marginTop: 6 }}>
                      {item.brand || item.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.mute, marginTop: 2 }}>
                      {formatPrice(Number(item.price ?? 0))}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 8,
                  backgroundColor: theme.panel,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={IMAGE_TRANSITION}
              />
            ) : (
              <View
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 8,
                  backgroundColor: theme.panel,
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="image" size={24} color={theme.mute} />
              </View>
            )}
          </View>
        )}

        <View style={{ marginBottom: 20 }}>
          {isBundle && !offerAmount ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4.5 }}>
                <Text style={{ fontSize: 14, color: theme.mute, fontFamily: typography.family.sans }}>
                  Subtotal ({allOrderItems.length} items)
                </Text>
                <Text style={{ fontSize: 14, color: theme.ink, fontFamily: typography.family.sansMedium }}>
                  {formatPrice(bundleSubtotal)}
                </Text>
              </View>
              {bundleSavings > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4.5 }}>
                  <Text style={{ fontSize: 14, color: theme.purple, fontFamily: typography.family.sansBold }}>
                    Bundle discount ({bundleDiscountPct}%)
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.purple, fontFamily: typography.family.sansBold }}>
                    − {formatPrice(bundleSavings)}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4.5 }}>
              <Text style={{ fontSize: 14, color: theme.mute, fontFamily: typography.family.sans }}>
                {offerAmount ? (isBundle ? 'Bundle offer' : 'Offer price') : 'Order'}
              </Text>
              <Text style={{ fontSize: 14, color: theme.ink, fontFamily: typography.family.sansMedium }}>
                {formatPrice(itemPrice)}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4.5 }}>
            <Pressable
              onPress={() => setBpSheetOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center' }}
              hitSlop={6}
            >
              <Text style={{ fontSize: 14, color: theme.mute, fontFamily: typography.family.sans }}>Buyer protection fee</Text>
              <Feather name="info" size={13} color={theme.muteSoft} style={{ marginLeft: 4 }} />
            </Pressable>
            <Text style={[{ fontSize: 14, color: theme.ink, fontFamily: typography.family.sansMedium }, bpFee === 0 && { color: '#10B981', fontWeight: '600' }]}>
              {bpFee > 0 ? formatPrice(bpFee) : 'Free'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4.5 }}>
            <Text style={{ fontSize: 14, color: theme.mute, fontFamily: typography.family.sans }}>Shipping</Text>
            <Text style={[{ fontSize: 14, color: theme.ink, fontFamily: typography.family.sansMedium }, deliveryFee === 0 && { color: '#10B981', fontWeight: '600' }]}>
              {deliveryFee > 0 ? formatPrice(deliveryFee) : 'Free'}
            </Text>
          </View>

          {salesTax > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4.5 }}>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Sales Tax',
                    'Standard state and local sales tax calculated based on your shipping address.',
                  )
                }
                style={{ flexDirection: 'row', alignItems: 'center' }}
                hitSlop={6}
              >
                <Text style={{ fontSize: 14, color: theme.mute, fontFamily: typography.family.sans }}>Sales tax</Text>
                <Feather name="info" size={13} color={theme.muteSoft} style={{ marginLeft: 4 }} />
              </Pressable>
              <Text style={{ fontSize: 14, color: theme.ink, fontFamily: typography.family.sansMedium }}>{formatPrice(salesTax)}</Text>
            </View>
          ) : null}

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 10 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>Total to pay</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>{formatPrice(totalAmount)}</Text>
          </View>
        </View>

        {/* ── Section: Address ── */}
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.muteSoft, fontFamily: typography.family.sansSemibold, marginBottom: 8 }}>
            Address
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold, marginBottom: 2 }}>
                {shippingAddress?.recipient_name || profile?.full_name || ''}
              </Text>
              <Text style={{ fontSize: 13.5, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 18 }}>
                {shippingAddress?.line1 || ''}
              </Text>
              <Text style={{ fontSize: 13.5, color: theme.mute, fontFamily: typography.family.sans }}>
                {shippingAddress
                  ? `${shippingAddress.postal_code || ''} ${shippingAddress.city || ''}${
                      shippingAddress.state ? `, ${shippingAddress.state}` : ''
                    }`.trim()
                  : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => setAddressSheetOpen(true)}
              hitSlop={HIT_SLOP_8}
              accessibilityRole="button"
              accessibilityLabel="Edit shipping address"
              style={({ pressed }) => [
                {
                  width: 32,
                  height: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Feather name="edit-2" size={18} color={theme.mute} />
            </Pressable>
          </View>
        </View>

        {/* ── Section: Delivery details ── */}
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.muteSoft, fontFamily: typography.family.sansSemibold, marginBottom: 8 }}>
            Delivery details
          </Text>
          <View style={{ paddingVertical: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    backgroundColor: theme.purple,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 8,
                  }}
                >
                  <Feather name={fulfillment === 'handshake' ? 'map-pin' : 'package'} size={14} color="#FFFFFF" />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                  {fulfillment === 'handshake' ? 'In-Person Meetup (Handshake)' : 'Standard Delivery'}
                </Text>
              </View>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }, deliveryFee === 0 && { color: '#10B981', fontWeight: '600' }]}>
                {deliveryFee > 0 ? formatPrice(deliveryFee) : 'Free'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <Feather name="clock" size={13} color={theme.muteSoft} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 13, color: theme.mute, fontFamily: typography.family.sans }}>
                {fulfillment === 'handshake' ? 'Meet seller directly in public safe zone' : 'Home delivery, 1 - 3 business days'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Section: Payment ── */}
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.muteSoft, fontFamily: typography.family.sansSemibold, marginBottom: 8 }}>
            Payment
          </Text>

          {!hasChosenMethod || (selectedMethod === 'card' && !cardLast4) ? (
            /* Choose Payment Method Row */
            <Pressable
              onPress={() => setPaymentOptionsOpen(true)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>
                Choose payment method
              </Text>
              <Feather name="plus" size={20} color={theme.ink} />
            </Pressable>
          ) : (
            /* Selected Payment Method Card */
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {selectedMethod === 'card' ? (
                    <>
                      <View
                        style={{
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          borderRadius: 3,
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: '#E0E0E0',
                          marginRight: 10,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '900', color: '#1A1F71', fontStyle: 'italic' }}>
                          {(cardBrand ?? 'VISA').toUpperCase()}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>
                        {cardBrand || 'Card'} ending with {cardLast4}
                      </Text>
                    </>
                  ) : selectedMethod === 'apple_pay' ? (
                    <>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          borderRadius: 3,
                          backgroundColor: isDark ? '#000000' : '#FFFFFF',
                          borderWidth: 1,
                          borderColor: isDark ? theme.border : '#111111',
                          marginRight: 10,
                        }}
                      >
                        <Ionicons name="logo-apple" size={13} color={isDark ? '#FFFFFF' : '#000000'} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#FFFFFF' : '#000000', marginLeft: 2 }}>Pay</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>Apple Pay</Text>
                    </>
                  ) : (
                    <>
                      <Feather name="package" size={16} color={theme.ink} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>Cash on Delivery</Text>
                    </>
                  )}
                </View>
                <Pressable
                  onPress={() => setPaymentOptionsOpen(true)}
                  hitSlop={HIT_SLOP_8}
                  style={({ pressed }) => [
                    {
                      width: 32,
                      height: 32,
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Feather name="edit-2" size={18} color={theme.mute} />
                </Pressable>
              </View>

              {/* Save Card Checkbox Container */}
              {selectedMethod === 'card' && (
                <View
                  style={{
                    backgroundColor: theme.purpleSoft,
                    borderRadius: 8,
                    padding: 12,
                    marginTop: 10,
                  }}
                >
                  <Pressable
                    onPress={() => {
                      tap('light');
                      setSaveCard(!saveCard);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'flex-start' }}
                  >
                    <View
                      style={[
                        {
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          borderWidth: 1.5,
                          borderColor: theme.border,
                          backgroundColor: theme.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 1,
                        },
                        saveCard && { backgroundColor: theme.purple, borderColor: theme.purple },
                      ]}
                    >
                      {saveCard && <Feather name="check" size={12} color="#FFFFFF" />}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>
                        Save card details for future payments
                      </Text>
                      <Text style={{ fontSize: 11.5, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2, lineHeight: 15 }}>
                        You can remove the card anytime in Settings, under Payments.
                      </Text>
                    </View>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed Footer: Trust Note + Pay Button ── */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 12 : 18,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Feather name="lock" size={11} color={theme.muteSoft} style={{ marginRight: 5 }} />
          <Text style={{ fontSize: 11.5, color: theme.muteSoft, fontFamily: typography.family.sans }}>
            This is a secure encrypted payment
          </Text>
        </View>

        <Pressable
          onPress={handlePay}
          disabled={paying || (isBundle && bundleFetchStatus !== 'success')}
          style={({ pressed }) => {
            const isBlocked = paying || (isBundle && bundleFetchStatus !== 'success');
            return [
              {
                height: 48,
                backgroundColor: isBlocked && !paying ? (isDark ? '#374151' : '#D1D5DB') : theme.purple,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
              },
              (pressed || paying) && !isBlocked && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ];
          }}
        >
          {paying ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', fontFamily: typography.family.sansBold, letterSpacing: 0.2 }}>
              {isBundle && bundleFetchStatus === 'loading' ? 'Loading bundle...' : 'Pay'}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Address Edit Sheet */}
      <AddressSheet
        visible={addressSheetOpen}
        onClose={() => setAddressSheetOpen(false)}
        onSave={handleSaveAddress}
        initial={shippingAddress}
      />

      {/* Payment Options Selection Modal */}
      <PaymentOptionsModal
        visible={paymentOptionsOpen}
        onClose={() => setPaymentOptionsOpen(false)}
        selectedMethod={selectedMethod}
        onSelect={handleSelectPaymentMethod}
      />

      {/* Buyer Protection Breakdown Sheet */}
      <BuyerProtectionSheet
        visible={bpSheetOpen}
        itemPrice={itemPrice}
        onClose={() => setBpSheetOpen(false)}
      />
    </SafeAreaView>
  );
}
