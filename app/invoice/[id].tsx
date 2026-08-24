import { useEffect, useState, useRef } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, Share, Platform, Linking } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { useListingQuery } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { fetchOrderForListing, type Order } from '@/lib/payments';
import { deriveInvoiceStatus, deriveInvoiceAmounts, type InvoiceStatus } from '@/lib/invoiceStatus';
import { confirm } from '@/lib/confirm';
import { paymentService } from '@/lib/paymentService';
import { generateMapsLink } from '@/lib/maps';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
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

function displayHandle(username: string | null | undefined): string {
  if (!username) return '—';
  return '@' + stripHexSuffix(username);
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

  const listingQ = useListingQuery(id ? String(id) : null);
  const listing = listingQ.data ?? null;

  const [order, setOrder] = useState<Order | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [completingCod, setCompletingCod] = useState(false);

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
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
        >
          <Feather name="file-text" size={28} color={colors.mute} />
          <Text
            style={{
              fontSize: 17,
              fontWeight: '800',
              color: colors.ink,
              marginTop: 14,
              letterSpacing: -0.3,
            }}
          >
            Invoice not found
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.mute,
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

  const {
    item: itemPrice,
    fee,
    total,
  } = deriveInvoiceAmounts(order, listing.price, buyerProtectionFee);
  const seller = listing.seller;
  const isSeller = (user?.id && (user.id === listing.seller_id || user.id === seller?.id)) || false;
  const invoiceNumber = deriveInvoiceNumber(listing.id);
  const issueDate = listing.created_at;
  const dueDate = listing.created_at
    ? new Date(new Date(listing.created_at).getTime() + 14 * 86400_000).toISOString()
    : null;
  const sellerName = displayName(seller?.full_name, seller?.username);
  const sellerHandle = displayHandle(seller?.username);
  const buyerName = displayName(profile?.full_name, profile?.username);
  const buyerHandle = displayHandle(profile?.username);
  const status = deriveInvoiceStatus(order, confirming);
  const heroImage = listing.images?.[0];
  const mapsUrl = generateMapsLink(order?.shipping_address);

  const onShare = async () => {
    tap('light');
    try {
      await Share.share({
        message: `Invoice ${invoiceNumber}\n${listing.title} · ${formatPrice(total)}`,
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
      `📦 *CERANIX DISPATCH SLIP*`,
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

  const onPay = () => {
    tap('medium');
    router.push(`/payment/${listing.id}` as any);
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
    // Optimistic UI Update
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
      // Revert optimistic update on failure
      setOrder(previousOrder);
      toast.show(e?.message ?? 'Failed to complete order', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setCompletingCod(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }} edges={['top']}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 6,
          paddingBottom: 14,
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
          <Feather name="arrow-left" size={20} color={colors.ink} />
        </Pressable>
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
          <Feather name="share" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Purple document panel */}
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: colors.primary,
            borderRadius: 32,
            paddingHorizontal: 26,
            paddingTop: 22,
            paddingBottom: 24,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1, paddingRight: 16, minWidth: 0 }}>
              <Text style={InkEyebrow}>From (Seller)</Text>
              <Text
                style={InkAddress}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {sellerName}
              </Text>
              <Text
                style={InkAddressMute}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {sellerHandle}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end', minWidth: 0 }}>
              <Text style={[InkEyebrow, { textAlign: 'right' }]}>Billed to</Text>
              <Text
                style={[InkAddress, { textAlign: 'right' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {buyerName}
              </Text>
              <Text
                style={[InkAddressMute, { textAlign: 'right' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {buyerHandle}
              </Text>
            </View>
          </View>

          {/* Hero */}
          <View style={{ marginTop: 32, marginBottom: 28 }}>
            <Text
              style={{
                fontSize: 54,
                fontWeight: '900',
                color: colors.ink,
                letterSpacing: -2.4,
                lineHeight: 56,
              }}
            >
              INVOICE
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 54,
                fontWeight: '900',
                color: colors.ink,
                letterSpacing: -2.4,
                lineHeight: 56,
                marginTop: 2,
              }}
            >
              {invoiceNumber}
            </Text>
          </View>

          {/* Dates strip */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: 'rgba(15,15,15,0.18)',
              paddingTop: 12,
            }}
          >
            <View>
              <Text style={InkEyebrow}>Issued</Text>
              <Text style={InkValue}>{formatDate(issueDate)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[InkEyebrow, { textAlign: 'right' }]}>Due</Text>
              <Text style={[InkValue, { textAlign: 'right' }]}>{formatDate(dueDate)}</Text>
            </View>
          </View>
        </View>

        {/* White summary */}
        <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
          {/* Item hero row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: colors.primarySofter,
                overflow: 'hidden',
                marginRight: 14,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {heroImage ? (
                <Image
                  source={{ uri: heroImage }}
                  style={{ width: 56, height: 56 }}
                  contentFit="cover"
                />
              ) : (
                <Feather name="package" size={20} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: colors.ink,
                  letterSpacing: -0.3,
                }}
                numberOfLines={1}
              >
                {listing.title}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.mute,
                  marginTop: 3,
                  textTransform: 'capitalize',
                }}
              >
                {listing.category} · Qty 1
              </Text>
            </View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: colors.ink,
                letterSpacing: -0.3,
              }}
            >
              {formatPrice(itemPrice)}
            </Text>
          </View>

          {/* Meta rows */}
          <View style={{ marginTop: 22 }}>
            <MetaRow label="Status">
              <StatusPill status={status} isSeller={isSeller} />
            </MetaRow>

            <MetaRow label="Payment Method">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather
                  name={order?.payment_method === 'cod' ? 'truck' : 'credit-card'}
                  size={14}
                  color={colors.primary}
                />
                <Text style={MetaValue}>
                  {order?.payment_method === 'cod'
                    ? 'Cash on Delivery (CoD)'
                    : 'Credit / Debit Card'}
                </Text>
              </View>
            </MetaRow>

            <Pressable
              onPress={() => {
                if (seller?.id) {
                  tap('light');
                  router.push(`/user/${seller.id}` as any);
                }
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
            >
              <MetaRow label="Seller">
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={MetaValue}>@{seller?.username ?? 'unknown'}</Text>
                  <Feather
                    name="chevron-right"
                    size={16}
                    color="rgba(15,15,15,0.55)"
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </MetaRow>
            </Pressable>

            <MetaRow label="Reference">
              <Text style={MetaValue}>#{invoiceNumber}</Text>
            </MetaRow>
            <MetaRow label="Item">
              <Text style={MetaValue}>{formatPrice(itemPrice)}</Text>
            </MetaRow>
            {fee > 0 ? (
              <MetaRow label="Buyer Protection">
                <Text style={MetaValue}>{formatPrice(fee)}</Text>
              </MetaRow>
            ) : null}
          </View>

          {/* ── Delivery & Dispatch Logistics Card ────────────────────────── */}
          {order?.shipping_address ? (
            <View
              style={{
                marginTop: 18,
                backgroundColor: colors.panel,
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(15,15,15,0.06)',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="map-pin" size={15} color={colors.primary} />
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink }}>
                    Delivery Destination
                  </Text>
                </View>

                {/* Google Maps link button */}
                {mapsUrl ? (
                  <Pressable
                    onPress={() => {
                      tap('light');
                      Linking.openURL(mapsUrl).catch((err) => {
                        console.warn('[invoice] openURL failed', err);
                      });
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: colors.white,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Feather name="external-link" size={12} color={colors.primary} />
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary }}>
                      Maps
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                {order.shipping_address.recipient_name ?? buyerName}
              </Text>
              <Text style={{ fontSize: 13, color: colors.mute, marginTop: 2 }}>
                {[order.shipping_address.line1, order.shipping_address.line2].filter(Boolean).join(', ')}
              </Text>
              <Text style={{ fontSize: 13, color: colors.mute, marginTop: 1 }}>
                {[order.shipping_address.city, order.shipping_address.state, order.shipping_address.postal_code].filter(Boolean).join(', ')}
              </Text>
              {order.shipping_address.phone ? (
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: 4 }}>
                  📞 {order.shipping_address.phone}
                </Text>
              ) : null}
              {order.delivery_notes ? (
                <View
                  style={{
                    marginTop: 8,
                    padding: 8,
                    backgroundColor: colors.white,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.mute }}>
                    <Text style={{ fontWeight: '700', color: colors.ink }}>Note: </Text>
                    {order.delivery_notes}
                  </Text>
                </View>
              ) : null}

              {/* Prominent Share Dispatch Slip Button for Seller */}
              {isSeller ? (
                <Pressable
                  onPress={onShareDispatchSlip}
                  style={({ pressed }) => ({
                    marginTop: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    backgroundColor: colors.white,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderWidth: 1,
                    borderColor: 'rgba(15,15,15,0.1)',
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Feather name="send" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>
                    Share Dispatch Slip (with Maps Link)
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Total */}
          <View
            style={{
              marginTop: 18,
              paddingTop: 22,
              borderTopWidth: 1,
              borderTopColor: colors.hairline,
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: colors.mute,
                paddingBottom: 6,
              }}
            >
              {order?.payment_method === 'cod' ? 'Total due on delivery' : 'Total due'}
            </Text>
            <Text
              style={{
                fontSize: 44,
                fontWeight: '900',
                color: colors.ink,
                letterSpacing: -2,
                lineHeight: 46,
              }}
            >
              {formatPrice(total)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom action */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 24,
          pointerEvents: 'box-none',
        }}
      >
        {status === 'paid' ? (
          <Pressable
            onPress={() => {
              tap('light');
              toast.show('Download coming soon', { variant: 'info', icon: 'download' });
            }}
            style={({ pressed }) => ({
              height: 56,
              borderRadius: 999,
              backgroundColor: colors.ink,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.14,
              shadowRadius: 16,
              elevation: 5,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <Feather name="download" size={16} color={colors.white} />
            <Text
              style={{
                marginLeft: 10,
                fontSize: 15,
                fontWeight: '800',
                color: colors.white,
                letterSpacing: 0.2,
              }}
            >
              Download invoice
            </Text>
          </Pressable>
        ) : status === 'cod_pending' ? (
          isSeller && !order?.id?.startsWith('order_demo') ? (
            /* Seller Action: Mark Cash Collected & Delivered */
            <Pressable
              onPress={handleCompleteCodOrder}
              disabled={completingCod}
              style={({ pressed }) => ({
                height: 60,
                borderRadius: 999,
                backgroundColor: colors.primary,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 20,
                gap: 10,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.16,
                shadowRadius: 16,
                elevation: 5,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              {completingCod ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Feather name="check-circle" size={18} color={colors.white} />
              )}
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '800',
                  color: colors.white,
                  letterSpacing: 0.2,
                }}
              >
                {completingCod ? 'Updating order…' : 'Mark Cash Collected & Delivered'}
              </Text>
            </Pressable>
          ) : (
            /* Buyer CoD confirmation state */
            <View
              accessibilityRole="text"
              style={{
                height: 60,
                borderRadius: 999,
                backgroundColor: colors.primarySofter,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 16,
                gap: 10,
                borderWidth: 1,
                borderColor: colors.primary,
              }}
            >
              <Feather name="truck" size={16} color={colors.primary} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: colors.primaryDeep,
                  letterSpacing: 0.1,
                }}
              >
                Pay {formatPrice(total)} to courier on delivery
              </Text>
            </View>
          )
        ) : status === 'confirming' ? (
          <View
            accessibilityRole="text"
            style={{
              height: 64,
              borderRadius: 999,
              backgroundColor: colors.panel,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <ActivityIndicator size="small" color={colors.ink} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: colors.ink,
                letterSpacing: 0.2,
              }}
            >
              Confirming your payment…
            </Text>
          </View>
        ) : status === 'refunded' ? (
          <View
            accessibilityRole="text"
            style={{
              height: 64,
              borderRadius: 999,
              backgroundColor: colors.panel,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <Feather name="rotate-ccw" size={16} color={colors.ink} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: colors.ink,
                letterSpacing: 0.2,
              }}
            >
              Refunded to your card
            </Text>
          </View>
        ) : status === 'canceled' ? (
          <View
            accessibilityRole="text"
            style={{
              height: 64,
              borderRadius: 999,
              backgroundColor: colors.panel,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <Feather name="x-circle" size={16} color={colors.ink} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: colors.ink,
                letterSpacing: 0.2,
              }}
            >
              Order canceled
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={onPay}
            style={({ pressed }) => ({
              height: 64,
              borderRadius: 999,
              backgroundColor: colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.16,
              shadowRadius: 18,
              elevation: 6,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.white,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="arrow-right" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '900',
                  color: colors.white,
                  letterSpacing: 0.2,
                  marginRight: 48,
                }}
              >
                Pay {formatPrice(total)}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
      }}
    >
      <Text style={MetaLabel}>{label}</Text>
      {children}
    </View>
  );
}

function StatusPill({
  status,
  isSeller,
}: {
  status: InvoiceStatus;
  isSeller?: boolean;
}) {
  const paid = status === 'paid';
  const codPending = status === 'cod_pending';
  const confirming = status === 'confirming';
  const refunded = status === 'refunded';
  const canceled = status === 'canceled';
  const failed = status === 'failed';

  const icon = paid
    ? 'check'
    : codPending
      ? 'truck'
      : refunded
        ? 'rotate-ccw'
        : canceled
          ? 'x-circle'
          : failed
            ? 'alert-circle'
            : confirming
              ? 'loader'
              : 'clock';

  const label = paid
    ? 'Paid'
    : codPending
      ? isSeller
        ? 'CoD · Awaiting collection'
        : 'CoD · Pay on delivery'
      : refunded
        ? 'Refunded'
        : canceled
          ? 'Canceled'
          : failed
            ? 'Failed'
            : confirming
              ? 'Confirming'
              : 'Pending';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 12,
        height: 28,
        borderRadius: 999,
        backgroundColor: paid
          ? colors.primarySofter
          : codPending
            ? colors.primarySofter
            : colors.panel,
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          backgroundColor: paid
            ? colors.primary
            : codPending
              ? colors.primary
              : colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 6,
        }}
      >
        <Feather name={icon as any} size={10} color={colors.white} />
      </View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '800',
          color: colors.ink,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const InkEyebrow = {
  fontSize: 10,
  fontWeight: '700' as const,
  color: 'rgba(15,15,15,0.55)',
  letterSpacing: 1.2,
  textTransform: 'uppercase' as const,
};

const InkAddress = {
  fontSize: 13,
  fontWeight: '700' as const,
  color: colors.ink,
  marginTop: 4,
};

const InkAddressMute = {
  fontSize: 12,
  color: 'rgba(15,15,15,0.62)',
  marginTop: 2,
};

const InkValue = {
  fontSize: 13,
  fontWeight: '700' as const,
  color: colors.ink,
  marginTop: 4,
};

const MetaLabel = {
  fontSize: 14,
  color: colors.mute,
  fontWeight: '500' as const,
};

const MetaValue = {
  fontSize: 14,
  fontWeight: '700' as const,
  color: colors.ink,
};
