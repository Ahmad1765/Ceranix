import { useEffect, useState, useRef } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, Share, Platform, Linking } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { useListingQuery } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { fetchOrderForListing, type Order } from '@/lib/payments';
import { deriveInvoiceStatus, deriveInvoiceAmounts } from '@/lib/invoiceStatus';
import { confirm } from '@/lib/confirm';
import { paymentService } from '@/lib/paymentService';
import { generateMapsLink } from '@/lib/maps';
import { BRAND } from '@/lib/brand';
import { OrderStepper } from '@/components/orders/OrderStepper';
import { CancelOrderModal } from '@/components/orders/CancelOrderModal';
import { MarkShippedModal } from '@/components/orders/MarkShippedModal';
import { cardImageUrl, getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function deriveInvoiceNumber(id: string): string {
  const hex = id.replace(/-/g, '').slice(0, 12);
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return '00000000';
  return String(Math.abs(n) % 100000000).padStart(8, '0');
}

function stripHexSuffix(s: string): string {
  if (/^(user|profile)[0-9a-f]{4,}$/i.test(s)) {
    const cleaned = s.replace(/[0-9a-f]+$/i, '');
    if (cleaned.length >= 3) return cleaned;
  }
  const cleaned = s.replace(/[0-9a-f]{6,}$/i, '');
  return cleaned.length >= 3 ? cleaned : s;
}

function displayName(
  fullName: string | null | undefined,
  username: string | null | undefined,
): string {
  const name = (fullName ?? '').trim();
  if (name) return name;
  if (!username) return 'User';
  return stripHexSuffix(username);
}

export default function InvoiceScreen() {
  const { id, paid, placed, method } = useLocalSearchParams<{
    id: string;
    paid?: string;
    placed?: string;
    method?: string;
  }>();
  const { profile, user } = useAuth();
  const toast = useToast();
  const { theme, isDark } = useTheme();

  const listingQ = useListingQuery(id ? String(id) : null);
  const listing = listingQ.data ?? null;

  const [order, setOrder] = useState<Order | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [completingCod, setCompletingCod] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [completingReceipt, setCompletingReceipt] = useState(false);

  const priceRef = useRef(listing?.price);
  priceRef.current = listing?.price;

  useEffect(() => {
    if (!id) return;
    let active = true;
    const listingId = String(id);

    const load = async () => {
      try {
        return await fetchOrderForListing(listingId);
      } catch (e) {
        console.warn('[invoice] order load failed', e);
        return null;
      }
    };

    (async () => {
      const first = await load();
      if (!active) return;
      if (first) {
        setOrder(first);
      } else if (__DEV__ && placed === '1') {
        setOrder({
          id: `order_demo_${Date.now()}`,
          listing_id: String(listingId),
          buyer_id: user?.id ?? 'buyer_demo',
          seller_id: listing?.seller_id ?? listing?.seller?.id ?? 'seller_demo',
          status: method === 'cod' ? 'pending' : 'paid',
          amount_cents: Math.round(Number(priceRef.current ?? 1000) * 100),
          fee_cents: 0,
          currency: 'pkr',
          payment_method: method === 'cod' ? 'cod' : 'card',
          created_at: new Date().toISOString(),
        });
      }

      if (paid !== '1' || first?.status === 'paid') return;

      setConfirming(true);
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!active) return;
        const fresh = await load();
        if (!active) return;
        if (fresh) {
          setOrder(fresh);
          if (fresh.status === 'paid') break;
        }
      }
      if (active) setConfirming(false);
    })();

    return () => {
      active = false;
    };
  }, [paid, placed, method, id, user?.id, listing?.seller_id, listing?.seller?.id]);

  if (!listing && id && listingQ.isPending) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.ink} />
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
        >
          <Feather name="file-text" size={28} color={theme.mute} />
          <Text
            style={{
              fontSize: 17,
              fontWeight: '800',
              color: theme.ink,
              marginTop: 14,
              letterSpacing: -0.3,
            }}
          >
            Invoice not found
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: theme.mute,
              marginTop: 6,
              textAlign: 'center',
              lineHeight: 19,
            }}
          >
            This invoice may have been removed or never existed.
          </Text>
          <Pressable
            onPress={() => safeBack()}
            style={({ pressed }) => ({
              marginTop: 22,
              height: 48,
              borderRadius: 14,
              paddingHorizontal: 24,
              backgroundColor: theme.ink,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: theme.background, fontWeight: '800', fontSize: 14 }}>
              Go back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const {
    item: itemPrice,
    total,
  } = deriveInvoiceAmounts(order, listing.price, buyerProtectionFee);
  const seller = listing.seller;
  const isSeller = Boolean(user?.id && (user.id === listing.seller_id || user.id === seller?.id));
  const isBuyer = Boolean(user?.id && order?.buyer_id && user.id === order.buyer_id);
  const invoiceNumber = deriveInvoiceNumber(listing.id);
  const buyerName = displayName(profile?.full_name, profile?.username);
  const status = deriveInvoiceStatus(order, confirming);
  const heroImage = cardImageUrl(listing, 0);
  const mapsUrl = generateMapsLink(order?.shipping_address);

  const onShare = async () => {
    tap('light');
    try {
      await Share.share({
        message: `Order #${invoiceNumber}\n${listing.title} · ${formatPrice(total)}`,
      });
    } catch {
      toast.show('Share failed', { variant: 'default', icon: 'alert-triangle' });
    }
  };

  const onShareDispatchSlip = async () => {
    tap('light');
    const addr = order?.shipping_address;
    const recipient = addr?.recipient_name || buyerName;
    const street = [addr?.line1, addr?.line2].filter(Boolean).join(', ');
    const cityArea = [addr?.city, addr?.state, addr?.postal_code].filter(Boolean).join(', ');
    const phone = addr?.phone ? `📞 Phone: ${addr.phone}` : '';
    const note = order?.delivery_notes ? `📝 Note: ${order.delivery_notes}` : '';
    const paymentLine =
      order?.payment_method === 'cod'
        ? `💵 *COLLECT CASH ON DELIVERY: ${formatPrice(total)}*`
        : '💳 *PRE-PAID VIA CARD*';

    const lines: string[] = [
      `📦 *${BRAND.toUpperCase()} DISPATCH SLIP*`,
      `Order: #${invoiceNumber}`,
      `Item: ${listing.title}`,
      '',
      `👤 Recipient: ${recipient}`,
      ...(street ? [`📍 Address: ${street}`] : []),
      ...(cityArea ? [`🏙️ ${cityArea}`] : []),
      ...(phone ? [phone] : []),
      ...(note ? [note] : []),
      '',
      paymentLine,
      ...(mapsUrl ? ['', `🗺️ Google Maps Link: ${mapsUrl}`] : []),
    ];

    const dispatchSlipText = lines.join('\n');

    try {
      await Share.share({ message: dispatchSlipText });
    } catch {
      toast.show('Share failed', { variant: 'default', icon: 'alert-triangle' });
    }
  };

  const handleContactOtherUser = () => {
    tap('light');
    router.push(`/conversation/new?listing=${listing.id}` as any);
  };

  // Order Cancellation Handler
  const handleCancelOrder = async (reason: string) => {
    if (!order?.id) return;
    tap('medium');
    try {
      const updated = await paymentService.cancelOrder({
        orderId: order.id,
        listingId: listing.id,
        reason,
      });
      setOrder(updated);
      toast.show('Order cancelled successfully', {
        variant: 'default',
        icon: 'check',
      });
    } catch (e: any) {
      toast.show(e?.message || 'Failed to cancel order', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      throw e;
    }
  };

  // Seller Mark Shipped Handler
  const handleMarkShipped = async (courier: string, trackingNumber: string) => {
    if (!order?.id) return;
    tap('medium');
    try {
      const updated = await paymentService.markOrderShipped({
        orderId: order.id,
        courier,
        trackingNumber,
      });
      setOrder(updated);
      toast.show('Order marked as shipped!', {
        variant: 'default',
        icon: 'check',
      });
    } catch (e: any) {
      toast.show(e?.message || 'Failed to mark order as shipped', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      throw e;
    }
  };

  // Buyer Confirm Received Handler
  const handleConfirmReceived = async () => {
    if (!order?.id || completingReceipt) return;
    tap('medium');

    const confirmed = await confirm({
      title: 'Confirm Package Received?',
      message: 'Confirm that you have received your order in good condition. This will complete the transaction.',
      confirmLabel: 'Everything is OK',
    });

    if (!confirmed) return;

    setCompletingReceipt(true);
    try {
      const updated = await paymentService.confirmOrderReceived({ orderId: order.id });
      setOrder((prev) => ({ ...(prev ?? {}), ...(updated ?? {}), status: 'completed' } as any));
      toast.show('Order completed! Thank you for confirming.', {
        variant: 'default',
        icon: 'check',
      });
    } catch {
      toast.show('Failed to update order', { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setCompletingReceipt(false);
    }
  };

  // Seller CoD Completion with Optimistic UI Update
  const handleCompleteCodOrder = async () => {
    if (!order?.id || order.id.startsWith('order_demo') || completingCod) return;
    tap('medium');

    const confirmed = await confirm({
      title: 'Complete CoD Order?',
      message: `Confirm that you have delivered the package and collected the cash payment of ${formatPrice(total)} from the buyer.`,
      confirmLabel: 'Mark as Paid & Delivered',
    });

    if (!confirmed) return;

    const previousOrder = order;
    setOrder((prev) => (prev ? { ...prev, status: 'paid' } : null));
    setCompletingCod(true);

    try {
      const updated = await paymentService.markCodOrderPaid(order.id);
      setOrder(updated);
      toast.show('Order marked as paid & delivered', {
        variant: 'default',
        icon: 'check',
      });
    } catch (e: any) {
      setOrder(previousOrder);
      toast.show(e?.message ?? 'Failed to complete order', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setCompletingCod(false);
    }
  };

  const isOrderActive = order?.status === 'paid' || order?.status === 'pending';
  const isShipped = Boolean(order?.shipped_at || (order as any)?.tracking_number);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 6,
          paddingBottom: 14,
          backgroundColor: theme.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Feather name="arrow-left" size={20} color={theme.ink} />
        </Pressable>

        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
          Order Details
        </Text>

        <Pressable
          onPress={onShare}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Feather name="share" size={18} color={theme.ink} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140, paddingTop: 16 }}
      >
        {/* Order Stepper (Lifecycle Tracking) */}
        <View style={{ paddingHorizontal: 16 }}>
          <OrderStepper
            status={order?.status ?? (paid === '1' ? 'paid' : 'pending')}
            paymentMethod={order?.payment_method}
            shippedAt={order?.shipped_at}
            courierName={(order as any)?.courier_name}
            trackingNumber={(order as any)?.tracking_number}
            cancelReason={(order as any)?.cancel_reason}
            isSeller={isSeller}
          />
        </View>

        {/* Item Summary Card */}
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: theme.white,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                backgroundColor: theme.panel,
                borderWidth: 1,
                borderColor: theme.border,
                overflow: 'hidden',
                marginRight: 14,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {heroImage ? (
                <Image
                  source={{ uri: getOptimizedImageUrl(heroImage, { width: 140 }) }}
                  style={{ width: 64, height: 64 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={IMAGE_TRANSITION}
                />
              ) : (
                <Feather name="package" size={24} color={theme.muteSoft} />
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }} numberOfLines={1}>
                {listing.title}
              </Text>
              <Text style={{ fontSize: 13, color: theme.mute, marginTop: 2, textTransform: 'capitalize', fontFamily: typography.family.sans }}>
                {listing.category} · Ref #{invoiceNumber}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.purple, marginTop: 4, fontFamily: typography.family.sansBold }}>
                {formatPrice(itemPrice)}
              </Text>
            </View>
          </View>
        </View>

        {/* Shipping Address Card */}
        {order?.shipping_address && (
          <View
            style={{
              marginHorizontal: 16,
              backgroundColor: theme.white,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: theme.border,
              marginBottom: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Feather name="map-pin" size={16} color={theme.purple} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                Delivery Address
              </Text>
            </View>

            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold, marginBottom: 2 }}>
              {order.shipping_address.recipient_name || buyerName}
            </Text>
            <Text style={{ fontSize: 13, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 18 }}>
              {[order.shipping_address.line1, order.shipping_address.line2].filter(Boolean).join(', ')}
            </Text>
            <Text style={{ fontSize: 13, color: theme.mute, fontFamily: typography.family.sans }}>
              {[order.shipping_address.city, order.shipping_address.state, order.shipping_address.postal_code, order.shipping_address.country].filter(Boolean).join(', ')}
            </Text>
            {order.shipping_address.phone ? (
              <Text style={{ fontSize: 12.5, color: theme.muteSoft, fontFamily: typography.family.sans, marginTop: 4 }}>
                📞 {order.shipping_address.phone}
              </Text>
            ) : null}

            {mapsUrl && (
              <Pressable
                onPress={() => Linking.openURL(mapsUrl)}
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}
              >
                <Feather name="external-link" size={13} color={theme.purple} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.purple, fontFamily: typography.family.sansSemibold }}>
                  Open in Google Maps
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Payment & Breakdown Card */}
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: theme.white,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 14,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold, marginBottom: 12 }}>
            Payment Summary
          </Text>

          <MetaRow label="Item Price" theme={theme}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>{formatPrice(itemPrice)}</Text>
          </MetaRow>
          <MetaRow label="Buyer Protection" theme={theme}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#10B981', fontFamily: typography.family.sansBold }}>Free</Text>
          </MetaRow>
          <MetaRow label="Standard Shipping" theme={theme}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#10B981', fontFamily: typography.family.sansBold }}>Free</Text>
          </MetaRow>

          <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 10 }} />

          <MetaRow label="Total Amount" theme={theme}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink, fontFamily: typography.family.sansBold }}>{formatPrice(total)}</Text>
          </MetaRow>

          <MetaRow label="Payment Method" theme={theme}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather
                name={order?.payment_method === 'cod' ? 'truck' : 'credit-card'}
                size={14}
                color={theme.purple}
              />
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                {order?.payment_method === 'cod' ? 'Cash on Delivery' : 'Card Payment'}
              </Text>
            </View>
          </MetaRow>
        </View>

        {/* Quick Order Actions Strip */}
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {/* Chat with Seller / Buyer */}
          <Pressable
            onPress={handleContactOtherUser}
            style={({ pressed }) => [
              {
                height: 46,
                borderRadius: 12,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Feather name="message-circle" size={16} color={theme.ink} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>
              {isSeller ? 'Message Buyer' : 'Message Seller'}
            </Text>
          </Pressable>

          {/* Seller Share Dispatch Slip */}
          {isSeller && (
            <Pressable
              onPress={onShareDispatchSlip}
              style={({ pressed }) => [
                {
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Feather name="printer" size={16} color={theme.ink} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>Share Dispatch Slip</Text>
            </Pressable>
          )}

          {/* Cancel Order Action (Active Orders Only) */}
          {isOrderActive && (
            <Pressable
              onPress={() => setShowCancelModal(true)}
              style={({ pressed }) => [
                {
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 4,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Feather name="x-octagon" size={15} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#EF4444', fontFamily: typography.family.sansBold }}>
                {isSeller ? 'Cancel Sale' : 'Cancel Order'}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed Bottom Primary Action Bar ── */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Platform.OS === 'ios' ? 28 : 16,
        }}
      >
        {status === 'canceled' || order?.status === 'canceled' ? (
          <View
            style={{
              height: 48,
              borderRadius: 12,
              backgroundColor: theme.panel,
              borderWidth: 1,
              borderColor: theme.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Feather name="x-circle" size={16} color="#EF4444" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.mute, fontFamily: typography.family.sansBold }}>
              This order is canceled
            </Text>
          </View>
        ) : isSeller && order?.payment_method === 'cod' && order?.status === 'pending' ? (
          <Pressable
            onPress={handleCompleteCodOrder}
            disabled={completingCod}
            style={({ pressed }) => [
              {
                height: 48,
                borderRadius: 12,
                backgroundColor: theme.ink,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            {completingCod ? (
              <ActivityIndicator color={theme.background} size="small" />
            ) : (
              <>
                <Feather name="check-circle" size={16} color={theme.background} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.background, fontFamily: typography.family.sansBold }}>
                  Mark CoD Delivered & Paid
                </Text>
              </>
            )}
          </Pressable>
        ) : isSeller && !isShipped && isOrderActive ? (
          <Pressable
            onPress={() => setShowShipModal(true)}
            style={({ pressed }) => [
              {
                height: 48,
                borderRadius: 12,
                backgroundColor: theme.ink,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Feather name="truck" size={16} color={theme.background} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.background, fontFamily: typography.family.sansBold }}>
              Mark as Shipped
            </Text>
          </Pressable>
        ) : isBuyer && isShipped && order?.status !== 'completed' ? (
          <Pressable
            onPress={handleConfirmReceived}
            disabled={completingReceipt}
            style={({ pressed }) => [
              {
                height: 48,
                borderRadius: 12,
                backgroundColor: theme.purple,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            {completingReceipt ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="check" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', fontFamily: typography.family.sansBold }}>
                  Confirm Delivery (Everything is OK)
                </Text>
              </>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={handleContactOtherUser}
            style={({ pressed }) => [
              {
                height: 48,
                borderRadius: 12,
                backgroundColor: theme.ink,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Feather name="message-circle" size={16} color={theme.background} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.background, fontFamily: typography.family.sansBold }}>
              {isSeller ? 'Chat with Buyer' : 'Chat with Seller'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Cancel Order Modal */}
      <CancelOrderModal
        visible={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirmCancel={handleCancelOrder}
        isSeller={isSeller}
      />

      {/* Mark Shipped Modal */}
      <MarkShippedModal
        visible={showShipModal}
        onClose={() => setShowShipModal(false)}
        onConfirmShipped={handleMarkShipped}
      />
    </SafeAreaView>
  );
}

function MetaRow({ label, children, theme }: { label: string; children: React.ReactNode; theme: any }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
      }}
    >
      <Text style={{ fontSize: 13.5, color: theme.mute, fontFamily: typography.family.sansMedium }}>{label}</Text>
      {children}
    </View>
  );
}
