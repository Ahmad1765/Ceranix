import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSellSheet } from '@/components/sell/SellSheet';
import { useMyOrdersQuery } from '@/lib/queries';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { deriveInvoiceAmounts } from '@/lib/invoiceStatus';
import { partitionOrders, getOrderCategory, type OrderSide, type OrderCategory } from '@/lib/orders';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import type { MyOrder } from '@/lib/payments';

type FilterStatus = 'all' | OrderCategory;

const FILTER_CHIPS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'canceled', label: 'Canceled' },
];

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function deriveOrderCode(id: string): string {
  const hex = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `#${hex}`;
}

function getOrderStatusInfo(order: MyOrder, side: OrderSide, isDark: boolean) {
  const fulfillment = (((order as any).fulfillment_status ?? '') as string).toLowerCase();
  const status = (order.status ?? '').toLowerCase();

  const isDisputed = fulfillment === 'disputed' || status === 'disputed';
  const isCanceled = status === 'canceled' || status === 'failed' || fulfillment === 'canceled';
  const isRefunded =
    status === 'refunded' ||
    status === 'refund_due' ||
    status === 'partially_refunded' ||
    fulfillment === 'refunded';
  const isCompleted = fulfillment === 'completed' || status === 'completed';
  const isDelivered = fulfillment === 'delivered' || status === 'delivered';
  const isShipped = Boolean(
    (order as any).shipped_at ||
      (order as any).shifted_at ||
      (order as any).tracking_number ||
      status === 'shifting' ||
      fulfillment === 'shifting',
  );
  const isPacking = fulfillment === 'packing' || status === 'packing';
  const isAwaitingPayment = fulfillment === 'awaiting_payment' || status === 'awaiting_payment';
  const isCodPending = order.payment_method === 'cod' && (status === 'pending' || fulfillment === 'pending');

  if (isRefunded) {
    return {
      label: status === 'refund_due' ? 'Refund Pending' : 'Refunded',
      color: '#D97706',
      bg: isDark ? 'rgba(217, 119, 6, 0.16)' : '#FEF3C7',
      icon: <Feather name="rotate-ccw" size={12} color="#D97706" style={{ marginRight: 4 }} />,
      description: 'Refund issued to original payment method',
    };
  }

  if (isCanceled) {
    return {
      label: status === 'failed' ? 'Payment Failed' : 'Order Canceled',
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2',
      icon: <Feather name="x-circle" size={12} color="#EF4444" style={{ marginRight: 4 }} />,
      description: status === 'failed' ? 'Payment could not be processed' : 'Order was canceled',
    };
  }

  if (isDisputed) {
    return {
      label: 'Dispute in Review',
      color: '#5356EE',
      bg: isDark ? 'rgba(83, 86, 238, 0.16)' : '#F2F3FE',
      icon: <ShieldCheckIcon size={13} style={{ marginRight: 4 }} />,
      description: 'Ceranix Protection is reviewing this order',
    };
  }

  if (isCompleted) {
    return {
      label: 'Completed',
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
      icon: <Feather name="check-circle" size={12} color="#10B981" style={{ marginRight: 4 }} />,
      description: side === 'bought' ? 'Transaction complete · Item received' : 'Sale completed · Payout processed',
    };
  }

  if (isDelivered) {
    return {
      label: side === 'bought' ? 'Delivered · Inspect' : 'Delivered',
      color: '#6C47FF',
      bg: isDark ? 'rgba(108, 71, 255, 0.16)' : '#EEF2FF',
      icon: <Feather name="package" size={12} color="#6C47FF" style={{ marginRight: 4 }} />,
      description: side === 'bought' ? 'Delivered to your address · Please inspect' : 'Buyer has received package',
    };
  }

  if (isShipped) {
    const tracking = (order as any).tracking_number;
    return {
      label: 'In Transit',
      color: '#4F46E5',
      bg: isDark ? 'rgba(79, 70, 229, 0.16)' : '#EEF2FF',
      icon: <Feather name="truck" size={12} color="#4F46E5" style={{ marginRight: 4 }} />,
      description: tracking ? `Dispatched · Tracking: ${tracking}` : 'Package is on the way',
    };
  }

  if (isPacking) {
    const isDropship = (order as any).fulfillment_type === 'dropship';
    return {
      label: side === 'bought' ? (isDropship ? 'Processing' : 'Packing Order') : 'Prepare Shipment',
      color: '#2563EB',
      bg: isDark ? 'rgba(37, 99, 235, 0.16)' : '#EFF6FF',
      icon: <Feather name="box" size={12} color="#2563EB" style={{ marginRight: 4 }} />,
      description: side === 'bought' ? 'Seller is preparing your order' : 'Please package item for shipping',
    };
  }

  if (isAwaitingPayment) {
    return {
      label: 'Awaiting Payment',
      color: '#D97706',
      bg: isDark ? 'rgba(217, 119, 6, 0.16)' : '#FEF3C7',
      icon: <Feather name="clock" size={12} color="#D97706" style={{ marginRight: 4 }} />,
      description: 'Awaiting payment confirmation',
    };
  }

  if (isCodPending) {
    return {
      label: side === 'bought' ? 'CoD · Pay on Delivery' : 'CoD Confirmed',
      color: '#D97706',
      bg: isDark ? 'rgba(217, 119, 6, 0.16)' : '#FEF3C7',
      icon: <Feather name="clock" size={12} color="#D97706" style={{ marginRight: 4 }} />,
      description: side === 'bought' ? 'Pay cash upon delivery at your door' : 'Cash on delivery order confirmed',
    };
  }

  return {
    label: side === 'bought' ? 'Order Confirmed' : 'New Order',
    color: '#10B981',
    bg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
    icon: <Feather name="check" size={12} color="#10B981" style={{ marginRight: 4 }} />,
    description: 'Order confirmed and placed successfully',
  };
}

