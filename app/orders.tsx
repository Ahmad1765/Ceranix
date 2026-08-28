import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Pressable,
  FlatList,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/auth';
import { RequireAuth } from '@/components/RequireAuth';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSellSheet } from '@/components/sell/SellSheet';
import { useMyOrdersQuery } from '@/lib/queries';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { deriveInvoiceAmounts } from '@/lib/invoiceStatus';
import { partitionOrders, type OrderSide } from '@/lib/orders';
import type { MyOrder } from '@/lib/payments';

type FilterStatus = 'all' | 'in_progress' | 'canceled' | 'completed';

function OrderRow({ order, side }: { order: MyOrder; side: OrderSide }) {
  const { theme } = useTheme();
  const { total } = deriveInvoiceAmounts(order, order.listing?.price, buyerProtectionFee);
  const image = order.listing ? cardImageUrl(order.listing, 0) : '';
  const isCanceled = order.status === 'canceled' || order.status === 'refunded';
  const isShipped = Boolean((order as any).shipped_at || (order as any).tracking_number);

  const handlePress = () => {
    tap();
    if (order.listing_id) {
      router.push(`/invoice/${order.listing_id}` as any);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      testID="order-row"
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      {/* Thumbnail */}
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 8,
          backgroundColor: theme.panel,
          borderWidth: 1,
          borderColor: theme.border,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
        }}
      >
        {image ? (
          <Image
            source={{ uri: getOptimizedImageUrl(image, { width: 160 }) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <Feather name="package" size={20} color={theme.muteSoft} />
        )}
      </View>

      {/* Item info */}
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text
          style={{
            fontSize: 14.5,
            fontWeight: '700',
            color: theme.ink,
            fontFamily: typography.family.sansBold,
            marginBottom: 2,
          }}
          numberOfLines={1}
        >
          {order.listing?.title ?? 'Order'}
        </Text>
        <Text
          style={{
            fontSize: 13.5,
            color: theme.mute,
            fontFamily: typography.family.sansMedium,
            marginBottom: 3,
          }}
        >
          {formatPrice(total)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Feather
            name={isCanceled ? 'x-circle' : isShipped ? 'truck' : 'check-circle'}
            size={12}
            color={isCanceled ? '#EF4444' : isShipped ? theme.purple : '#10B981'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              {
                fontSize: 12,
                fontWeight: '600',
                color: '#10B981',
                fontFamily: typography.family.sansSemibold,
              },
              isCanceled && { color: '#EF4444' },
              isShipped && { color: theme.purple },
            ]}
          >
            {isCanceled
              ? 'Order Canceled'
              : isShipped
              ? 'Shipped · In transit'
              : order.status === 'paid'
              ? 'Order Confirmed'
              : 'CoD · Awaiting delivery'}
          </Text>
        </View>
      </View>

      {/* Chevron */}
      <Feather name="chevron-right" size={18} color={theme.muteSoft} />
    </Pressable>
  );
}

function OrdersSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={{ paddingVertical: 6 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 8,
              backgroundColor: theme.panel,
              marginRight: 14,
            }}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ width: '60%', height: 14, borderRadius: 4, backgroundColor: theme.panel }} />
            <View style={{ width: '30%', height: 13, borderRadius: 4, backgroundColor: theme.panel }} />
            <View style={{ width: '45%', height: 12, borderRadius: 4, backgroundColor: theme.panel }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function OrdersScreen() {
  const { user } = useAuth();
  const sell = useSellSheet();
  const { theme } = useTheme();
  const { side: sideParam, justPaid, title: itemTitleParam, amount: amountParam, listingId: listingIdParam } = useLocalSearchParams<{
    side?: string;
    justPaid?: string;
    title?: string;
    amount?: string;
    listingId?: string;
  }>();

  const [side, setSide] = useState<OrderSide>(sideParam === 'sold' ? 'sold' : 'bought');
  const [filter, setFilter] = useState<FilterStatus>('in_progress');
  const [showToast, setShowToast] = useState(justPaid === '1' || justPaid === '0');

  const q = useMyOrdersQuery(user?.id ?? null);
  const { refetch } = q;

  const { bought, sold } = useMemo(
    () => partitionOrders(q.data ?? [], user?.id ?? ''),
    [q.data, user?.id],
  );

  // In development, synthesize recently purchased item if fresh from checkout and database replication is in flight
  const allBoughtOrders = useMemo(() => {
    if (__DEV__ && (justPaid === '1' || justPaid === '0') && itemTitleParam && !bought.some((b) => b.listing?.title === itemTitleParam)) {
      const parsedAmount = amountParam ? Number(amountParam) : 0;
      const targetListingId = listingIdParam || '';
      const mockOrder: MyOrder = {
        id: `recent_order_${Date.now()}`,
        listing_id: targetListingId,
        buyer_id: user?.id ?? 'buyer',
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
          id: targetListingId,
          title: itemTitleParam,
          price: parsedAmount,
          images: [],
        },
      };
      return [mockOrder, ...bought];
    }
    return bought;
  }, [bought, justPaid, itemTitleParam, amountParam, listingIdParam, user?.id]);

  useEffect(() => {
    if (justPaid === '1' || justPaid === '0') {
      refetch();
    }
  }, [justPaid, refetch]);

  const rawRows = side === 'bought' ? allBoughtOrders : sold;

  // Filter items based on active status chip
  const rows = useMemo(() => {
    if (filter === 'all') return rawRows;
    if (filter === 'in_progress') {
      return rawRows.filter((o) => o.status === 'pending' || o.status === 'paid');
    }
    if (filter === 'canceled') {
      return rawRows.filter((o) => o.status === 'canceled' || o.status === 'refunded');
    }
    if (filter === 'completed') {
      return rawRows.filter((o) => o.status === 'completed');
    }
    return rawRows;
  }, [rawRows, filter]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* ── Top Header: [<] My orders ── */}
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
          onPress={() => router.push('/(tabs)' as any)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </Pressable>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: theme.ink,
            fontFamily: typography.family.sansBold,
          }}
        >
          My orders
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Segmented Tabs: Sold | Bought ── */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        <Pressable
          onPress={() => {
            tap();
            setSide('sold');
          }}
          style={{
            flex: 1,
            paddingVertical: 13,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: side === 'sold' ? '700' : '500',
              color: side === 'sold' ? theme.ink : theme.mute,
              fontFamily: side === 'sold' ? typography.family.sansBold : typography.family.sansMedium,
            }}
          >
            Sold
          </Text>
          {side === 'sold' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                left: 24,
                right: 24,
                height: 2.5,
                backgroundColor: theme.purple,
                borderRadius: 1.5,
              }}
            />
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            tap();
            setSide('bought');
          }}
          style={{
            flex: 1,
            paddingVertical: 13,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: side === 'bought' ? '700' : '500',
              color: side === 'bought' ? theme.ink : theme.mute,
              fontFamily: side === 'bought' ? typography.family.sansBold : typography.family.sansMedium,
            }}
          >
            Bought
          </Text>
          {side === 'bought' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                left: 24,
                right: 24,
                height: 2.5,
                backgroundColor: theme.purple,
                borderRadius: 1.5,
              }}
            />
          )}
        </Pressable>
      </View>

      {/* ── Filter Pills: All | In progress | Canceled | Completed ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'in_progress', label: 'In progress' },
            { key: 'canceled', label: 'Canceled' },
            { key: 'completed', label: 'Completed' },
          ] as const
        ).map((item) => {
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
                  paddingHorizontal: 14,
                  paddingVertical: 6.5,
                  borderRadius: 20,
                  borderWidth: 1,
                  backgroundColor: active ? theme.purpleSoft : theme.panel,
                  borderColor: active ? theme.purple : theme.border,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active ? '700' : '500',
                  color: active ? theme.purple : theme.mute,
                  fontFamily: active ? typography.family.sansBold : typography.family.sansMedium,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Order List / Content ── */}
      {q.isPending && (side === 'sold' ? sold.length === 0 : allBoughtOrders.length === 0) ? (
        <OrdersSkeleton />
      ) : rows.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <EmptyState
            icon="shopping-bag"
            title={
              filter === 'in_progress'
                ? side === 'bought'
                  ? 'No orders in progress'
                  : 'No sales in progress'
                : filter === 'canceled'
                ? side === 'bought'
                  ? 'No canceled orders'
                  : 'No canceled sales'
                : filter === 'completed'
                ? side === 'bought'
                  ? 'No completed orders'
                  : 'No completed sales'
                : side === 'bought'
                ? 'No orders'
                : 'No sales'
            }
            description="When you buy or sell items, they will show up here."
            cta={{
              label: side === 'bought' ? 'Browse items' : 'List an item',
              onPress: () => (side === 'bought' ? router.push('/(tabs)' as any) : sell.open()),
              icon: side === 'bought' ? 'search' : 'plus',
            }}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderRow order={item} side={side} />}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: 88 }} />
          )}
          contentContainerStyle={{ paddingVertical: 4, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={onRefresh}
              tintColor={theme.purple}
            />
          }
        />
      )}

      {/* ── Toast Popup Banner at Bottom ── */}
      {showToast && (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: Platform.OS === 'ios' ? 24 : 16,
            zIndex: 99,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: theme.panel,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              paddingHorizontal: 16,
              paddingVertical: 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: theme.ink,
                  fontFamily: typography.family.sansMedium,
                  lineHeight: 18,
                }}
              >
                {justPaid === '1'
                  ? "Thank you, we have received your payment. It's being processed."
                  : "Your order has been placed. It's being processed."}
              </Text>
            </View>
            <Pressable onPress={() => setShowToast(false)} hitSlop={8} style={{ paddingLeft: 10 }}>
              <Feather name="x" size={16} color={theme.ink} />
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

export default function Orders() {
  return (
    <RequireAuth>
      <OrdersScreen />
    </RequireAuth>
  );
}
