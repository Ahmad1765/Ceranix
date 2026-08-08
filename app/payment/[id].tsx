import { capture } from '@/lib/analytics';
import { useEffect, useState, useRef } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, router, Redirect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { getOptimizedImageUrl } from '@/lib/images';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { SafetyBanner } from '@/components/SafetyBanner';
import { fetchListingById } from '@/lib/listings';
import { getCachedListing } from '@/lib/listingCache';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import {
  createCheckoutSession,
  fetchOrderForListing,
  openCheckout,
  STRIPE_ENABLED,
} from '@/lib/payments';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { SlideToConfirm } from '@/components/SlideToConfirm';
import type { Listing } from '@/types';

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
  // `authLoading` is load-bearing: the auth context restores its session
  // asynchronously, so `user` is null for the first frames of any cold load.
  // Redirecting on that null bounces a signed-in buyer to the login screen on
  // a hard refresh or a deep link into checkout. (Local `loading` below is the
  // listing fetch — a different thing.)
  const { user, loading: authLoading } = useAuth();

  const toast = useToast();
  const cached = getCachedListing(id ? String(id) : null);
  const [listing, setListing] = useState<Listing | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [paying, setPaying] = useState(false);
  const demoTimerRef = useRef<any>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    };
  }, []);

  // When the buyer arrives from an accepted offer, the chat passes ?offer=<amt>
  // so the displayed total reflects the agreed price. The Stripe edge function
  // is responsible for validating this against the accepted-offer record.
  const offerAmount = (() => {
    const n = Number(offer);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  })();

  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      return;
    }
    const haveCached = !!getCachedListing(String(id));
    setLoading(!haveCached);
    (async () => {
      try {
        const res = await Promise.race([
          fetchListingById(String(id)),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), 25_000),
          ),
        ]);
        if (active && res) setListing(res);
        else if (active && !haveCached) setListing(null);
      } catch (e) {
        console.warn('[payment] load failed', e);
        if (active && !haveCached) setListing(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // Wait for auth to settle before judging `user` — the same order
  // components/RequireAuth uses. This screen hand-rolls that guard, and
  // omitting the loading check is what sent signed-in buyers to /auth/login.
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

  if (loading) {
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

  // Item price (an accepted offer overrides the listing price) + Buyer
  // Protection = what the buyer pays. Kept in one place so the summary, the
  // fee row, and the total below can't drift apart.
  const itemPrice = offerAmount ?? Number(listing.price ?? 0);
  const fee = buyerProtectionFee(itemPrice);
  const total = itemPrice + fee;
  const sellerName =
    listing.seller?.full_name || listing.seller?.username || 'Seller';
  const sellerInitial = (listing.seller?.username || 'S').charAt(0).toUpperCase();
  const payOn = formatShortDate(new Date());
  const cardLast4 = '4242';
  const cardBrand = STRIPE_ENABLED ? 'Card' : 'Demo card';

  const handlePay = async () => {
    if (paying) return;
    tap('medium');
    setPaying(true);

    try {
      capture('checkout_started', { listing_id: id, amount: total });
      if (!STRIPE_ENABLED) {
        await new Promise((resolve) => {
          demoTimerRef.current = setTimeout(resolve, 900);
        });
        toast.show('Demo payment — Stripe not configured', {
          variant: 'info',
          icon: 'info',
        });
        router.replace(`/invoice/${id}?paid=1` as any);
        return;
      }

      const { url } = await createCheckoutSession(String(id), {
        offerAmount: offerAmount ?? undefined,
      });
      await openCheckout(url);
      if (Platform.OS !== 'web') {
        // Wait for the order the stripe-webhook writes — NOT for listings.is_sold,
        // which the seller can toggle by hand and which would report "paid" for a
        // checkout the buyer abandoned.
        let verified = false;
        for (let i = 0; i < 15; i++) {
          if (!mounted.current) return;
          await new Promise((r) => setTimeout(r, 2000));
          if (!mounted.current) return;
          try {
            const placed = await fetchOrderForListing(String(id));
            if (!mounted.current) return;
            if (placed?.status === 'paid') {
              verified = true;
              break;
            }
          } catch {
            // ignore polling errors
          }
        }
        if (!mounted.current) return;
        if (verified) {
          router.replace(`/invoice/${id}?paid=1` as any);
        } else {
          toast.show('Payment verification timed out', { variant: 'default' });
        }
      }
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not start checkout', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setPaying(false);
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
          paddingBottom: 22,
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
            <Feather name="lock" size={14} color={colors.primary} />
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
              Pay in full
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: colors.mute,
                marginTop: 1,
                letterSpacing: 0.2,
              }}
            >
              {STRIPE_ENABLED ? 'Secured by Stripe · Test mode' : 'Stripe not connected · Demo'}
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
        {/* Item summary — what you're actually buying. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: colors.panel,
            borderRadius: 20,
            padding: 14,
            marginBottom: 12,
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

        {/* Details card */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 24,
            overflow: 'hidden',
          }}
        >
          {/* To row — keeps brand mark + name on one line, like the reference */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 20,
            }}
          >
            <Text style={Label}>To</Text>
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

          {/* Pay-with row — the real card is collected securely in Stripe checkout. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 18,
            }}
          >
            <Text style={Label}>Pay with</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 28,
                  height: 20,
                  borderRadius: 5,
                  backgroundColor: colors.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Feather name="credit-card" size={11} color={colors.white} />
              </View>
              <Text style={Value}>{STRIPE_ENABLED ? 'Card at checkout' : `${cardBrand} ••••${cardLast4}`}</Text>
            </View>
          </View>

          <RowDivider />

          {/* Pay on row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 18,
            }}
          >
            <Text style={Label}>Pay on</Text>
            <Text style={Value}>{payOn}</Text>
          </View>

          <RowDivider />

          {/* Item row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 18,
            }}
          >
            <Text style={Label}>Item</Text>
            <Text style={Value}>{formatPrice(itemPrice)}</Text>
          </View>

          <RowDivider />

          {/* Buyer Protection row — the fee that backs every order. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 18,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="shield" size={13} color={colors.primary} />
              <Text style={Label}>Buyer Protection</Text>
            </View>
            <Text style={Value}>{formatPrice(fee)}</Text>
          </View>
        </View>

        {/* Total moment — pushed below with breathing room */}
        <View
          style={{
            paddingTop: 28,
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
              Total
            </Text>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{
                fontSize: 44,
                fontWeight: '900',
                color: colors.ink,
                letterSpacing: -2,
                lineHeight: 48,
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

        {/* Reassurance at the point of payment. */}
        <SafetyBanner context="checkout" style={{ marginTop: 20 }} />
      </ScrollView>

      {/* Slide to pay */}
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
          label={`Slide to pay ${formatPrice(total)}`}
          loadingLabel="Processing…"
          loading={paying}
          onConfirm={handlePay}
        />
      </View>
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
