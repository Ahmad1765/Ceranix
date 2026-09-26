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
import { type as typography, radii } from '@/lib/theme';
import { useListingQuery } from '@/lib/queries';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queries/keys';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { supabase } from '@/lib/supabase';
import { buyerProtectionFee, formatPrice, getParcelDeliveryFee } from '@/lib/fees';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import {
  computeBundlePricing,
  sanitizeBundleItemIds,
  computeCheckoutItemPrice,
} from '@/lib/bundle';
import { AddressSheet, type AddressForm } from '@/components/settings/AddressSheet';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import {
  PaymentOptionsModal,
  type PaymentMethodOption,
  type SelectedPaymentMethod,
} from '@/components/payment/PaymentOptionsModal';
import { paymentService, normalizeAddressInput } from '@/lib/paymentService';
import { ShippingAddressSchema } from '@/lib/schemas/order';
import { getOrCreateConversation, cancelBundleOffersForSoldItem } from '@/lib/chat';
import { SELECT_LISTING_WITH_SELLER } from '@/lib/listings';
import type { ShippingAddress, Listing, ShippingMethod } from '@/types';

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
    fulfillment: fulfillmentParam,
    paymentMethod: paymentMethodParam,
  } = useLocalSearchParams<{
    id: string;
    offer?: string;
    bundle_ids?: string;
    fulfillment?: string;
    paymentMethod?: string;
  }>();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();

  const listingQ = useListingQuery(id ? String(id) : null);
  const listing = listingQ.data ?? null;

  const bundleIdsParam = typeof bundle_ids === 'string' ? bundle_ids : '';
  const bundleItemIds = useMemo(
    () => sanitizeBundleItemIds(bundleIdsParam, id, listing?.id),
    [bundleIdsParam, id, listing?.id],
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
    if (!listing?.seller_id) return;

    let active = true;
    setBundleFetchStatus('loading');
    setBundleFetchError(null);

    (async () => {
      try {
        const queryIds = bundleItemIds.filter((itemId) => itemId !== String(listing.id || id));
        const { data, error } = await supabase
          .from('listings')
          .select(SELECT_LISTING_WITH_SELLER)
          .in('id', queryIds)
          .eq('seller_id', listing.seller_id)
          .eq('is_sold', false);

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
  }, [bundleIdsParam, bundleItemIds, listing?.seller_id, listing?.id, id, toast]);

  const allOrderItems = useMemo(
    () => (listing ? [listing, ...bundledListings] : []),
    [listing, bundledListings],
  );

  // Checkout states
  const initialMethod: PaymentMethodOption =
    paymentMethodParam === 'cod' ||
    paymentMethodParam === 'apple_pay' ||
    paymentMethodParam === 'card' ||
    paymentMethodParam === 'jazzcash' ||
    paymentMethodParam === 'easypaisa'
      ? (paymentMethodParam as PaymentMethodOption)
      : 'card';
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodOption>(initialMethod);
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [walletNumber, setWalletNumber] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(true);
  const [hasChosenMethod, setHasChosenMethod] = useState(
    Boolean(paymentMethodParam && paymentMethodParam !== 'card'),
  );
  const [fulfillment, setFulfillment] = useState<string>(fulfillmentParam || 'delivery');
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('managed');

  useEffect(() => {
    if (
      paymentMethodParam === 'cod' ||
      paymentMethodParam === 'apple_pay' ||
      paymentMethodParam === 'jazzcash' ||
      paymentMethodParam === 'easypaisa'
    ) {
      setSelectedMethod(paymentMethodParam as PaymentMethodOption);
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
  const itemPrice = computeCheckoutItemPrice({
    offerAmount,
    isBundle,
    bundleCalculationTotal: bundleCalculation?.total,
    listingPrice: Number(listing.price ?? 0),
  });

  const parcelSize = listing?.parcel_size || 'medium';
  const bpFee = buyerProtectionFee(itemPrice);
  const deliveryFee = fulfillment === 'handshake' ? 0 : getParcelDeliveryFee(parcelSize);
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
      const isRealUuid =
        Boolean(previousAddress?.id) &&
        !previousAddress!.id.startsWith('mock_') &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previousAddress!.id);

      const rpcPayload = isRealUuid ? { ...payload, id: previousAddress!.id } : payload;

      let savedAddress: ShippingAddress | null = null;

      // Primary: Canonical atomic RPC that unsets prior default and updates/inserts
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'upsert_shipping_address_with_default',
        { p_payload: rpcPayload }
      );

      if (!rpcError && rpcData) {
        savedAddress = rpcData as ShippingAddress;
      } else {
        // Fallback: Direct table operations if RPC is unavailable in current database
        // Clear prior default to satisfy partial unique index shipping_addresses_one_default_idx
        await supabase
          .from('shipping_addresses')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true);

        if (isRealUuid) {
          const { data: updateData, error: updateError } = await (supabase
            .from('shipping_addresses')
            .update(payload)
            .eq('id', previousAddress!.id)
            .eq('user_id', user.id)
            .select()
            .single() as any);

          if (updateError) throw updateError;
          savedAddress = updateData as ShippingAddress;
        } else {
          const { data: insertData, error: insertError } = await (supabase
            .from('shipping_addresses')
            .insert(payload)
            .select()
            .single() as any);

          if (insertError) throw insertError;
          savedAddress = insertData as ShippingAddress;
        }
      }

      if (savedAddress) {
        setShippingAddress(savedAddress);
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
    if (selected.walletNumber) setWalletNumber(selected.walletNumber);
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

    if (fulfillment !== 'handshake') {
      if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.phone) {
        toast.show('Please provide a complete delivery address with phone number', {
          variant: 'default',
          icon: 'map-pin',
        });
        setAddressSheetOpen(true);
        return;
      }

      const cleanPhone = (shippingAddress.phone || '').replace(/[\s\-\(\)]/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        toast.show('Please enter a valid contact phone number (10 to 15 digits)', {
          variant: 'default',
          icon: 'phone',
        });
        setAddressSheetOpen(true);
        return;
      }
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
        bundleItemIds: isBundle ? bundleItemIds : undefined,
        paymentMethod: selectedMethod === 'cod' ? 'cod' : 'card',
        buyerId: user.id,
        sellerId: listing.seller_id,
        listingPrice: Number(listing.price),
        offerAmount: itemPrice,
        shippingAddress,
        shippingMethod: 'managed',
      });

      if (!result.success) {
        throw new Error(result.error || result.message || 'Checkout failed');
      }

      // Update local query cache and feed queries to immediately reflect atomic server transaction sold state
      const allItemIds = Array.from(new Set([String(listing.id), ...bundleItemIds]));
      allItemIds.forEach((itemId) => {
        queryClient.setQueryData<Listing>(qk.listing(itemId), (old) =>
          old ? { ...old, is_sold: true } : old,
        );
        queryClient.invalidateQueries({ queryKey: qk.listing(itemId) });
        cancelBundleOffersForSoldItem(itemId).catch(() => {});
      });
      queryClient.invalidateQueries({ queryKey: ['myOrders'] });
      queryClient.invalidateQueries({ queryKey: ['feedListings'] });
      queryClient.invalidateQueries({ queryKey: ['homeFeed'] });

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
              bundle_item_ids: isBundle ? bundleItemIds : undefined,
            },
          });
        }
      } catch {
        // chat confirmation fallback
      }

      router.replace({
        pathname: '/(tabs)/chat',
        params: {
          tab: 'orders',
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
      {/* ── Top Header ── */}
      <View
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12,
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            alignSelf: 'center',
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
            {isBundle ? 'Bundle Checkout' : 'Checkout'}
          </Text>
          <View style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheckIcon size={20} />
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 36,
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          alignSelf: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Card 1: Item / Bundle Summary ── */}
        {isBundle ? (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Feather name="package" size={16} color={theme.purple} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
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
                      width: 120,
                      padding: 8,
                      borderRadius: 12,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Image
                      source={{ uri: getOptimizedImageUrl(cardImageUrl(item, 0), { width: 240 }) }}
                      style={{ width: '100%', height: 90, borderRadius: 8, backgroundColor: theme.surface }}
                      contentFit="cover"
                    />
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: theme.ink, marginTop: 6, fontFamily: typography.family.sansBold }}>
                      {item.brand || item.title}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: theme.mute, marginTop: 2, fontFamily: typography.family.sansMedium }}>
                      {formatPrice(Number(item.price ?? 0))}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 14,
              marginBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 10,
                  backgroundColor: theme.surface,
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
                  width: 68,
                  height: 68,
                  borderRadius: 10,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="image" size={22} color={theme.mute} />
              </View>
            )}

            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  marginBottom: 3,
                }}
              >
                {listing.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {listing.brand ? (
                  <Text style={{ fontSize: 13, color: theme.mute, fontFamily: typography.family.sans }}>
                    {listing.brand}
                  </Text>
                ) : null}
                {listing.brand && listing.size ? (
                  <Text style={{ fontSize: 13, color: theme.muteSoft }}>·</Text>
                ) : null}
                {listing.size ? (
                  <Text style={{ fontSize: 13, color: theme.mute, fontFamily: typography.family.sans }}>
                    {listing.size}
                  </Text>
                ) : null}
              </View>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  marginTop: 4,
                }}
              >
                {formatPrice(itemPrice)}
              </Text>
            </View>
          </View>
        )}

        {/* ── Card 2: Delivery Address (Working Field) ── */}
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
            marginBottom: 14,
          }}
        >
          {/* Header Row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 10,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="map-pin" size={16} color={theme.purple} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                }}
              >
                Delivery address
              </Text>
            </View>
            <Pressable
              onPress={() => setAddressSheetOpen(true)}
              hitSlop={HIT_SLOP_8}
              accessibilityRole="button"
              accessibilityLabel="Change delivery address"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: theme.purple,
                  fontFamily: typography.family.sansBold,
                }}
              >
                {shippingAddress?.line1 ? 'Edit' : 'Add'}
              </Text>
            </Pressable>
          </View>

          {/* Interactive Card Body */}
          <Pressable
            onPress={() => setAddressSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit address"
            style={({ pressed }) => [
              {
                paddingHorizontal: 16,
                paddingVertical: 14,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            {shippingAddress?.line1 && shippingAddress?.city ? (
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: theme.ink,
                    fontFamily: typography.family.sansBold,
                    marginBottom: 4,
                  }}
                >
                  {shippingAddress.recipient_name || profile?.full_name || 'Delivery Recipient'}
                </Text>
                <Text
                  style={{
                    fontSize: 13.5,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                    lineHeight: 19,
                  }}
                >
                  {shippingAddress.line1}
                  {shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}
                </Text>
                <Text
                  style={{
                    fontSize: 13.5,
                    color: theme.mute,
                    fontFamily: typography.family.sans,
                    marginTop: 2,
                  }}
                >
                  {shippingAddress.city}
                  {shippingAddress.state ? `, ${shippingAddress.state}` : ''}
                  {shippingAddress.postal_code ? ` ${shippingAddress.postal_code}` : ''}
                </Text>

                {/* Phone number display */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 10,
                    paddingTop: 8,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  }}
                >
                  <Feather name="phone" size={13} color={shippingAddress.phone ? theme.purple : '#EF4444'} />
                  {shippingAddress.phone ? (
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: theme.ink,
                        fontFamily: typography.family.sansSemibold,
                      }}
                    >
                      {shippingAddress.phone}
                    </Text>
                  ) : (
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: '600',
                        color: '#EF4444',
                        fontFamily: typography.family.sansSemibold,
                      }}
                    >
                      Phone number required — tap to add
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: isDark ? 'rgba(108, 71, 255, 0.15)' : '#F2F3FE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="plus" size={20} color={theme.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: theme.ink,
                      fontFamily: typography.family.sansBold,
                    }}
                  >
                    Add delivery address
                  </Text>
                  <Text
                    style={{
                      fontSize: 12.5,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 2,
                    }}
                  >
                    Street address, city & contact phone number
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.mute} />
              </View>
            )}
          </Pressable>
        </View>

        {/* ── Card 3: Delivery Option (Direct Seller Transfer completely removed) ── */}
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
            marginBottom: 14,
          }}
        >
          {/* Header Row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 10,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="truck" size={16} color={theme.purple} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                }}
              >
                Delivery option
              </Text>
            </View>
          </View>

          {/* Delivery Option Details */}
          <View style={{ padding: 16 }}>
            {fulfillment === 'handshake' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                    In-Person Meetup (Handshake)
                  </Text>
                  <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                    Coordinate meetup in a public safe spot
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981', fontFamily: typography.family.sansBold }}>
                  Free
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                      Ceranix Tracked Courier
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: radii.pill,
                        backgroundColor: isDark ? 'rgba(108, 71, 255, 0.18)' : '#F2F3FE',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: theme.purple, fontFamily: typography.family.sansBold }}>
                        {parcelSize === 'large' ? 'Large parcel' : 'Small / Medium'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, marginTop: 4 }}>
                    Doorstep pickup & tracked courier delivery (1 - 3 business days)
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                  {formatPrice(deliveryFee)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Card 4: Payment Method (Including JazzCash & Easypaisa) ── */}
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
            marginBottom: 14,
          }}
        >
          {/* Header Row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 10,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="credit-card" size={16} color={theme.purple} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                }}
              >
                Payment method
              </Text>
            </View>
            <Pressable
              onPress={() => setPaymentOptionsOpen(true)}
              hitSlop={HIT_SLOP_8}
              accessibilityRole="button"
              accessibilityLabel="Change payment method"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: theme.purple,
                  fontFamily: typography.family.sansBold,
                }}
              >
                {hasChosenMethod ? 'Change' : 'Choose'}
              </Text>
            </Pressable>
          </View>

          {/* Payment Method Content */}
          <Pressable
            onPress={() => setPaymentOptionsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Select payment method"
            style={({ pressed }) => [
              {
                paddingHorizontal: 16,
                paddingVertical: 14,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            {!hasChosenMethod || (selectedMethod === 'card' && !cardLast4) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isDark ? 'rgba(108, 71, 255, 0.15)' : '#F2F3FE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="plus" size={18} color={theme.purple} />
                  </View>
                  <View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: theme.ink,
                        fontFamily: typography.family.sansBold,
                      }}
                    >
                      Choose payment method
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                        marginTop: 1,
                      }}
                    >
                      Card, JazzCash, Easypaisa, or Cash on Delivery
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={theme.mute} />
              </View>
            ) : selectedMethod === 'jazzcash' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: '#ED1B24',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 }}>
                      JazzCash
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                      JazzCash Mobile Account
                    </Text>
                    <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                      {walletNumber || 'Mobile Account Linked'}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={theme.mute} />
              </View>
            ) : selectedMethod === 'easypaisa' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: '#00A859',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 }}>
                      easypaisa
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                      Easypaisa Mobile Account
                    </Text>
                    <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                      {walletNumber || 'Mobile Account Linked'}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={theme.mute} />
              </View>
            ) : selectedMethod === 'apple_pay' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: isDark ? '#000000' : '#111111',
                    }}
                  >
                    <Ionicons name="logo-apple" size={13} color="#FFFFFF" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF', marginLeft: 3 }}>Pay</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                    Apple Pay
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.mute} />
              </View>
            ) : selectedMethod === 'cod' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="package" size={16} color="#10B981" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                      Cash on Delivery
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 1 }}>
                      Pay cash to courier when delivered
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={theme.mute} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 4,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: '#E0E0E0',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#1A1F71', fontStyle: 'italic' }}>
                      {(cardBrand ?? 'VISA').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                    {cardBrand || 'Card'} ending with {cardLast4}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.mute} />
              </View>
            )}
          </Pressable>

          {/* Save Card Checkbox Container */}
          {selectedMethod === 'card' && cardLast4 && (
            <View
              style={{
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
                paddingHorizontal: 16,
                paddingVertical: 12,
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

        {/* ── Card 5: Order Summary Breakdown ── */}
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: theme.ink,
              fontFamily: typography.family.sansBold,
              marginBottom: 12,
            }}
          >
            Order summary
          </Text>

          {/* Subtotal */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 }}>
            <Text style={{ fontSize: 14, color: theme.mute, fontFamily: typography.family.sans }}>
              {isBundle ? `Subtotal (${allOrderItems.length} items)` : offerAmount ? 'Offer price' : 'Order'}
            </Text>
            <Text style={{ fontSize: 14, color: theme.ink, fontFamily: typography.family.sansMedium }}>
              {formatPrice(isBundle && !offerAmount ? bundleSubtotal : itemPrice)}
            </Text>
          </View>

          {/* Bundle Savings */}
          {isBundle && !offerAmount && bundleSavings > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 }}>
              <Text style={{ fontSize: 14, color: theme.purple, fontFamily: typography.family.sansBold }}>
                Bundle discount ({bundleDiscountPct}%)
              </Text>
              <Text style={{ fontSize: 14, color: theme.purple, fontFamily: typography.family.sansBold }}>
                − {formatPrice(bundleSavings)}
              </Text>
            </View>
          ) : null}

          {/* Buyer Protection Fee */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 }}>
            <Pressable
              onPress={() => setBpSheetOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              hitSlop={6}
            >
              <ShieldCheckIcon size={14} />
              <Text style={{ fontSize: 14, color: theme.mute, fontFamily: typography.family.sans }}>
                Buyer protection fee
              </Text>
              <Feather name="info" size={13} color={theme.muteSoft} />
            </Pressable>
            <Text style={[{ fontSize: 14, color: theme.ink, fontFamily: typography.family.sansMedium }, bpFee === 0 && { color: '#10B981', fontWeight: '600' }]}>
              {bpFee > 0 ? formatPrice(bpFee) : 'Free'}
            </Text>
          </View>

          {/* Delivery Fee */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 }}>
            <Text style={{ fontSize: 14, color: theme.mute, fontFamily: typography.family.sans }}>
              Ceranix Delivery
            </Text>
            <Text style={[{ fontSize: 14, color: theme.ink, fontFamily: typography.family.sansMedium }, deliveryFee === 0 && { color: '#10B981', fontWeight: '600' }]}>
              {deliveryFee > 0 ? formatPrice(deliveryFee) : 'Free'}
            </Text>
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 12 }} />

          {/* Total */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
              Total to pay
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.purple, fontFamily: typography.family.sansBold }}>
              {formatPrice(totalAmount)}
            </Text>
          </View>
        </View>

        {/* ── Card 6: Buyer Protection Trust Guarantee ── */}
        <Pressable
          onPress={() => setBpSheetOpen(true)}
          style={({ pressed }) => [
            {
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 16,
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <ShieldCheckIcon size={22} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: '700',
                color: theme.ink,
                fontFamily: typography.family.sansBold,
                marginBottom: 3,
              }}
            >
              Buyer Protection included
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.mute,
                fontFamily: typography.family.sans,
                lineHeight: 16,
              }}
            >
              Our Buyer Protection is added for a fee to every purchase. It includes our refund policy, secure payment processing, and 24/7 dedicated support.
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={theme.mute} style={{ marginTop: 2 }} />
        </Pressable>
      </ScrollView>

      {/* ── Fixed Footer: Trust Note + Pay Button ── */}
      <View
        style={{
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
          backgroundColor: theme.surface,
          paddingTop: 12,
          paddingBottom: Platform.OS === 'ios' ? 14 : 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            paddingHorizontal: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10, gap: 5 }}>
            <Feather name="lock" size={12} color={theme.muteSoft} />
            <Text style={{ fontSize: 11.5, color: theme.muteSoft, fontFamily: typography.family.sans }}>
              Secure 256-bit encrypted checkout
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
                  borderRadius: radii.pill,
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
                {isBundle && bundleFetchStatus === 'loading'
                  ? 'Loading bundle...'
                  : selectedMethod === 'cod'
                    ? `Confirm Order · ${formatPrice(totalAmount)}`
                    : `Pay · ${formatPrice(totalAmount)}`}
              </Text>
            )}
          </Pressable>
        </View>
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
