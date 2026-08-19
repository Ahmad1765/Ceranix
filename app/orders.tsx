// Order history — the read path for public.orders.
//
// Why this screen exists: orders were write-only from the app's point of view.
// The one route that renders a payment (/invoice/[id]) was reachable solely
// from /payment/[id] or Stripe's return URL, so the moment a buyer left that
// screen their purchase became unreachable — while two shipped entry points
// ("My shop · Purchases, sales & payouts" on the profile and in Settings) both
// promised it and pushed each other in a circle instead.
//
// The data layer was already built for exactly this query: orders_buyer_idx /
// orders_seller_idx, and an RLS policy scoped to buyer_id or seller_id. Nothing
// here needs a migration; it reads what the webhook already writes.
import { useMemo, useState, useCallback } from 'react';
import { View, Pressable, FlatList, RefreshControl } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { RequireAuth } from '@/components/RequireAuth';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSellSheet } from '@/components/sell/SellSheet';
import { useMyOrdersQuery } from '@/lib/queries';
import { getOptimizedImageUrl } from '@/lib/images';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { deriveInvoiceAmounts } from '@/lib/invoiceStatus';
import { partitionOrders, orderBadge, type OrderSide } from '@/lib/orders';
import type { MyOrder } from '@/lib/payments';

function formatDate(iso: string | null | undefined) {
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

// Badge tones resolve inside the purple/white/black palette — 'positive' is the
// purple accent, never a green, so this screen stays on the app's three colors.
function toneStyle(tone: 'positive' | 'neutral' | 'warn') {
  if (tone === 'positive') {
    return { bg: colors.primarySofter, fg: colors.primaryDeep };
  }
  if (tone === 'warn') {
    return { bg: colors.panel, fg: colors.ink };
  }
  return { bg: colors.panel, fg: colors.mute };
}

function OrderRow({ order, side }: { order: MyOrder; side: OrderSide }) {
  // Amounts come from lib/invoiceStatus so the history row and the invoice it
  // opens can't disagree about what was charged — the order row carries minor
  // units and an accepted-offer price that listing.price does not reflect.
  const { total } = deriveInvoiceAmounts(order, order.listing?.price, buyerProtectionFee);
  const badge = orderBadge(order.status, side, order.payment_method);
  const tone = toneStyle(badge.tone);
  const image = order.listing?.images?.[0];

  return (
    <Pressable
      onPress={() => {
        tap();
        // /invoice/[id] is keyed by the LISTING id, not the order id.
        router.push(`/invoice/${order.listing_id}` as any);
      }}
      testID="order-row"
      accessibilityRole="button"
      accessibilityLabel={`${order.listing?.title ?? 'Item'}, ${badge.label}, ${formatPrice(total)}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 14,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 56,
          height: 68,
          borderRadius: 12,
          backgroundColor: colors.panel,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {image ? (
          <Image
            source={{ uri: getOptimizedImageUrl(image, { width: 160 }) }}
            style={{ width: 56, height: 68 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <Feather name="package" size={18} color={colors.mute} />
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}
          numberOfLines={1}
        >
          {order.listing?.title ?? 'Item no longer listed'}
        </Text>
        <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 3 }}>
          {formatDate(order.created_at)}
        </Text>
        <View
          style={{
            alignSelf: 'flex-start',
            marginTop: 7,
            paddingHorizontal: 9,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: tone.bg,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '800', color: tone.fg, letterSpacing: 0.2 }}>
            {badge.label}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink, letterSpacing: -0.3 }}>
          {formatPrice(total)}
        </Text>
        <Feather name="chevron-right" size={16} color={colors.muteSoft} style={{ marginTop: 6 }} />
      </View>
    </Pressable>
  );
}

// Row-shaped placeholders rather than a centred spinner: the list geometry is
// known before the data is, so holding it means the real rows land in place
// instead of the screen jumping from a centred dot to a full list.
//
// ponytail: deliberately static — no shimmer. A shimmer needs a Reanimated
// loop per row, which is real cost for a list that is usually cached and paints
// immediately. Add one only if the empty frame is measurably long enough to
// notice.
function OrdersSkeleton() {
  return (
    <View style={{ paddingVertical: 6 }} accessibilityLabel="Loading your orders">
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 14,
          }}
        >
          <View style={{ width: 56, height: 68, borderRadius: 12, backgroundColor: colors.panel }} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ height: 13, width: '62%', borderRadius: 6, backgroundColor: colors.panel }} />
            <View style={{ height: 11, width: '34%', borderRadius: 6, backgroundColor: colors.panel }} />
            <View style={{ height: 17, width: 78, borderRadius: 999, backgroundColor: colors.panel }} />
          </View>
          <View style={{ height: 15, width: 62, borderRadius: 6, backgroundColor: colors.panel }} />
        </View>
      ))}
    </View>
  );
}

function OrdersScreen() {
  const { user } = useAuth();
  const sell = useSellSheet();
  // ?side=sold lets a caller land on the seller's half directly (the profile's
  // "Sold" stat does). Anything else falls back to purchases.
  const { side: sideParam } = useLocalSearchParams<{ side?: string }>();
  const [side, setSide] = useState<OrderSide>(sideParam === 'sold' ? 'sold' : 'bought');
  const q = useMyOrdersQuery(user?.id ?? null);

  const { bought, sold } = useMemo(
    () => partitionOrders(q.data ?? [], user?.id ?? ''),
    [q.data, user?.id],
  );
  const rows = side === 'bought' ? bought : sold;

  const onRefresh = useCallback(() => {
    q.refetch();
  }, [q]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScreenHeader title="Purchases & sales" back />

      <Tabs
        variant="underline"
        accent="primary"
        value={side}
        onChange={setSide}
        tabs={[
          { value: 'bought', label: 'Purchases', icon: 'shopping-bag', count: bought.length },
          { value: 'sold', label: 'Sales', icon: 'tag', count: sold.length },
        ]}
      />

      {q.isPending ? (
        <View testID="orders-loading">
          <OrdersSkeleton />
        </View>
      ) : q.isError ? (
        // A load failure must not render as "no purchases yet" — on a screen
        // about money, "we couldn't reach it" and "it isn't there" are very
        // different claims, and only one of them is retryable.
        <View testID="orders-error">
          <EmptyState
            icon="alert-circle"
            title="Couldn't load your orders"
            description="Check your connection and try again — nothing has changed on your account."
            cta={{ label: 'Try again', onPress: () => q.refetch(), icon: 'refresh-cw' }}
          />
        </View>
      ) : rows.length === 0 ? (
        side === 'bought' ? (
          <View testID="orders-empty-bought">
            <EmptyState
              icon="shopping-bag"
              title="No purchases yet"
              description="Everything you buy shows up here with its invoice, so you can always come back to it."
              cta={{ label: 'Browse items', onPress: () => router.push('/(tabs)' as any), icon: 'search' }}
            />
          </View>
        ) : (
          <View testID="orders-empty-sold">
            <EmptyState
              icon="tag"
              title="No sales yet"
              description="When someone buys one of your items, the sale and its payout land here."
              cta={{ label: 'List an item', onPress: () => sell.open(), icon: 'plus' }}
            />
          </View>
        )
      ) : (
        <FlatList
          testID="orders-list"
          data={rows}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderRow order={item} side={side} />}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.hairline, marginLeft: 86 }} />
          )}
          contentContainerStyle={{ paddingVertical: 6, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
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
