import { memo, useState, useCallback, useMemo } from 'react';
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
import { partitionOrders, type OrderSide } from '@/lib/orders';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import type { MyOrder } from '@/lib/payments';

type FilterStatus = 'all' | 'in_progress' | 'canceled' | 'completed';

function OrderRow({ order, side }: { order: MyOrder; side: OrderSide }) {
  const { theme } = useTheme();
  const { total } = deriveInvoiceAmounts(order, order.listing?.price, buyerProtectionFee);
  const image = order.listing ? cardImageUrl(order.listing, 0) : '';
  const isCanceled = order.status === 'canceled' || order.status === 'refunded' || order.status === 'failed';
  const isShipped = Boolean(
    (order as any).shipped_at ||
    (order as any).shifted_at ||
    (order as any).tracking_number ||
    order.status === 'shifting' ||
    (order as any).fulfillment_status === 'shifting'
  );

  const handlePress = () => {
    tap();
    if (order.listing_id) {
      router.push(`/invoice/${order.listing_id}` as any);
    }
  };

  const fulfillment = (order as any).fulfillment_status;
  const isDisputed = fulfillment === 'disputed' || order.status === 'disputed';
  const isDelivered = fulfillment === 'delivered' || order.status === 'delivered';
  const isPacking = fulfillment === 'packing' || order.status === 'packing';
  const isCompleted = fulfillment === 'completed' || order.status === 'completed';
  const isAwaitingPayment = fulfillment === 'awaiting_payment' || order.status === 'awaiting_payment';

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
            fontSize: 13,
            color: theme.mute,
            fontFamily: typography.family.sansMedium,
            marginBottom: 3,
          }}
        >
          {formatPrice(total)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isDisputed ? (
            <ShieldCheckIcon size={13} style={{ marginRight: 4 }} />
          ) : (
            <Feather
              name={
                isCanceled ? 'x-circle' :
                isCompleted ? 'check-circle' :
                isDelivered ? 'package' :
                isShipped ? 'truck' :
                isPacking ? 'package' :
                isAwaitingPayment ? 'clock' :
                'check-circle'
              }
              size={12}
              color={
                isCanceled ? '#EF4444' :
                isCompleted ? '#10B981' :
                isDelivered ? theme.primary :
                isShipped ? theme.primary :
                isPacking ? theme.primary :
                isAwaitingPayment ? '#D97706' :
                '#10B981'
              }
              style={{ marginRight: 4 }}
            />
          )}
          <Text
            style={[
              {
                fontSize: 12,
                fontWeight: '600',
                color: '#10B981',
                fontFamily: typography.family.sansSemibold,
              },
              isCanceled && { color: '#EF4444' },
              (isShipped || isPacking || isDelivered) && { color: theme.primary },
              isAwaitingPayment && { color: '#D97706' },
              isDisputed && { color: theme.ink },
            ]}
          >
            {isCanceled
              ? 'Order Canceled'
              : isDisputed
              ? 'Dispute under review'
              : isCompleted
              ? 'Completed'
              : isDelivered
              ? (side === 'bought' ? 'Delivered · Please inspect' : 'Delivered · Awaiting completion')
              : isShipped
              ? 'Dispatched · In transit'
              : isPacking
              ? (order as any).fulfillment_type === 'dropship' ? 'Supplier Processing' : 'Packing order'
              : isAwaitingPayment
              ? 'Awaiting Payment'
              : order.payment_method === 'cod' && (order.status === 'pending' || fulfillment === 'pending')
              ? (side === 'bought' ? 'CoD · Pay on delivery' : 'CoD · Awaiting delivery')
              : 'Order Confirmed'}
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

export const OrdersInboxPage = memo(function OrdersInboxPage({
  userId,
  pageWidth,
  pageHeight,
  bottomInset,
}: {
  userId: string;
  pageWidth: number;
  pageHeight: number;
  bottomInset: number;
}) {
  const { theme, isDark } = useTheme();
  const sell = useSellSheet();
  const [subTab, setSubTab] = useState<OrderSide>('bought');
  const [filter, setFilter] = useState<FilterStatus>('in_progress');

  const q = useMyOrdersQuery(userId);
  const { refetch, isPending, isRefetching } = q;

  const { bought, sold } = useMemo(
    () => partitionOrders(q.data ?? [], userId),
    [q.data, userId],
  );

  const filterList = useCallback(
    (raw: MyOrder[]) => {
      if (filter === 'all') return raw;
      if (filter === 'in_progress') {
        return raw.filter(
          (o) =>
            o.status === 'pending' ||
            o.status === 'paid' ||
            o.status === 'awaiting_payment' ||
            o.status === 'packing' ||
            o.status === 'shifting' ||
            o.status === 'delivered' ||
            o.status === 'disputed' ||
            (o as any).fulfillment_status === 'pending' ||
            (o as any).fulfillment_status === 'awaiting_payment' ||
            (o as any).fulfillment_status === 'packing' ||
            (o as any).fulfillment_status === 'shifting' ||
            (o as any).fulfillment_status === 'delivered' ||
            (o as any).fulfillment_status === 'disputed',
        );
      }
      if (filter === 'canceled') {
        return raw.filter((o) => o.status === 'canceled' || o.status === 'refunded' || o.status === 'failed');
      }
      if (filter === 'completed') {
        return raw.filter((o) => o.status === 'completed' || (o as any).fulfillment_status === 'completed');
      }
      return raw;
    },
    [filter],
  );

  const orders = useMemo(() => {
    return filterList(subTab === 'bought' ? bought : sold);
  }, [subTab, bought, sold, filterList]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <View style={{ width: pageWidth, height: pageHeight, backgroundColor: theme.background }}>
      {/* Sub-toggle: Bought | Sold */}
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

      {/* Filter Status Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 8,
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
                  height: 30,
                  paddingHorizontal: 14,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  backgroundColor: active
                    ? isDark ? theme.panel : '#111111'
                    : isDark ? theme.surface : theme.panel,
                  borderColor: active
                    ? isDark ? theme.border : '#111111'
                    : theme.border,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: active ? '700' : '500',
                  color: active ? '#FFFFFF' : theme.mute,
                  fontFamily: active ? typography.family.sansBold : typography.family.sansMedium,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Orders List */}
      {isPending && orders.length === 0 ? (
        <OrdersSkeleton />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderRow order={item} side={subTab} />}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: 88 }} />
          )}
          contentContainerStyle={[
            { paddingVertical: 4, paddingBottom: bottomInset + 20 },
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
                    : filter === 'completed'
                    ? subTab === 'bought'
                      ? 'No completed orders'
                      : 'No completed sales'
                    : subTab === 'bought'
                    ? 'No orders'
                    : 'No sales'
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
