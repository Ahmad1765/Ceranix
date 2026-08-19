import { capture } from '@/lib/analytics';
import { useEffect, useState, useRef } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, router, Redirect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { getOptimizedImageUrl } from '@/lib/images';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { SafetyBanner } from '@/components/SafetyBanner';
import { useListingQuery } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { supabase } from '@/lib/supabase';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { SlideToConfirm } from '@/components/SlideToConfirm';
import { AddressSheet, type AddressForm } from '@/components/settings/AddressSheet';
import { MockStripePaymentSheet } from '@/components/payment/MockStripePaymentSheet';
import { paymentService, STRIPE_ENABLED } from '@/lib/paymentService';
import { ShippingAddressSchema } from '@/lib/schemas/order';
import type { ShippingAddress, PaymentMethod } from '@/types';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function formatShortDate(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = d.getFullYear();
  return `${mm}/${dd}/${yy}`;
}

export default function PaymentScreen() {
  const { id, offer } = useLocalSearchParams<{ id: string; offer?: string }>();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();

  const listingQ = useListingQuery(id ? String(id) : null);
  const listing = listingQ.data ?? null;

  // Checkout states
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [stripeSheetOpen, setStripeSheetOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const mounted = useRef(true);

  // Fetch buyer's default shipping address
  useEffect(() => {
    mounted.current = true;
    if (!user?.id) return;

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
            // Fallback: fetch any shipping address for this user
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
      } finally {
        if (active) setAddressLoading(false);
      }
    })();

    return () => {
      active = false;
      mounted.current = false;
    };
  }, [user?.id]);

  const offerAmount = (() => {
    const n = Number(offer);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  })();

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return <Redirect href="/auth/login" />;
  }

  if (!listing && id && listingQ.isPending) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Feather name="alert-circle" size={28} color={colors.mute} />
          <Text
            style={{
              fontSize: 17,
              fontWeight: '800',
              color: colors.ink,
              marginTop: 14,
              letterSpacing: -0.3,
            }}
          >
            Item unavailable
          </Text>
          <Pressable
            onPress={() => safeBack()}
            style={({ pressed }) => ({
              marginTop: 22,
              height: 48,
              borderRadius: 14,
              paddingHorizontal: 24,
              backgroundColor: colors.ink,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: 14 }}>
              Go back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const itemPrice = offerAmount ?? Number(listing.price ?? 0);
  const fee = buyerProtectionFee(itemPrice);
  const total = itemPrice + fee;
  const sellerName =
    listing.seller?.full_name || listing.seller?.username || 'Seller';
  const sellerInitial = (listing.seller?.username || 'S').charAt(0).toUpperCase();
  const payOn = formatShortDate(new Date());

  // Handle Save Address from sheet
  const handleSaveAddress = async (form: AddressForm) => {
    try {
      // Validate with Zod
      ShippingAddressSchema.parse(form);

      const payload = {
        user_id: user.id,
        recipient_name: form.recipient_name.trim(),
        line1: form.line1.trim(),
        line2: form.line2?.trim() || null,
        city: form.city.trim(),
        state: form.state?.trim() || null,
        postal_code: form.postal_code.trim(),
        country: form.country.trim(),
        phone: form.phone?.trim() || null,
        is_default: true,
      };

      const { data, error } = await supabase
        .from('shipping_addresses')
        .upsert(payload)
        .select()
        .single();

      if (error) {
        // Fallback for local mock
        const mockAddress: ShippingAddress = {
          id: `mock_addr_${Date.now()}`,
          ...payload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setShippingAddress(mockAddress);
      } else {
        setShippingAddress(data as ShippingAddress);
      }

      setAddressSheetOpen(false);
      toast.show('Shipping address saved', { variant: 'default', icon: 'check' });
    } catch (e: any) {
      toast.show(e?.message ?? 'Please check address details', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      throw e;
    }
  };

  // Main Checkout Trigger
  const handleCheckout = async () => {
    if (paying) return;

    // Validate address presence for Cash on Delivery
    if (paymentMethod === 'cod' && !shippingAddress) {
      toast.show('Please add a shipping address for delivery', {
        variant: 'default',
        icon: 'map-pin',
      });
      setAddressSheetOpen(true);
      return;
    }

    // Card Flow
    if (paymentMethod === 'card') {
      if (STRIPE_ENABLED) {
        // Live Stripe flow
        setPaying(true);
        try {
          capture('checkout_started', { listing_id: id, payment_method: 'card', amount: total });
          const result = await paymentService.checkout({
            listingId: String(id),
            paymentMethod: 'card',
            buyerId: user.id,
            sellerId: listing.seller_id,
            listingPrice: Number(listing.price),
            offerAmount: offerAmount ?? undefined,
            shippingAddress,
            deliveryNotes,
          });

          if (result.redirectUrl) {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.location.href = result.redirectUrl;
            }
          }
        } catch (e: any) {
          toast.show(e?.message ?? 'Could not initiate Stripe checkout', {
            variant: 'default',
            icon: 'alert-triangle',
          });
        } finally {
          setPaying(false);
        }
      } else {
        // PCI-Compliant Mock Stripe Payment Sheet
        setStripeSheetOpen(true);
      }
      return;
    }

    // Cash on Delivery Flow
    tap('medium');
    setPaying(true);
    try {
      capture('checkout_started', { listing_id: id, payment_method: 'cod', amount: total });

      const result = await paymentService.checkout({
        listingId: String(id),
        paymentMethod: 'cod',
        buyerId: user.id,
        sellerId: listing.seller_id,
        listingPrice: Number(listing.price),
        offerAmount: offerAmount ?? undefined,
        shippingAddress,
        deliveryNotes,
      });

      if (result.success) {
        toast.show('Order placed! Pay on delivery.', {
          variant: 'default',
          icon: 'check',
        });
        router.replace(`/invoice/${id}?placed=1&method=cod` as any);
      }
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not place order', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setPaying(false);
    }
  };

  // Mock Stripe Payment Sheet Confirmation Handler
  const handleStripeSheetConfirm = async () => {
    try {
      const result = await paymentService.checkout({
        listingId: String(id),
        paymentMethod: 'card',
        buyerId: user.id,
        sellerId: listing.seller_id,
        listingPrice: Number(listing.price),
        offerAmount: offerAmount ?? undefined,
        shippingAddress,
        deliveryNotes,
      });

      if (result.success) {
        setStripeSheetOpen(false);
        toast.show('Payment authorized via Stripe mock', {
          variant: 'default',
          icon: 'check',
        });
        router.replace(`/invoice/${id}?paid=1` as any);
      }
    } catch (e: any) {
      toast.show(e?.message ?? 'Card payment failed', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: colors.primarySofter,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Feather name="shield" size={14} color={colors.primary} />
          </View>
          <View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: '800',
                color: colors.ink,
                letterSpacing: -0.3,
              }}
            >
              Checkout
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: colors.mute,
                marginTop: 1,
                letterSpacing: 0.2,
              }}
            >
              Secure Order & Fulfillment
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Feather name="x" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 160 }}
      >
        {/* Item summary */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: colors.panel,
            borderRadius: 20,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <Image
            source={{ uri: getOptimizedImageUrl(listing.images?.[0] ?? '', { width: 160 }) }}
            style={{ width: 60, height: 76, borderRadius: 12, backgroundColor: 'rgba(15,15,15,0.06)' }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={2}>
              {listing.title}
            </Text>
            {[listing.brand, listing.size ? `Size ${listing.size}` : null].filter(Boolean).length > 0 ? (
              <Text style={{ fontSize: 13, color: colors.mute, marginTop: 3 }} numberOfLines={1}>
                {[listing.brand, listing.size ? `Size ${listing.size}` : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>
            {formatPrice(itemPrice)}
          </Text>
        </View>

        {/* Section: Payment Method Selector */}
        <View style={{ marginBottom: 18 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              color: colors.ink,
              marginBottom: 10,
              letterSpacing: -0.2,
            }}
          >
            Select Payment Method
          </Text>

          {/* Cash on Delivery Option */}
          <Pressable
            onPress={() => {
              tap('light');
              setPaymentMethod('cod');
            }}
            style={{
              borderRadius: 16,
              borderWidth: 2,
              borderColor: paymentMethod === 'cod' ? colors.primary : 'rgba(15,15,15,0.08)',
              backgroundColor: paymentMethod === 'cod' ? colors.primarySofter : colors.white,
              padding: 16,
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: paymentMethod === 'cod' ? colors.primary : colors.panel,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather
                    name="truck"
                    size={16}
                    color={paymentMethod === 'cod' ? colors.white : colors.ink}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>
                      Cash on Delivery (CoD)
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: colors.primary,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.white }}>
                        POPULAR
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 2 }}>
                    Pay cash at doorstep when the parcel arrives
                  </Text>
                </View>
              </View>

              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: paymentMethod === 'cod' ? colors.primary : colors.muteSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {paymentMethod === 'cod' ? (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.primary,
                    }}
                  />
                ) : null}
              </View>
            </View>
          </Pressable>

          {/* Credit / Debit Card Option (Stripe) */}
          <Pressable
            onPress={() => {
              tap('light');
              setPaymentMethod('card');
            }}
            style={{
              borderRadius: 16,
              borderWidth: 2,
              borderColor: paymentMethod === 'card' ? colors.primary : 'rgba(15,15,15,0.08)',
              backgroundColor: paymentMethod === 'card' ? colors.primarySofter : colors.white,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: paymentMethod === 'card' ? colors.primary : colors.panel,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather
                    name="credit-card"
                    size={16}
                    color={paymentMethod === 'card' ? colors.white : colors.ink}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>
                      Credit / Debit Card
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: '#635BFF',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.white }}>
                        STRIPE
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 2 }}>
                    Instant confirmation via PCI-compliant Stripe Payment Sheet
                  </Text>
                </View>
              </View>

              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: paymentMethod === 'card' ? colors.primary : colors.muteSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {paymentMethod === 'card' ? (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.primary,
                    }}
                  />
                ) : null}
              </View>
            </View>
          </Pressable>
        </View>

        {/* Section: Shipping Address */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="map-pin" size={15} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>
                Shipping Address
              </Text>
            </View>
            <Pressable
              onPress={() => {
                tap('light');
                setAddressSheetOpen(true);
              }}
              hitSlop={HIT_SLOP_8}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                {shippingAddress ? 'Change' : 'Add address'}
              </Text>
            </Pressable>
          </View>

          {addressLoading ? (
            <ActivityIndicator size="small" color={colors.ink} style={{ paddingVertical: 8 }} />
          ) : shippingAddress ? (
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                {shippingAddress.recipient_name}
              </Text>
              <Text style={{ fontSize: 13, color: colors.mute, marginTop: 2 }}>
                {shippingAddress.line1}
                {shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}
              </Text>
              <Text style={{ fontSize: 13, color: colors.mute, marginTop: 1 }}>
                {shippingAddress.city}, {shippingAddress.postal_code}
                {shippingAddress.phone ? ` · ${shippingAddress.phone}` : ''}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                tap('light');
                setAddressSheetOpen(true);
              }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(15,15,15,0.12)',
                borderStyle: 'dashed',
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Feather name="plus-circle" size={16} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                Add delivery address
              </Text>
            </Pressable>
          )}
        </View>

        {/* Section: Delivery Notes (Optional) */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Feather name="edit-3" size={14} color={colors.mute} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>
              Delivery instructions (optional)
            </Text>
          </View>
          <TextInput
            value={deliveryNotes}
            onChangeText={setDeliveryNotes}
            placeholder="e.g. Leave at front door, call before delivery"
            placeholderTextColor={colors.muteSoft}
            maxLength={250}
            style={{
              backgroundColor: colors.white,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 13.5,
              color: colors.ink,
              borderWidth: 1,
              borderColor: 'rgba(15,15,15,0.08)',
            }}
          />
        </View>

        {/* Details card */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 24,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 16,
            }}
          >
            <Text style={Label}>Seller</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '900', color: colors.white }}>
                  {sellerInitial}
                </Text>
              </View>
              <Text style={Value} numberOfLines={1}>
                {sellerName}
              </Text>
            </View>
          </View>

          <RowDivider />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 16,
            }}
          >
            <Text style={Label}>Order Date</Text>
            <Text style={Value}>{payOn}</Text>
          </View>

          <RowDivider />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 16,
            }}
          >
            <Text style={Label}>Item Price</Text>
            <Text style={Value}>{formatPrice(itemPrice)}</Text>
          </View>

          <RowDivider />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="shield" size={13} color={colors.primary} />
              <Text style={Label}>Buyer Protection</Text>
            </View>
            <Text style={Value}>{formatPrice(fee)}</Text>
          </View>
        </View>

        {/* Total moment */}
        <View
          style={{
            paddingTop: 24,
            paddingHorizontal: 4,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 13,
                color: colors.mute,
                marginBottom: 4,
                letterSpacing: 0.2,
              }}
            >
              {paymentMethod === 'cod' ? 'Total on Delivery' : 'Total'}
            </Text>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{
                fontSize: 40,
                fontWeight: '900',
                color: colors.ink,
                letterSpacing: -1.8,
                lineHeight: 44,
              }}
            >
              {formatPrice(total)}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              tap('light');
              router.push(`/invoice/${id}` as any);
            }}
            hitSlop={HIT_SLOP_8}
            style={({ pressed }) => ({
              paddingVertical: 8,
              paddingLeft: 14,
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: colors.primary,
              }}
            >
              See details
            </Text>
          </Pressable>
        </View>

        <SafetyBanner context="checkout" style={{ marginTop: 18 }} />
      </ScrollView>

      {/* Slide to Confirm action */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 24,
          pointerEvents: 'box-none',
        }}
      >
        <SlideToConfirm
          label={
            paymentMethod === 'cod'
              ? `Slide to place CoD Order (${formatPrice(total)})`
              : `Slide to pay ${formatPrice(total)}`
          }
          loadingLabel="Processing order…"
          loading={paying}
          onConfirm={handleCheckout}
        />
      </View>

      {/* Address Sheet Modal */}
      <AddressSheet
        visible={addressSheetOpen}
        initial={shippingAddress}
        onClose={() => setAddressSheetOpen(false)}
        onSave={handleSaveAddress}
      />

      {/* Mock Stripe Payment Sheet (PCI Compliant Bottom Sheet) */}
      <MockStripePaymentSheet
        visible={stripeSheetOpen}
        totalAmount={total}
        itemTitle={listing.title}
        onClose={() => setStripeSheetOpen(false)}
        onConfirm={handleStripeSheetConfirm}
      />
    </SafeAreaView>
  );
}

function RowDivider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: 'rgba(15,15,15,0.06)',
        marginHorizontal: 20,
      }}
    />
  );
}

const Label = {
  fontSize: 14,
  color: colors.mute,
  fontWeight: '500' as const,
};

const Value = {
  fontSize: 15,
  fontWeight: '700' as const,
  color: colors.ink,
  letterSpacing: -0.1,
};
