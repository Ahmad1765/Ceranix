import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { fetchListingById } from '@/lib/listings';
import { getCachedListing } from '@/lib/listingCache';
import { withTimeout } from '@/lib/async';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { createCheckoutSession, openCheckout, STRIPE_ENABLED } from '@/lib/payments';
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

function formatMoney(amount: number) {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

function formatShortDate(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = d.getFullYear();
  return `${mm}/${dd}/${yy}`;
}

export default function PaymentScreen() {
  const { id, offer } = useLocalSearchParams<{ id: string; offer?: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const cached = getCachedListing(id ? String(id) : null);
  const [listing, setListing] = useState<Listing | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [paying, setPaying] = useState(false);

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

  const total = offerAmount ?? Number(listing.price ?? 0);
  const fee = 0;
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

    if (!STRIPE_ENABLED) {
      setTimeout(() => {
        toast.show('Demo payment — Stripe not configured', {
          variant: 'info',
          icon: 'info',
        });
        router.replace(`/invoice/${id}?paid=1` as any);
      }, 900);
      return;
    }

    try {
      const { url } = await createCheckoutSession(String(id), {
        offerAmount: offerAmount ?? undefined,
      });
      await openCheckout(url);
      if (Platform.OS !== 'web') {
        let verified = false;
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const updated = await fetchListingById(String(id));
            if (updated?.is_sold) {
              verified = true;
              break;
            }
          } catch {
            // ignore polling errors
          }
        }
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

          {/* From row */}
          <Pressable
            onPress={() =>
              toast.show('Method picker coming soon', { variant: 'info', icon: 'credit-card' })
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingVertical: 18,
              }}
            >
              <Text style={Label}>From</Text>
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
                <Text style={Value}>
                  {cardBrand} ••••{cardLast4}
                </Text>
                <Feather
                  name="chevron-right"
                  size={16}
                  color="rgba(15,15,15,0.45)"
                  style={{ marginLeft: 6 }}
                />
              </View>
            </View>
          </Pressable>

          <RowDivider />

          {/* Pay on row */}
          <Pressable
            onPress={() =>
              toast.show('Schedule coming soon', { variant: 'info', icon: 'calendar' })
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
          >
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={Value}>{payOn}</Text>
                <Feather
                  name="chevron-right"
                  size={16}
                  color="rgba(15,15,15,0.45)"
                  style={{ marginLeft: 6 }}
                />
              </View>
            </View>
          </Pressable>

          <RowDivider />

          {/* Fee row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 18,
            }}
          >
            <Text style={Label}>Fee (0%)</Text>
            <Text style={Value}>{formatMoney(fee)}</Text>
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
              {formatMoney(total)}
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
          label={`Slide to pay ${formatMoney(total)}`}
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
