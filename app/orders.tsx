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
import { colors } from '@/lib/theme';
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

const TEAL = '#007782';

type FilterStatus = 'all' | 'in_progress' | 'canceled' | 'completed';

function OrderRow({ order, side }: { order: MyOrder; side: OrderSide }) {
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
        styles.orderRow,
        pressed && { opacity: 0.75 },
      ]}
    >
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {image ? (
          <Image
            source={{ uri: getOptimizedImageUrl(image, { width: 160 }) }}
            style={styles.thumbnailImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <Feather name="package" size={20} color="#9CA3AF" />
        )}
      </View>

      {/* Item info */}
      <View style={styles.orderInfo}>
        <Text style={styles.orderTitle} numberOfLines={1}>
          {order.listing?.title ?? 'Order'}
        </Text>
        <Text style={styles.orderPrice}>
          {formatPrice(total)}
        </Text>
        <View style={styles.statusRow}>
          <Feather
            name={isCanceled ? 'x-circle' : isShipped ? 'truck' : 'check-circle'}
            size={12}
            color={isCanceled ? '#DC2626' : isShipped ? TEAL : '#059669'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.statusText,
              isCanceled && { color: '#DC2626' },
              isShipped && { color: TEAL },
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
      <Feather name="chevron-right" size={18} color="#9CA3AF" />
    </Pressable>
  );
}

function OrdersSkeleton() {
  return (
    <View style={{ paddingVertical: 6 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonThumb} />
          <View style={styles.skeletonContent}>
            <View style={[styles.skeletonBar, { width: '60%', height: 14 }]} />
            <View style={[styles.skeletonBar, { width: '30%', height: 13 }]} />
            <View style={[styles.skeletonBar, { width: '45%', height: 12 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function OrdersScreen() {
  const { user } = useAuth();
  const sell = useSellSheet();
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
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      {/* ── Top Header: [<] My orders ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/(tabs)' as any)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.5 }]}
        >
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>My orders</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* ── Segmented Tabs: Sold | Bought ── */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => {
            tap();
            setSide('sold');
          }}
          style={styles.tabButton}
        >
          <Text style={[styles.tabText, side === 'sold' && styles.tabTextActive]}>
            Sold
          </Text>
          {side === 'sold' && <View style={styles.tabUnderline} />}
        </Pressable>

        <Pressable
          onPress={() => {
            tap();
            setSide('bought');
          }}
          style={styles.tabButton}
        >
          <Text style={[styles.tabText, side === 'bought' && styles.tabTextActive]}>
            Bought
          </Text>
          {side === 'bought' && <View style={styles.tabUnderline} />}
        </Pressable>
      </View>

      {/* ── Filter Pills: All | In progress | Canceled | Completed ── */}
      <View style={styles.filterRow}>
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
                styles.filterPill,
                active ? styles.filterPillActive : styles.filterPillInactive,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
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
        <View style={styles.emptyContainer}>
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
          ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={onRefresh}
              tintColor={TEAL}
            />
          }
        />
      )}

      {/* ── Toast Popup Banner at Bottom (Image 2 Screen 2) ── */}
      {showToast && (
        <View style={styles.toastContainer}>
          <View style={styles.toastCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toastText}>
                {justPaid === '1'
                  ? "Thank you, we have received your payment. It's being processed."
                  : "Your order has been placed. It's being processed."}
              </Text>
            </View>
            <Pressable onPress={() => setShowToast(false)} hitSlop={8} style={{ paddingLeft: 10 }}>
              <Feather name="x" size={16} color="#FFFFFF" />
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EBEBEB',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    fontFamily: 'Inter_700Bold',
  },
  headerPlaceholder: {
    width: 36,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    backgroundColor: '#FFFFFF',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: 14.5,
    fontWeight: '500',
    color: '#767676',
    fontFamily: 'Inter_500Medium',
  },
  tabTextActive: {
    fontWeight: '700',
    color: '#111111',
    fontFamily: 'Inter_700Bold',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 24,
    right: 24,
    height: 2.5,
    backgroundColor: TEAL,
    borderRadius: 1.5,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillActive: {
    backgroundColor: '#E6F5F6',
    borderColor: TEAL,
  },
  filterPillInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E0E0',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
    fontFamily: 'Inter_500Medium',
  },
  filterPillTextActive: {
    fontWeight: '700',
    color: TEAL,
    fontFamily: 'Inter_700Bold',
  },
  listContent: {
    paddingVertical: 4,
    paddingBottom: 40,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  thumbnailContainer: {
    width: 58,
    height: 58,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  orderInfo: {
    flex: 1,
    marginRight: 10,
  },
  orderTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#111111',
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  orderPrice: {
    fontSize: 13.5,
    color: '#4B5563',
    fontFamily: 'Inter_500Medium',
    marginBottom: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    fontFamily: 'Inter_600SemiBold',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EBEBEB',
    marginLeft: 88,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  skeletonThumb: {
    width: 58,
    height: 58,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginRight: 14,
  },
  skeletonContent: {
    flex: 1,
    gap: 6,
  },
  skeletonBar: {
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
  },
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 24 : 16,
    zIndex: 99,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: 'Inter_500Medium',
    lineHeight: 18,
  },
});