function OrderCard({ order, side }: { order: MyOrder; side: OrderSide }) {
  const { theme, isDark } = useTheme();
  const { total } = deriveInvoiceAmounts(order, order.listing?.price, buyerProtectionFee);
  const image = order.listing ? cardImageUrl(order.listing, 0) : '';

  const handlePress = () => {
    tap();
    const targetId = order.listing_id || order.id;
    if (targetId) {
      router.push(`/invoice/${targetId}` as any);
    }
  };

  const statusInfo = getOrderStatusInfo(order, side, isDark);
  const dateFormatted = formatDate(order.created_at);
  const orderCode = deriveOrderCode(order.id);
  const isCod = order.payment_method === 'cod';

  return (
    <Pressable
      onPress={handlePress}
      testID="order-row"
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          marginHorizontal: 16,
          marginBottom: 12,
          backgroundColor: theme.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? theme.border : '#E5E7EB',
          overflow: 'hidden',
          ...(Platform.OS !== 'web'
            ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1.5 },
                shadowOpacity: isDark ? 0.25 : 0.04,
                shadowRadius: 5,
                elevation: 2,
              }
            : {
                boxShadow: isDark
                  ? '0 2px 8px rgba(0,0,0,0.3)'
                  : '0 2px 8px rgba(0,0,0,0.04)',
              }),
        },
        pressed && { opacity: 0.88, transform: [{ scale: 0.995 }] },
      ]}
    >
      {/* Card Header: Date & Order Code + Status Badge */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 10,
        }}
      >
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {dateFormatted ? (
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: typography.family.sansMedium,
                  color: theme.mute,
                }}
              >
                {dateFormatted}
              </Text>
            ) : null}
            {dateFormatted && orderCode ? (
              <Text style={{ fontSize: 11, color: theme.muteSoft }}>·</Text>
            ) : null}
            <Text
              style={{
                fontSize: 12,
                fontFamily: typography.family.sansMedium,
                color: theme.mute,
              }}
            >
              {orderCode}
            </Text>
          </View>
        </View>

        {/* Status Badge */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 9,
            paddingVertical: 4.5,
            borderRadius: 7,
            backgroundColor: statusInfo.bg,
          }}
        >
          {statusInfo.icon}
          <Text
            style={{
              fontSize: 11.5,
              fontWeight: '700',
              fontFamily: typography.family.sansBold,
              color: statusInfo.color,
            }}
          >
            {statusInfo.label}
          </Text>
        </View>
      </View>

      {/* Card Divider */}
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          backgroundColor: isDark ? theme.border : '#F3F4F6',
          marginHorizontal: 14,
        }}
      />

      {/* Card Body: Thumbnail + Details */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        {/* Thumbnail */}
        <View
          style={{
            width: 66,
            height: 66,
            borderRadius: 10,
            backgroundColor: theme.panel,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          {image ? (
            <Image
              source={{ uri: getOptimizedImageUrl(image, { width: 180 }) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={IMAGE_TRANSITION}
            />
          ) : (
            <Feather name="package" size={24} color={theme.muteSoft} />
          )}
        </View>

        {/* Info */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: '700',
              color: theme.ink,
              fontFamily: typography.family.sansBold,
              lineHeight: 19,
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {order.listing?.title ?? 'Item purchased'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: theme.ink,
                fontFamily: typography.family.sansBold,
              }}
            >
              {formatPrice(total)}
            </Text>
            <Text
              style={{
                fontSize: 11.5,
                color: theme.mute,
                fontFamily: typography.family.sansMedium,
              }}
            >
              {isCod ? '· Cash on Delivery' : '· Paid Online'}
            </Text>
          </View>
        </View>
      </View>

      {/* Card Footer: Contextual message + View Details link */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: isDark ? theme.border : '#F3F4F6',
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontFamily: typography.family.sansMedium,
            color: theme.mute,
            flex: 1,
            marginRight: 10,
          }}
          numberOfLines={1}
        >
          {statusInfo.description}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              fontFamily: typography.family.sansSemibold,
              color: theme.purple,
            }}
          >
            View Details
          </Text>
          <Feather name="chevron-right" size={14} color={theme.purple} />
        </View>
      </View>
    </Pressable>
  );
}

