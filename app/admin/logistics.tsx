import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, Redirect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { tap } from '@/lib/haptics';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { formatPrice } from '@/lib/fees';
import { paymentService } from '@/lib/paymentService';
import { supabase } from '@/lib/supabase';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import type { Order } from '@/types';

type FilterTab = 'all' | 'packing' | 'shifting' | 'delivered' | 'disputed' | 'canceled';

const COURIER_PRESETS = ['TCS', 'Leopards', 'Trax', 'PostEx', 'M&P', 'Custom'];

function deriveRef(id: string): string {
  const hex = id.replace(/-/g, '').slice(0, 8);
  return hex.toUpperCase();
}

export default function AdminLogisticsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { profile, loading: authLoading } = useAuth();
  const toast = useToast();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dispatch Modal State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [courier, setCourier] = useState(COURIER_PRESETS[0]);
  const [customCourier, setCustomCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const data = await paymentService.fetchAdminLogisticsOrders(activeFilter, 60);
      setOrders(data);
    } catch (err: any) {
      toast.show(err?.message || 'Failed to load logistics orders', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter, toast]);

  useEffect(() => {
    if (!profile?.is_admin) return;

    setLoading(true);
    loadOrders();

    // Supabase Realtime for instant multi-admin & seller synchronization
    const channel = supabase
      .channel('admin_logistics_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadOrders();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders, profile?.is_admin]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, [loadOrders]);

  // Copy helper with feedback
  const copyToClipboard = async (text: string, label: string) => {
    tap('light');
    await Clipboard.setStringAsync(text);
    toast.show(`${label} copied!`, { variant: 'default', icon: 'check' });
  };

  // Dispatch Action Handler
  const handleConfirmDispatch = async () => {
    if (!selectedOrder?.id) return;
    if (!trackingNumber.trim()) {
      toast.show('Tracking number / consignment # is required', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }

    if (courier === 'Custom' && !customCourier.trim()) {
      toast.show('Custom courier name is required', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }

    const finalCourier = courier === 'Custom' ? customCourier.trim() : courier;
    tap('medium');
    setDispatching(true);

    try {
      const updated = await paymentService.advanceOrderFulfillment({
        orderId: selectedOrder.id,
        targetStatus: 'shifting',
        courier: finalCourier,
        trackingNumber: trackingNumber.trim(),
      });

      setOrders((prev) =>
        prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
      );
      toast.show('Shipment dispatched! Buyer & seller notified.', {
        variant: 'default',
        icon: 'check',
      });
      setShowDispatchModal(false);
      setSelectedOrder(null);
    } catch (err: any) {
      toast.show(err?.message || 'Failed to dispatch shipment', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setDispatching(false);
    }
  };

  const openDispatch = (order: Order) => {
    tap('light');
    setSelectedOrder(order);
    setCourier(COURIER_PRESETS[0]);
    setCustomCourier('');
    setTrackingNumber('');
    setShowDispatchModal(true);
  };

  // Filtered orders list by search query and active tab
  const filteredOrders = useMemo(() => {
    let list = orders;

    // Filter out canceled orders in 'all' view; show canceled specifically in 'canceled' view
    if (activeFilter === 'all') {
      list = list.filter((o) => {
        const isCanceled =
          o.status === 'canceled' ||
          o.status === 'refunded' ||
          o.status === 'failed' ||
          o.status === 'refund_due' ||
          (o as any).fulfillment_status === 'canceled';
        return !isCanceled;
      });
    } else if (activeFilter === 'canceled') {
      list = list.filter((o) => {
        const isCanceled =
          o.status === 'canceled' ||
          o.status === 'refunded' ||
          o.status === 'failed' ||
          o.status === 'refund_due' ||
          (o as any).fulfillment_status === 'canceled';
        return isCanceled;
      });
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((o) => {
      const title = (o as any).listing?.title?.toLowerCase() || '';
      const ref = o.id.toLowerCase();
      const buyerName = ((o as any).buyer?.full_name || (o as any).buyer?.username || '').toLowerCase();
      const sellerName = ((o as any).seller?.full_name || (o as any).seller?.username || '').toLowerCase();
      const city = ((o as any).shipping_address?.city || '').toLowerCase();
      return (
        title.includes(q) ||
        ref.includes(q) ||
        buyerName.includes(q) ||
        sellerName.includes(q) ||
        city.includes(q)
      );
    });
  }, [orders, searchQuery, activeFilter]);

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary} />
      </SafeAreaView>
    );
  }

  // Admin Access Guard: Non-admins are completely locked out and silently redirected
  if (!profile?.is_admin) {
    return <Redirect href="/" />;
  }

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All Active' },
    { id: 'packing', label: 'Needs Pickup' },
    { id: 'shifting', label: 'In Transit' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'disputed', label: 'Disputed' },
    { id: 'canceled', label: 'Canceled' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      {/* ── Top App Bar ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
          backgroundColor: theme.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => [
            {
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.panel,
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={theme.ink} />
        </Pressable>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
            Admin Logistics Hub
          </Text>
          <Text style={{ fontSize: 11.5, color: theme.primary, fontFamily: typography.family.sansSemibold, marginTop: 1 }}>
            Operations & Dispatch Control
          </Text>
        </View>

        <Pressable
          onPress={onRefresh}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => [
            {
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.panel,
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Feather name="refresh-cw" size={17} color={theme.ink} />
        </Pressable>
      </View>

      {/* ── Search Input ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 42,
          }}
        >
          <Feather name="search" size={16} color={theme.mute} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search order ref, item, buyer, seller..."
            placeholderTextColor={theme.muteSoft}
            style={{
              flex: 1,
              fontSize: 13.5,
              color: theme.ink,
              fontFamily: typography.family.sans,
            }}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={HIT_SLOP_8}>
              <Feather name="x" size={16} color={theme.mute} />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Status Filter Chips (Strict 28px Standard) ── */}
      <View style={{ paddingVertical: 10 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => {
                  tap('light');
                  setActiveFilter(tab.id);
                }}
                style={({ pressed }) => [
                  {
                    height: 28,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isActive ? theme.ink : theme.surface,
                    borderWidth: 1,
                    borderColor: isActive ? theme.ink : theme.border,
                  },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: isActive ? '700' : '500',
                    color: isActive ? theme.background : theme.ink,
                    fontFamily: isActive ? typography.family.sansBold : typography.family.sansMedium,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Order Cards List ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={{ fontSize: 13, color: theme.mute, marginTop: 10, fontFamily: typography.family.sans }}>
            Loading platform orders...
          </Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Feather name="package" size={40} color={theme.muteSoft} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.ink, marginTop: 12, fontFamily: typography.family.sansBold }}>
            No orders found
          </Text>
          <Text style={{ fontSize: 13, color: theme.mute, textAlign: 'center', marginTop: 4, fontFamily: typography.family.sans }}>
            {searchQuery
              ? 'Try searching with a different term'
              : activeFilter === 'canceled'
              ? 'No canceled orders found.'
              : 'No orders currently in this fulfillment stage.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 16) + 30,
            gap: 14,
          }}
          renderItem={({ item }) => {
            const isCanceled =
              item.status === 'canceled' ||
              item.status === 'refunded' ||
              item.status === 'failed' ||
              item.status === 'refund_due' ||
              (item as any).fulfillment_status === 'canceled';
            const isManaged = (item as any).shipping_method === 'managed' || !(item as any).shipping_method;
            const isNeedsPickup = !isCanceled && item.fulfillment_status === 'packing';
            const isInTransit = !isCanceled && item.fulfillment_status === 'shifting';
            const isDelivered = !isCanceled && item.fulfillment_status === 'delivered';
            const isDisputed = !isCanceled && (item.fulfillment_status === 'disputed' || item.status === 'disputed');
            const isCompleted = !isCanceled && (item.fulfillment_status === 'completed' || item.status === 'completed');

            const listing = (item as any).listing;
            const heroImage = listing ? cardImageUrl(listing, 0) : '';
            const buyer = (item as any).buyer;
            const seller = (item as any).seller;
            const sAddr = item.seller_pickup_address as any;
            const dAddr = item.shipping_address as any;

            return (
              <View
                style={{
                  backgroundColor: theme.white,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isCanceled ? 'rgba(239, 68, 68, 0.35)' : isNeedsPickup ? theme.primary : theme.border,
                  padding: 16,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                {/* Card Header: Ref #, Tag, and Status */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                      #{deriveRef(item.id)}
                    </Text>

                    {/* Shipping Method Tag */}
                    <View
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 2.5,
                        borderRadius: 6,
                        backgroundColor: isManaged ? (isDark ? 'rgba(108, 71, 255, 0.15)' : '#F2F3FE') : theme.panel,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10.5,
                          fontWeight: '700',
                          color: isManaged ? theme.primary : theme.mute,
                          fontFamily: typography.family.sansBold,
                        }}
                      >
                        {isManaged ? 'Managed Delivery' : 'Self-Ship'}
                      </Text>
                    </View>
                  </View>

                  {/* Operational Status Pill */}
                  <View
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 3,
                      borderRadius: 12,
                      backgroundColor: isCanceled
                        ? 'rgba(239, 68, 68, 0.12)'
                        : isDisputed
                        ? 'rgba(239, 68, 68, 0.12)'
                        : isNeedsPickup
                        ? 'rgba(108, 71, 255, 0.15)'
                        : isInTransit
                        ? '#EFF6FF'
                        : isDelivered || isCompleted
                        ? '#ECFDF5'
                        : theme.panel,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: isCanceled
                          ? '#EF4444'
                          : isDisputed
                          ? '#EF4444'
                          : isNeedsPickup
                          ? theme.primary
                          : isInTransit
                          ? '#2563EB'
                          : isDelivered || isCompleted
                          ? '#10B981'
                          : theme.mute,
                        fontFamily: typography.family.sansBold,
                        textTransform: 'capitalize',
                      }}
                    >
                      {isCanceled
                        ? (item.status === 'refunded' ? 'Refunded' : 'Canceled')
                        : (item.fulfillment_status || item.status)}
                    </Text>
                  </View>
                </View>

                {/* Item Summary Strip */}
                <Pressable
                  onPress={() => {
                    tap('light');
                    if (item.listing_id) {
                      router.push(`/invoice/${item.listing_id}` as any);
                    }
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 10,
                      backgroundColor: theme.panel,
                      borderWidth: 1,
                      borderColor: theme.border,
                      overflow: 'hidden',
                      marginRight: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {heroImage ? (
                      <Image
                        source={{ uri: getOptimizedImageUrl(heroImage, { width: 120 }) }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={IMAGE_TRANSITION}
                      />
                    ) : (
                      <Feather name="package" size={20} color={theme.muteSoft} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                      {listing?.title || 'Marketplace Item'}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.mute, marginTop: 2, fontFamily: typography.family.sans }}>
                      Amount: {formatPrice(item.amount_cents / 100)} · {item.payment_method === 'cod' ? '💵 Cash on Delivery' : '💳 Paid Online'}
                    </Text>
                  </View>

                  <Feather name="chevron-right" size={16} color={theme.muteSoft} />
                </Pressable>

                {/* ── Addresses Section ── */}
                <View style={{ gap: 10, marginBottom: 14 }}>
                  {/* Seller Pickup Block */}
                  <View
                    style={{
                      backgroundColor: theme.surface,
                      borderRadius: 12,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="arrow-up-circle" size={14} color={theme.primary} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                          Pickup From (Seller)
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          const copyStr = `${sAddr?.recipientName || seller?.full_name || seller?.username || 'Seller'}, Ph: ${sAddr?.phone || 'N/A'}, Addr: ${[sAddr?.line1, sAddr?.line2, sAddr?.city].filter(Boolean).join(', ')}`;
                          copyToClipboard(copyStr, 'Pickup address');
                        }}
                        hitSlop={HIT_SLOP_8}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Feather name="copy" size={12} color={theme.primary} />
                        <Text style={{ fontSize: 11.5, fontWeight: '600', color: theme.primary, fontFamily: typography.family.sansSemibold }}>
                          Copy
                        </Text>
                      </Pressable>
                    </View>

                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>
                      {sAddr?.recipientName || seller?.full_name || seller?.username || 'Seller'} · {sAddr?.phone ? `📞 ${sAddr.phone}` : 'No phone'}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                      {sAddr?.line1 ? [sAddr.line1, sAddr.line2, sAddr.city].filter(Boolean).join(', ') : 'Waiting for seller to confirm pickup address'}
                    </Text>
                  </View>

                  {/* Buyer Delivery Block */}
                  <View
                    style={{
                      backgroundColor: theme.surface,
                      borderRadius: 12,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="arrow-down-circle" size={14} color="#10B981" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                          Deliver To (Buyer)
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          const copyStr = `${dAddr?.recipientName || dAddr?.recipient_name || buyer?.full_name || buyer?.username || 'Buyer'}, Ph: ${dAddr?.phone || 'N/A'}, Addr: ${[dAddr?.line1, dAddr?.line2, dAddr?.city].filter(Boolean).join(', ')}`;
                          copyToClipboard(copyStr, 'Delivery address');
                        }}
                        hitSlop={HIT_SLOP_8}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Feather name="copy" size={12} color={theme.primary} />
                        <Text style={{ fontSize: 11.5, fontWeight: '600', color: theme.primary, fontFamily: typography.family.sansSemibold }}>
                          Copy
                        </Text>
                      </Pressable>
                    </View>

                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>
                      {dAddr?.recipientName || dAddr?.recipient_name || buyer?.full_name || buyer?.username || 'Buyer'} · {dAddr?.phone ? `📞 ${dAddr.phone}` : 'No phone'}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                      {dAddr?.line1 ? [dAddr.line1, dAddr.line2, dAddr.city].filter(Boolean).join(', ') : 'No delivery address provided'}
                    </Text>
                  </View>
                </View>

                {/* Tracking Details Strip if Dispatched */}
                {item.tracking_number && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: theme.panel,
                      padding: 10,
                      borderRadius: 10,
                      marginBottom: 12,
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 11, color: theme.mute, fontFamily: typography.family.sans }}>
                        Courier: {item.courier_name || 'Standard'}
                      </Text>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                        Tracking #: {item.tracking_number}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => copyToClipboard(item.tracking_number!, 'Tracking number')}
                      hitSlop={HIT_SLOP_8}
                    >
                      <Feather name="copy" size={14} color={theme.primary} />
                    </Pressable>
                  </View>
                )}

                {/* Cancellation Notice Banner */}
                {isCanceled && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: 'rgba(239, 68, 68, 0.2)',
                      gap: 8,
                    }}
                  >
                    <Feather name="x-circle" size={15} color="#EF4444" />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: '#EF4444',
                        fontFamily: typography.family.sansMedium,
                      }}
                      numberOfLines={2}
                    >
                      {(item as any).cancel_reason ? `Canceled: ${(item as any).cancel_reason}` : 'Order was canceled. No shipping required.'}
                    </Text>
                  </View>
                )}

                {/* Primary Action */}
                {isNeedsPickup && !isCanceled ? (
                  <Pressable
                    onPress={() => openDispatch(item)}
                    style={({ pressed }) => [
                      {
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: theme.primary,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
                    ]}
                  >
                    <Feather name="truck" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF', fontFamily: typography.family.sansBold }}>
                      Dispatch Shipment & Assign Tracking
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      tap('light');
                      if (item.listing_id) {
                        router.push(`/invoice/${item.listing_id}` as any);
                      }
                    }}
                    style={({ pressed }) => [
                      {
                        height: 40,
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
                    <Feather name="file-text" size={14} color={theme.ink} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.ink, fontFamily: typography.family.sansSemibold }}>
                      View Order Invoice
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      {/* ── Admin Dispatch Modal ── */}
      <Modal
        visible={showDispatchModal}
        transparent
        animationType="slide"
        onRequestClose={dispatching ? undefined : () => setShowDispatchModal(false)}
        statusBarTranslucent
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.overlay,
            justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
            alignItems: 'center',
            paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
          }}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dispatching ? undefined : () => setShowDispatchModal(false)}
          />

          <View
            style={[
              {
                width: '100%',
                maxWidth: 480,
                maxHeight: '85%',
                backgroundColor: theme.white,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderRadius: Platform.OS === 'web' ? 24 : 0,
                borderWidth: 1,
                borderColor: theme.border,
                paddingTop: 18,
                paddingHorizontal: 20,
              },
              { paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
          >
            {/* Grabber */}
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: theme.border }} />
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                  Dispatch Shipment
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                  Order #{selectedOrder ? deriveRef(selectedOrder.id) : ''}
                </Text>
              </View>

              <Pressable
                onPress={() => setShowDispatchModal(false)}
                hitSlop={HIT_SLOP_8}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.panel, alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="x" size={18} color={theme.mute} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Courier Selection Chips */}
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold, marginBottom: 8 }}>
                Select Courier Partner
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {COURIER_PRESETS.map((c) => {
                  const isSelected = courier === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => {
                        tap('light');
                        setCourier(c);
                      }}
                      style={({ pressed }) => [
                        {
                          height: 32,
                          borderRadius: 16,
                          paddingHorizontal: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isSelected ? theme.primary : theme.surface,
                          borderWidth: 1,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? '#FFFFFF' : theme.ink,
                          fontFamily: isSelected ? typography.family.sansBold : typography.family.sansMedium,
                        }}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {courier === 'Custom' && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold, marginBottom: 6 }}>
                    Custom Courier Name *
                  </Text>
                  <TextInput
                    value={customCourier}
                    onChangeText={setCustomCourier}
                    placeholder="e.g. Rider Express / Self Dispatch"
                    placeholderTextColor={theme.muteSoft}
                    style={{
                      height: 46,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      fontSize: 14,
                      color: theme.ink,
                      backgroundColor: theme.surface,
                    }}
                  />
                </View>
              )}

              {/* Consignment / Tracking Number Input */}
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold, marginBottom: 6 }}>
                Consignment / Tracking Number *
              </Text>
              <TextInput
                value={trackingNumber}
                onChangeText={setTrackingNumber}
                placeholder="e.g. 77391823901 or TRK-981"
                placeholderTextColor={theme.muteSoft}
                style={{
                  height: 46,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  color: theme.ink,
                  backgroundColor: theme.surface,
                  marginBottom: 18,
                }}
              />

              {/* Submit Button */}
              <Pressable
                onPress={handleConfirmDispatch}
                disabled={dispatching}
                style={({ pressed }) => [
                  {
                    height: 50,
                    borderRadius: 14,
                    backgroundColor: theme.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  },
                  dispatching && { opacity: 0.7 },
                  pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
                ]}
              >
                {dispatching ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', fontFamily: typography.family.sansBold }}>
                      Mark In-Transit & Notify Buyer
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