function OrdersSkeleton() {
  const { theme, isDark } = useTheme();
  return (
    <View style={{ paddingVertical: 10 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            backgroundColor: theme.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: isDark ? theme.border : '#E5E7EB',
            padding: 14,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ width: 120, height: 12, borderRadius: 4, backgroundColor: theme.panel }} />
            <View style={{ width: 80, height: 22, borderRadius: 6, backgroundColor: theme.panel }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 66, height: 66, borderRadius: 10, backgroundColor: theme.panel }} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ width: '80%', height: 14, borderRadius: 4, backgroundColor: theme.panel }} />
              <View style={{ width: '40%', height: 13, borderRadius: 4, backgroundColor: theme.panel }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export const OrdersInboxPage = memo(function OrdersInboxPage({
  userId,
  pageWidth,
  pageHeight,
  bottomInset,
  initialSide = 'bought',
  justPaid,
  recentTitle,
  recentAmount,
}: {
  userId: string;
  pageWidth: number;
  pageHeight: number;
  bottomInset: number;
  initialSide?: OrderSide;
  justPaid?: string;
  recentTitle?: string;
  recentAmount?: string;
}) {
  const { theme, isDark } = useTheme();
  const sell = useSellSheet();
  const [subTab, setSubTab] = useState<OrderSide>(initialSide);
  const [filter, setFilter] = useState<FilterStatus>('in_progress');
  const [showToast, setShowToast] = useState(justPaid === '1' || justPaid === '0');

  useEffect(() => {
    if (initialSide) setSubTab(initialSide);
  }, [initialSide]);

  useEffect(() => {
    if (justPaid === '1' || justPaid === '0') {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 7000);
      return () => clearTimeout(timer);
    }
  }, [justPaid]);

  const q = useMyOrdersQuery(userId);
  const { refetch, isPending, isRefetching } = q;

  const { bought, sold } = useMemo(
    () => partitionOrders(q.data ?? [], userId),
    [q.data, userId],
  );

  const allBoughtOrders = useMemo(() => {
    if ((justPaid === '1' || justPaid === '0') && recentTitle && !bought.some((b) => b.listing?.title === recentTitle)) {
      const parsedAmount = recentAmount ? Number(recentAmount) : 0;
      const mockOrder: MyOrder = {
        id: `recent_order_${Date.now()}`,
        listing_id: `mock_listing_${Date.now()}`,
        buyer_id: userId,
        seller_id: 'seller',
        amount_cents: Math.round(parsedAmount * 100),
        fee_cents: 0,
        currency: 'pkr',
        payment_method: justPaid === '1' ? 'card' : 'cod',
        status: justPaid === '1' ? 'paid' : 'pending',
        shipping_address: null,
        delivery_notes: null,
        created_at: new Date().toISOString(),
        listing: {
          id: `mock_listing_${Date.now()}`,
          title: recentTitle,
          price: parsedAmount,
          images: [],
        },
      };
      return [mockOrder, ...bought];
    }
    return bought;
  }, [bought, justPaid, recentTitle, recentAmount, userId]);

  const filterList = useCallback(
    (raw: MyOrder[]) => {
      if (filter === 'all') return raw;
      return raw.filter((o) => getOrderCategory(o) === filter);
    },
    [filter],
  );

  const orders = useMemo(() => {
    return filterList(subTab === 'bought' ? allBoughtOrders : sold);
  }, [subTab, allBoughtOrders, sold, filterList]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <View style={{ width: pageWidth, height: pageHeight > 0 ? pageHeight : undefined, flex: 1, backgroundColor: theme.background }}>
      {/* Toast banner after checkout */}
      {showToast && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            padding: 12,
            borderRadius: 12,
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Feather name="check-circle" size={16} color="#10B981" />
            <Text style={{ fontSize: 13, color: isDark ? '#6EE7B7' : '#065F46', fontFamily: typography.family.sansMedium, flex: 1 }}>
              {justPaid === '1'
                ? `Payment successful! Your order${recentTitle ? ` for "${recentTitle}"` : ''} is confirmed.`
                : `Order placed! Cash on delivery confirmed${recentTitle ? ` for "${recentTitle}"` : ''}.`}
            </Text>
          </View>
          <Pressable onPress={() => setShowToast(false)} hitSlop={8}>
            <Feather name="x" size={15} color={isDark ? '#6EE7B7' : '#065F46'} />
          </Pressable>
        </View>
      )}

      {/* Sub-toggle: Purchases | Sales */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 8,
          backgroundColor: theme.background,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: isDark ? theme.panel : '#F3F4F6',
            borderRadius: 20,
            padding: 3,
            width: '100%',
            maxWidth: 340,
          }}
        >
          <Pressable
            onPress={() => {
              tap();
              setSubTab('bought');
            }}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: subTab === 'bought' ? (isDark ? theme.surface : '#FFFFFF') : 'transparent',
              ...(subTab === 'bought' && Platform.OS !== 'web'
                ? {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 1,
                  }
                : {}),
            }}
          >
            <Text
              style={{
                fontFamily: subTab === 'bought' ? typography.family.sansBold : typography.family.sansMedium,
                fontSize: 13.5,
                color: subTab === 'bought' ? theme.ink : theme.mute,
              }}
            >
              Purchases ({bought.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              tap();
              setSubTab('sold');
            }}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: subTab === 'sold' ? (isDark ? theme.surface : '#FFFFFF') : 'transparent',
              ...(subTab === 'sold' && Platform.OS !== 'web'
                ? {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 1,
                  }
                : {}),
            }}
          >
            <Text
              style={{
                fontFamily: subTab === 'sold' ? typography.family.sansBold : typography.family.sansMedium,
                fontSize: 13.5,
                color: subTab === 'sold' ? theme.ink : theme.mute,
              }}
            >
              Sales ({sold.length})
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Filter Status Chips (Image 3 design: squircle, bold labels) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 8,
          alignItems: 'center',
        }}
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          backgroundColor: theme.background,
          flexGrow: 0,
        }}
      >
        {FILTER_CHIPS.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                tap();
                setFilter(item.key);
              }}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active
                    ? (isDark ? '#FFFFFF' : '#18181B')
                    : (isDark ? theme.panel : '#F3F4F6'),
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: active ? '700' : '600',
                  color: active
                    ? (isDark ? '#111111' : '#FFFFFF')
                    : (isDark ? '#E5E7EB' : '#1F1F1F'),
                  fontFamily: active ? typography.family.sansBold : typography.family.sansSemibold,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Orders List (Modern Card UI) */}
      {isPending && orders.length === 0 ? (
        <OrdersSkeleton />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderCard order={item} side={subTab} />}
          contentContainerStyle={[
            { paddingTop: 12, paddingBottom: bottomInset + 20 },
            orders.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={theme.purple}
            />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
              <EmptyState
                icon="shopping-bag"
                title={
                  filter === 'in_progress'
                    ? subTab === 'bought'
                      ? 'No orders in progress'
                      : 'No sales in progress'
                    : filter === 'canceled'
                    ? subTab === 'bought'
                      ? 'No canceled orders'
                      : 'No canceled sales'
                    : filter === 'refunds'
                    ? subTab === 'bought'
                      ? 'No refunds'
                      : 'No refunded sales'
                    : filter === 'completed'
                    ? subTab === 'bought'
                      ? 'No completed orders'
                      : 'No completed sales'
                    : subTab === 'bought'
                    ? 'No purchases yet'
                    : 'No sales yet'
                }
                description="When you buy or sell items, they will show up here."
                cta={{
                  label: subTab === 'bought' ? 'Browse items' : 'List an item',
                  onPress: () => (subTab === 'bought' ? router.push('/(tabs)' as any) : sell.open()),
                  icon: subTab === 'bought' ? 'search' : 'plus',
                }}
              />
            </View>
          }
        />
      )}
    </View>
  );
});

