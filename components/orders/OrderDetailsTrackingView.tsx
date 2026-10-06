import React, { useState, useMemo } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  Share,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/context/ThemeContext';
import { radii, type as typography, tabularNumberStyle, shadow } from '@/lib/theme';
import { tap } from '@/lib/haptics';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { BRAND } from '@/lib/brand';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { paymentService } from '@/lib/paymentService';
import type { Order } from '@/lib/payments';
import type { Listing, FulfillmentStatus } from '@/types';

export interface OrderDetailsTrackingViewProps {
  order?: Order | null;
  listing?: Listing | null;
  isSeller?: boolean;
  onBack?: () => void;
  onShare?: () => void;
  actionButtons?: React.ReactNode;
  initialTab?: 'shipment' | 'activity';
  onConfirmPickup?: (address: any) => Promise<void>;
  sellerDefaultAddress?: any;
  // Overrides or custom fallbacks matching mockup
  trackingId?: string;
  statusLabel?: string;
  receiverName?: string;
  deliveryAddress?: string;
  contactPhone?: string;
  itemTitle?: string;
  deliveryNote?: string;
  riderName?: string;
  riderAvatar?: string;
  riderPhone?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN PATTERN PRIMITIVES (EMIL KOWALSKI CRAFT & UI/UX PRO MAX STANDARD)
// ─────────────────────────────────────────────────────────────────────────────

function SectionEyebrow({
  title,
  icon,
  badge,
}: {
  title: string;
  icon?: keyof typeof Feather.glyphMap;
  badge?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 8,
        marginTop: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Feather name={icon} size={14} color={theme.mute} />}
        <Text
          style={{
            fontSize: 12,
            fontFamily: typography.family.sansSemibold,
            color: theme.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
      </View>
      {badge && (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: radii.pill,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontFamily: typography.family.sansBold,
              color: theme.mute,
              letterSpacing: 0.1,
            }}
          >
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
}

function GroupCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const { theme, isDark } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.panel,
          borderRadius: 14,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark ? '#262626' : 'rgba(0,0,0,0.08)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.2 : 0.04,
          shadowRadius: 3,
          elevation: 1,
          marginBottom: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function KeyValueRow({
  label,
  value,
  isLast = false,
  rightElement,
}: {
  label: string;
  value?: string;
  isLast?: boolean;
  rightElement?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 13,
        minHeight: 50,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.border,
      }}
    >
      <Text
        style={{
          fontSize: 14.5,
          fontFamily: typography.family.sansMedium,
          color: theme.ink,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>

      {rightElement ? (
        rightElement
      ) : value ? (
        <Text
          numberOfLines={2}
          style={[
            {
              fontSize: 14,
              fontFamily: typography.family.sansMedium,
              color: theme.mute,
              flexShrink: 1,
              textAlign: 'right',
              marginLeft: 16,
            },
            tabularNumberStyle,
          ]}
        >
          {value}
        </Text>
      ) : null}
    </View>
  );
}

function parseServerDate(val?: string | Date | null): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  let s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(s)) {
    s = s.replace(' ', 'T');
  }
  if (!/Z|[+-]\d{2}(?::?\d{2})?$/i.test(s)) {
    s = `${s}Z`;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER DETAILS TRACKING VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function OrderDetailsTrackingView({
  order,
  listing,
  isSeller = true,
  onBack,
  onShare,
  actionButtons,
  initialTab = 'shipment',
  onConfirmPickup,
  sellerDefaultAddress,
  trackingId: propTrackingId,
  statusLabel: propStatusLabel,
  receiverName: propReceiverName,
  deliveryAddress: propDeliveryAddress,
  contactPhone: propContactPhone,
  itemTitle: propItemTitle,
  deliveryNote: propDeliveryNote,
  riderName: propRiderName,
  riderAvatar: propRiderAvatar,
  riderPhone: propRiderPhone,
}: OrderDetailsTrackingViewProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'shipment' | 'activity'>(initialTab);
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);
  const [bpSheetOpen, setBpSheetOpen] = useState(false);

  // Seller Modals (Rule 1 & 2)
  const [labelModalVisible, setLabelModalVisible] = useState(false);
  const [labelSubTab, setLabelSubTab] = useState<'label' | 'qr'>('label');
  const [readyDeliverModalVisible, setReadyDeliverModalVisible] = useState(false);
  const [howToShipModalVisible, setHowToShipModalVisible] = useState(false);
  const [originModalVisible, setOriginModalVisible] = useState(false);

  // Origin State (Image 4)
  const [countryOfOrigin, setCountryOfOrigin] = useState('United States');

  // Dynamic status state reflecting all statuses: packing, picked, shifting, delivered, completed
  const initialFulfillmentStatus: FulfillmentStatus =
    (order?.fulfillment_status as FulfillmentStatus) ||
    (order?.status === 'completed'
      ? 'completed'
      : order?.status === 'delivered'
      ? 'delivered'
      : order?.status === 'shifting'
      ? 'shifting'
      : order?.status === 'picked'
      ? 'picked'
      : order?.status === 'packing'
      ? 'packing'
      : 'packing');

  const [currentFulfillment, setCurrentFulfillment] = useState<FulfillmentStatus>(initialFulfillmentStatus);

  // Ready to Deliver Form State
  const [pickupContactName, setPickupContactName] = useState(
    sellerDefaultAddress?.recipient_name || 'Seller Contact',
  );
  const [pickupContactPhone, setPickupContactPhone] = useState(
    sellerDefaultAddress?.phone || '+1 (555) 234-8901',
  );
  const [pickupLine1, setPickupLine1] = useState(
    sellerDefaultAddress?.line1 || '210 Dan Allen Drive',
  );
  const [pickupLine2, setPickupLine2] = useState(
    sellerDefaultAddress?.line2 || 'Apt 4B',
  );
  const [pickupCity, setPickupCity] = useState(
    sellerDefaultAddress?.city || 'Raleigh, NC',
  );
  const [pickupPostalCode, setPickupPostalCode] = useState(
    sellerDefaultAddress?.postal_code || '27607',
  );
  const [pickupSelectedDate, setPickupSelectedDate] = useState<'tomorrow' | 'day_after'>('tomorrow');
  const [pickupConfirmed, setPickupConfirmed] = useState(false);
  const [pickupConfirmedDateStr, setPickupConfirmedDateStr] = useState<string | null>(null);

  // Dynamic values resolving to exact mockup defaults when not supplied
  const trackingNumber =
    propTrackingId ||
    (order as any)?.tracking_number ||
    (order?.id ? `PAQ-${order.id.slice(0, 3).toUpperCase()}-${order.id.slice(-3).toUpperCase()}` : 'PAQ-327-P21');

  // Derive status badge & item status badge (Image 4)
  let statusBadge = propStatusLabel || 'In Transit';
  let statusPillText = 'Needs Label';
  let itemStatusBadgeText = 'Preparing Package';

  if (currentFulfillment === 'delivered') {
    statusBadge = 'Delivered';
    statusPillText = 'Delivered';
    itemStatusBadgeText = 'Delivered';
  } else if (currentFulfillment === 'shifting' || (order as any)?.shipped_at) {
    statusBadge = 'In Transit';
    statusPillText = 'In Transit';
    itemStatusBadgeText = 'In Transit';
  } else if (currentFulfillment === 'picked') {
    statusBadge = 'Picked';
    statusPillText = 'Picked Up';
    itemStatusBadgeText = 'Picked';
  } else if (currentFulfillment === 'completed') {
    statusBadge = 'Completed';
    statusPillText = 'Completed';
    itemStatusBadgeText = 'Completed';
  } else if (currentFulfillment === 'packing') {
    statusBadge = 'Packing';
    statusPillText = 'Needs Label';
    itemStatusBadgeText = 'Preparing Package';
  } else if (currentFulfillment === 'disputed') {
    statusBadge = 'Refund Under Review';
    statusPillText = 'Disputed';
    itemStatusBadgeText = 'Under Review';
  } else if (currentFulfillment === 'canceled') {
    statusBadge = 'Cancelled';
    statusPillText = 'Cancelled';
    itemStatusBadgeText = 'Cancelled';
  }

  const addr = (order?.shipping_address as any) || {};
  const recipient =
    propReceiverName ||
    addr.recipientName ||
    addr.recipient_name ||
    (order as any)?.buyer?.full_name ||
    'Hannah Dial';

  const streetAddress =
    propDeliveryAddress ||
    [addr.line1, addr.city].filter(Boolean).join(', ') ||
    '730 E 950 S Apt C438, Orem UT 84097';

  const phone =
    propContactPhone ||
    addr.phone ||
    '+1 (555) 123-2014';

  const item =
    propItemTitle ||
    listing?.title ||
    (order as any)?.listing?.title ||
    'Tracked Order Item';

  const note =
    propDeliveryNote ||
    order?.delivery_notes ||
    null;

  const carrierName = (order as any)?.courier_name || `${BRAND} Express`;

  const itemPhoto =
    listing?.images?.[0] ||
    (listing as any)?.photos?.[0] ||
    'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=200&auto=format&fit=crop&q=80';
  const itemCondition = (listing as any)?.condition || 'New with tags';
  const orderIdNumber = order?.id ? (order.id.replace(/[^0-9]/g, '').slice(0, 7) || '2636862') : '2636862';

  const actualItems = useMemo(() => {
    const rawItems = (order as any)?.order_items;
    if (rawItems && Array.isArray(rawItems) && rawItems.length > 0) {
      return rawItems.map((oi: any, idx: number) => ({
        id: oi.id || `item-${idx}`,
        title: oi.listing?.title || oi.title || item,
        orderId: `Order #${orderIdNumber}`,
        condition: oi.listing?.condition || itemCondition,
        photo: oi.listing?.images?.[0] || itemPhoto,
        origin: countryOfOrigin || null,
      }));
    }
    return [
      {
        id: 'item-1',
        title: listing?.title || (order as any)?.listing?.title || item,
        orderId: `Order #${orderIdNumber}`,
        condition: itemCondition,
        photo: itemPhoto,
        origin: countryOfOrigin || null,
      },
    ];
  }, [order, listing, item, orderIdNumber, itemCondition, itemPhoto, countryOfOrigin]);

  // Buyer protection fee calculation
  const listingPrice = Number(listing?.price ?? (order?.amount_cents ? order.amount_cents / 100 : 1000));
  const protectionFee = buyerProtectionFee(listingPrice);

  // ── Dynamic order timestamps & live chronological event calculation ──
  const orderCreatedAt = useMemo(() => {
    const parsed = parseServerDate(order?.created_at);
    if (parsed) return parsed;
    return new Date(); // Fallback to real-time moment, never 5 hours in the past
  }, [order?.created_at]);

  const isCompleted = currentFulfillment === 'completed';
  const isDelivered = currentFulfillment === 'delivered' || isCompleted;
  const isShipped = currentFulfillment === 'shifting' || isDelivered;
  const isPicked = currentFulfillment === 'picked' || isShipped;
  const isPacked = Boolean(order?.packed_at) || isPicked;

  const deliveredTimestamp = parseServerDate(order?.delivered_at || order?.completed_at);
  const shippedTimestamp = parseServerDate(order?.shipped_at || (order as any)?.shifted_at);
  const pickedTimestamp = parseServerDate((order as any)?.picked_at);
  const packedTimestamp = parseServerDate(order?.packed_at);

  // Exact localized timestamps bounded so no stage ever prints into the future
  const placedTime = orderCreatedAt;
  const nowMs = Date.now();

  const packedTime = packedTimestamp || (isPacked
    ? new Date(Math.min(nowMs, placedTime.getTime() + Math.max(60000, Math.floor((nowMs - placedTime.getTime()) * 0.25))))
    : null);

  const pickedTime = pickedTimestamp || (isPicked
    ? new Date(Math.min(nowMs, (packedTime ? packedTime.getTime() : placedTime.getTime()) + Math.max(60000, Math.floor((nowMs - placedTime.getTime()) * 0.5))))
    : null);

  const transitTime = shippedTimestamp || (isShipped
    ? new Date(Math.min(nowMs, (pickedTime ? pickedTime.getTime() : placedTime.getTime()) + Math.max(60000, Math.floor((nowMs - placedTime.getTime()) * 0.75))))
    : null);

  const deliveredTime = deliveredTimestamp || (isDelivered
    ? new Date(Math.min(nowMs, (transitTime ? transitTime.getTime() : placedTime.getTime()) + 60000))
    : null);

  // Standard localized formatters for time and date
  const formatTime = (d: Date | null) => {
    if (!d || isNaN(d.getTime())) return 'Pending';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (d: Date | null) => {
    if (!d || isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) return 'Today';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  const pickedTimeLabel = isPicked ? formatTime(pickedTime) : 'Pending';
  const transitTimeLabel = isShipped ? formatTime(transitTime) : 'Pending';
  const deliveredTimeLabel = isDelivered ? formatTime(deliveredTime) : 'Pending';

  // Available Pickup Dates (Rule 2: Tomorrow & Day after tomorrow)
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const dayAfterTomorrowDate = new Date();
  dayAfterTomorrowDate.setDate(dayAfterTomorrowDate.getDate() + 2);

  const tomorrowFormatted = tomorrowDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const dayAfterFormatted = dayAfterTomorrowDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  // Chronological activity timeline events with exact working times
  const activityEvents = [
    ...(isDelivered && deliveredTime
      ? [
          {
            id: 'delivered',
            time: formatTime(deliveredTime),
            date: formatDate(deliveredTime),
            title: 'Package Delivered',
            description: `Handed over directly to ${recipient} at ${streetAddress}.`,
            completed: true,
            isLatest: true,
          },
        ]
      : []),
    ...(isShipped && transitTime
      ? [
          {
            id: 'in_transit',
            time: formatTime(transitTime),
            date: formatDate(transitTime),
            title: 'Out for Delivery / In Transit',
            description: `Package is on the route via ${carrierName}.`,
            completed: true,
            isLatest: !isDelivered,
          },
        ]
      : []),
    ...(isPicked && pickedTime
      ? [
          {
            id: 'picked',
            time: formatTime(pickedTime),
            date: formatDate(pickedTime),
            title: 'Package Picked Up & Manifested',
            description: `Courier collected parcel from seller. Verified at local distribution hub.`,
            completed: true,
            isLatest: !isShipped && !isDelivered,
          },
        ]
      : []),
    ...(isPacked && packedTime
      ? [
          {
            id: 'packed',
            time: formatTime(packedTime),
            date: formatDate(packedTime),
            title: 'Order Packed & Ready',
            description: `Seller packed the items with care and attached waybill #${trackingNumber}.`,
            completed: true,
            isLatest: !isPicked,
          },
        ]
      : []),
    {
      id: 'placed',
      time: formatTime(placedTime),
      date: formatDate(placedTime),
      title: 'Order Placed & Payment Confirmed',
      description: `Payment secured under ${BRAND} Buyer Protection escrow guarantee.`,
      completed: true,
      isLatest: !isPacked && !isPicked && !isShipped && !isDelivered,
    },
  ];

  // Clipboard Copy Action with haptics & feedback toast
  const handleCopyTracking = async () => {
    tap('light');
    try {
      await Clipboard.setStringAsync(trackingNumber);
      toast.show('Tracking ID copied to clipboard', {
        variant: 'default',
        icon: 'copy',
      });
    } catch {
      toast.show('Failed to copy tracking ID', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  };



  // Message Seller / Buyer Handler (Matching Image 1)
  const handleContactSeller = () => {
    tap('light');
    const targetListingId = listing?.id || order?.listing_id;
    if (targetListingId) {
      router.push(`/conversation/new?listing=${targetListingId}` as any);
    } else {
      router.push('/(tabs)/chat' as any);
    }
  };

  // Track Shipping Handler
  const handleTrackShipping = () => {
    tap('light');
    setTrackingModalVisible(true);
  };

  const handleBack = () => {
    tap('light');
    if (onBack) {
      onBack();
    } else {
      safeBack();
    }
  };

  // Live Status System Transition Handler (Rule 1)
  const handleUpdateStatus = async (newStatus: FulfillmentStatus) => {
    tap('medium');
    setCurrentFulfillment(newStatus);
    if (order?.id) {
      try {
        await paymentService.advanceOrderFulfillment({
          orderId: order.id,
          targetStatus: newStatus,
        });
      } catch (e) {
        console.warn('Status update sync error:', e);
      }
    }
    toast.show(`Order status updated to: ${newStatus.toUpperCase()}`, {
      variant: 'default',
      icon: 'check',
    });
  };

  // Save Ready to Deliver Pickup Schedule
  const handleConfirmPickupSchedule = async () => {
    if (!pickupContactName.trim()) {
      toast.show('Contact name is required', { variant: 'default', icon: 'alert-circle' });
      return;
    }
    if (!pickupContactPhone.trim()) {
      toast.show('Contact phone is required for courier pickup', { variant: 'default', icon: 'alert-circle' });
      return;
    }
    if (!pickupLine1.trim() || !pickupCity.trim()) {
      toast.show('Full pickup street address & city are required', { variant: 'default', icon: 'alert-circle' });
      return;
    }

    tap('medium');
    const chosenDateStr = pickupSelectedDate === 'tomorrow' ? tomorrowFormatted : dayAfterFormatted;
    setPickupConfirmed(true);
    setPickupConfirmedDateStr(chosenDateStr);
    setReadyDeliverModalVisible(false);

    if (onConfirmPickup) {
      try {
        await onConfirmPickup({
          recipientName: pickupContactName,
          phone: pickupContactPhone,
          line1: pickupLine1,
          line2: pickupLine2,
          city: pickupCity,
          postalCode: pickupPostalCode,
          pickupDate: chosenDateStr,
        });
      } catch (e) {
        console.warn('pickup schedule error', e);
      }
    }

    toast.show(`Pickup confirmed for ${chosenDateStr}! Driver scheduled.`, {
      variant: 'default',
      icon: 'check',
    });
  };

  // Download Label Action (Image 2)
  const handleDownloadLabel = async () => {
    tap('light');
    try {
      await Share.share({
        message: `${BRAND} Shipping Label\nWaybill: ${trackingNumber}\nFrom: ${pickupContactName} (${pickupLine1}, ${pickupCity})\nTo: ${recipient} (${streetAddress})\nCarrier: USPS Ground Advantage / ${BRAND} Express`,
      });
      toast.show('Shipping label ready & shared', {
        variant: 'default',
        icon: 'check',
      });
    } catch {
      toast.show('Label saved to documents', {
        variant: 'default',
        icon: 'check',
      });
    }
  };

  // Safe bottom clearance accounting for the floating dock
  const bottomScrollPadding = Math.max(insets.bottom, 24) + 64;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* ── Top Header Navigation Bar (Quiet Atelier Standard) ── */}
      <View
        style={{
          paddingTop: Platform.OS === 'ios' ? 10 : 12,
          paddingBottom: 10,
          paddingHorizontal: 16,
          backgroundColor: theme.background,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: CONTENT_MAX_WIDTH,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {/* Back Circular Button */}
          <Pressable
            onPress={handleBack}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Feather name="arrow-left" size={18} color={theme.ink} />
          </Pressable>

          {/* Centered Screen Title */}
          <Text
            style={{
              fontSize: 16.5,
              fontFamily: typography.family.sansBold,
              color: theme.ink,
              letterSpacing: -0.2,
            }}
          >
            Tracking
          </Text>

          {/* Symmetrical Right Action / Spacer */}
          {onShare ? (
            <Pressable
              onPress={onShare}
              hitSlop={HIT_SLOP_8}
              accessibilityRole="button"
              accessibilityLabel="Share order"
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Feather name="share" size={16} color={theme.ink} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: bottomScrollPadding,
          maxWidth: CONTENT_MAX_WIDTH,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {/* ── Card 1: Tracking Hero & Stepper (Picked / In Transit / Delivered) ── */}
        <GroupCard style={{ padding: 18 }}>
          {/* Tracking ID Header Row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Package Isometric Icon Squircle */}
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="cube" size={20} color={theme.ink} />
            </View>

            {/* Tracking ID & Interactive Clipboard Pill */}
            <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
              <Text
                style={{
                  fontSize: 11.5,
                  color: theme.mute,
                  fontFamily: typography.family.sansMedium,
                  letterSpacing: 0.2,
                }}
              >
                Tracking ID:
              </Text>
              <Pressable
                onPress={handleCopyTracking}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="button"
                accessibilityLabel={`Copy tracking ID ${trackingNumber}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 2,
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Text
                  style={[
                    {
                      fontSize: 16.5,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      letterSpacing: -0.3,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {trackingNumber}
                </Text>
                <View
                  style={{
                    marginLeft: 6,
                    padding: 3,
                    borderRadius: 4,
                    backgroundColor: theme.surface,
                  }}
                >
                  <Feather name="copy" size={12} color={theme.mute} />
                </View>
              </Pressable>
            </View>

            {/* Canonical Status Pill */}
            <View
              style={{
                height: 30,
                borderRadius: 15,
                backgroundColor: isDark ? 'rgba(108, 71, 255, 0.16)' : '#F2F3FE',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(108, 71, 255, 0.32)' : 'rgba(83, 86, 238, 0.22)',
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: typography.family.sansBold,
                  color: isDark ? '#A5B4FC' : '#5356EE',
                  letterSpacing: -0.1,
                }}
              >
                {statusBadge}
              </Text>
            </View>
          </View>

          {/* Stepper Progress Nodes: Picked -> In Transit -> Delivered */}
          <View style={{ marginTop: 22, paddingHorizontal: 4 }}>
            {/* Top Node Track Bar */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* Node 1: Picked (Completed) */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: isPicked ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                {isPicked ? (
                  <Feather name="check" size={11} color={theme.background} strokeWidth={3} />
                ) : null}
              </View>

              {/* Line 1 -> 2 */}
              <View
                style={{
                  flex: 1,
                  height: 2.5,
                  backgroundColor: isShipped ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : theme.hairline,
                  marginHorizontal: -2,
                  zIndex: 1,
                }}
              />

              {/* Node 2: In Transit */}
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: isShipped && !isDelivered ? 2.5 : 0,
                  borderColor: isDark ? '#6C47FF' : '#5356EE',
                  backgroundColor: isShipped ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 3,
                }}
              >
                {isShipped ? (
                  <Feather name="check" size={10} color={theme.background} strokeWidth={3} />
                ) : null}
              </View>

              {/* Line 2 -> 3 */}
              <View
                style={{
                  flex: 1,
                  height: 2.5,
                  backgroundColor: isDelivered ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : theme.hairline,
                  marginHorizontal: -2,
                  zIndex: 1,
                }}
              />

              {/* Node 3: Delivered */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: isDelivered ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                {isDelivered && (
                  <Feather name="check" size={11} color={theme.background} strokeWidth={3} />
                )}
              </View>
            </View>

            {/* Labels Beneath Stepper Nodes */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 8,
              }}
            >
              {/* Step 1 Label: Picked */}
              <View style={{ alignItems: 'flex-start', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: isPicked ? theme.ink : theme.mute,
                  }}
                >
                  Picked
                </Text>
                <Text
                  style={[
                    {
                      fontSize: 11,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 1,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {pickedTimeLabel}
                </Text>
              </View>

              {/* Step 2 Label: In Transit */}
              <View style={{ alignItems: 'center', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: isShipped ? (isDark ? '#A5B4FC' : '#5356EE') : theme.mute,
                  }}
                >
                  In Transit
                </Text>
                <Text
                  style={[
                    {
                      fontSize: 11,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 1,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {transitTimeLabel}
                </Text>
              </View>

              {/* Step 3 Label: Delivered */}
              <View style={{ alignItems: 'flex-end', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: isDelivered ? theme.ink : theme.mute,
                  }}
                >
                  Delivered
                </Text>
                <Text
                  style={[
                    {
                      fontSize: 11,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 1,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {deliveredTimeLabel}
                </Text>
              </View>
            </View>
          </View>

          {/* Track Shipping Action Button */}
          <Pressable
            onPress={handleTrackShipping}
            accessibilityRole="button"
            accessibilityLabel="Track Shipping status"
            style={({ pressed }) => ({
              backgroundColor: theme.ink,
              height: 48,
              borderRadius: radii.pill,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 20,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Feather name="box" size={16} color={theme.background} />
            <Text
              style={{
                fontSize: 14,
                fontFamily: typography.family.sansBold,
                color: theme.background,
                marginLeft: 8,
                letterSpacing: -0.2,
              }}
            >
              Track Shipping
            </Text>
          </Pressable>
        </GroupCard>

        {/* ── Seller Actions: Combined "Get a label" & "Ready to deliver" (Image 3 Design) ── */}
        <GroupCard>
          {/* Row 1: Get a label (Opens Image 2) */}
          <Pressable
            onPress={() => {
              tap('light');
              setLabelModalVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Get a label"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 14,
                minHeight: 54,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : theme.hairline,
              },
              pressed && { opacity: 0.75, backgroundColor: theme.surface },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
              <Feather name="printer" size={19} color={theme.ink} style={{ width: 26 }} />
              <Text
                style={{
                  fontSize: 15.5,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  letterSpacing: -0.2,
                  marginLeft: 8,
                }}
              >
                Get a label
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 13.5,
                  color: theme.mute,
                  fontFamily: typography.family.sansMedium,
                }}
              >
                Print / QR code
              </Text>
              <Feather name="chevron-right" size={16} color={theme.mute} />
            </View>
          </Pressable>

          {/* Row 2: Ready to deliver (Opens Pickup Scheduler & Required Contact Modal) */}
          <Pressable
            onPress={() => {
              tap('light');
              setReadyDeliverModalVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Ready to deliver"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 14,
                minHeight: 54,
              },
              pressed && { opacity: 0.75, backgroundColor: theme.surface },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
              <Ionicons name="cube-outline" size={20} color={theme.ink} style={{ width: 26 }} />
              <Text
                style={{
                  fontSize: 15.5,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  letterSpacing: -0.2,
                  marginLeft: 8,
                }}
              >
                Ready to deliver
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {pickupConfirmed ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Feather name="check-circle" size={14} color="#10B981" />
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#10B981',
                      fontFamily: typography.family.sansBold,
                    }}
                  >
                    {pickupConfirmedDateStr || 'Scheduled'}
                  </Text>
                </View>
              ) : (
                <Text
                  style={{
                    fontSize: 13.5,
                    color: theme.purple,
                    fontFamily: typography.family.sansBold,
                  }}
                >
                  Schedule pickup
                </Text>
              )}
              <Feather name="chevron-right" size={16} color={theme.mute} />
            </View>
          </Pressable>
        </GroupCard>

        {/* ── Segmented Control: Shipment vs Activity ── */}
        <View style={{ marginBottom: 16 }}>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6',
              borderRadius: 10,
              padding: 3,
            }}
          >
            <Pressable
              onPress={() => {
                tap('light');
                setActiveTab('shipment');
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'shipment' }}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: activeTab === 'shipment' ? (isDark ? '#2C2C2E' : '#FFFFFF') : 'transparent',
                ...(activeTab === 'shipment' && Platform.OS !== 'web'
                  ? {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.12,
                      shadowRadius: 2,
                      elevation: 2,
                    }
                  : {}),
              }}
            >
              <Text
                style={{
                  fontFamily: activeTab === 'shipment' ? typography.family.sansBold : typography.family.sansMedium,
                  fontSize: 13.5,
                  color: activeTab === 'shipment' ? theme.ink : theme.mute,
                }}
              >
                Shipment
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                tap('light');
                setActiveTab('activity');
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'activity' }}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: activeTab === 'activity' ? (isDark ? '#2C2C2E' : '#FFFFFF') : 'transparent',
                ...(activeTab === 'activity' && Platform.OS !== 'web'
                  ? {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.12,
                      shadowRadius: 2,
                      elevation: 2,
                    }
                  : {}),
              }}
            >
              <Text
                style={{
                  fontFamily: activeTab === 'activity' ? typography.family.sansBold : typography.family.sansMedium,
                  fontSize: 13.5,
                  color: activeTab === 'activity' ? theme.ink : theme.mute,
                }}
              >
                Activity
              </Text>
            </Pressable>
          </View>
        </View>

        {activeTab === 'shipment' ? (
          <>
            {/* ── Shipment Overview & Live Working Status System (Exact Replica of Image 4) ── */}
            <GroupCard style={{ padding: 18, marginBottom: 16 }}>
              {/* Header Row: Title "Shipment", Subtitle, Status Pill, Top-right Chat & Close */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <View>
                  <Text
                    style={{
                      fontSize: 28,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      letterSpacing: -0.6,
                      lineHeight: 32,
                    }}
                  >
                    Shipment
                  </Text>
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontFamily: typography.family.sansMedium,
                      color: theme.mute,
                      marginTop: 3,
                    }}
                  >
                    {actualItems.length} {actualItems.length === 1 ? 'Item' : 'Items'} • #{trackingNumber.replace('PAQ-', '') || '77656'}
                  </Text>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                      }}
                    >
                      {statusPillText}
                    </Text>
                  </View>
                </View>

                {/* Top Right Actions: Chat with Buyer & Close (Image 4 Replica) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    onPress={handleContactSeller}
                    hitSlop={HIT_SLOP_8}
                    accessibilityRole="button"
                    accessibilityLabel="Message buyer"
                    style={({ pressed }) => ({
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Feather name="message-square" size={18} color={theme.ink} />
                  </Pressable>

                  <Pressable
                    onPress={handleBack}
                    hitSlop={HIT_SLOP_8}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={({ pressed }) => ({
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Feather name="x" size={18} color={theme.ink} />
                  </Pressable>
                </View>
              </View>

              {/* Items List (Dynamic Order Items) */}
              {actualItems.map((sItem) => (
                <View
                  key={sItem.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    paddingVertical: 14,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.hairline,
                  }}
                >
                  {/* Square Thumbnail with subtle radius */}
                  <Image
                    source={{ uri: sItem.photo }}
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 8,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      marginRight: 14,
                    }}
                    contentFit="cover"
                  />

                  {/* Item Information */}
                  <View style={{ flex: 1 }}>
                    {/* Item Status Pill */}
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        paddingHorizontal: 8,
                        paddingVertical: 2.5,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                        marginBottom: 6,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontFamily: typography.family.sansBold, color: theme.ink }}>
                        {itemStatusBadgeText}
                      </Text>
                    </View>

                    {/* Title */}
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                        letterSpacing: -0.2,
                        lineHeight: 20,
                        marginBottom: 3,
                      }}
                      numberOfLines={2}
                    >
                      {sItem.title}
                    </Text>

                    {/* Order ID Link */}
                    <Pressable onPress={() => toast.show(sItem.orderId, { variant: 'default' })}>
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontFamily: typography.family.sansBold,
                          color: isDark ? '#A5B4FC' : '#2563EB',
                          marginBottom: 3,
                        }}
                      >
                        {sItem.orderId}
                      </Text>
                    </Pressable>

                    {/* Condition Metadata */}
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontFamily: typography.family.sans,
                        color: theme.mute,
                        marginBottom: 8,
                      }}
                    >
                      {sItem.condition}
                    </Text>

                    {/* Country of Origin Divider & Row */}
                    <View
                      style={{
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.hairline,
                        paddingTop: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      {sItem.origin ? (
                        <>
                          <Text style={{ fontSize: 12.5, fontFamily: typography.family.sansMedium, color: theme.mute }}>
                            Country of Origin: <Text style={{ color: theme.ink, fontFamily: typography.family.sansBold }}>{sItem.origin}</Text>
                          </Text>
                          <Pressable
                            onPress={() => setOriginModalVisible(true)}
                            hitSlop={HIT_SLOP_8}
                          >
                            <Text style={{ fontSize: 12.5, fontFamily: typography.family.sansBold, color: isDark ? '#A5B4FC' : '#2563EB' }}>
                              Edit
                            </Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Text style={{ fontSize: 12.5, fontFamily: typography.family.sansMedium, color: theme.mute }}>
                            Country of Origin
                          </Text>
                          <Pressable
                            onPress={() => setOriginModalVisible(true)}
                            hitSlop={HIT_SLOP_8}
                          >
                            <Text style={{ fontSize: 12.5, fontFamily: typography.family.sansBold, color: isDark ? '#A5B4FC' : '#2563EB' }}>
                              Select
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              ))}

              {/* ── Edit Shipment Section (Image 4 Replica) ── */}
              <View
                style={{
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.hairline,
                  paddingTop: 16,
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                    letterSpacing: -0.2,
                    marginBottom: 12,
                  }}
                >
                  Edit Shipment
                </Text>

                <View style={{ gap: 8, marginBottom: 14 }}>
                  {/* Unbundle Shipment Action */}
                  <Pressable
                    onPress={() => {
                      tap('light');
                      toast.show('Shipment unbundled for separate packaging', { variant: 'default', icon: 'layers' });
                    }}
                    style={({ pressed }) => ({
                      height: 44,
                      borderRadius: radii.pill,
                      backgroundColor: isDark ? '#2C2C2E' : '#E5E7EB',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 14, fontFamily: typography.family.sansBold, color: theme.ink }}>
                      Unbundle Shipment
                    </Text>
                  </Pressable>

                  {/* Edit Shipping Details Action */}
                  <Pressable
                    onPress={() => {
                      tap('light');
                      setReadyDeliverModalVisible(true);
                    }}
                    style={({ pressed }) => ({
                      height: 44,
                      borderRadius: radii.pill,
                      backgroundColor: isDark ? '#2C2C2E' : '#E5E7EB',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 14, fontFamily: typography.family.sansBold, color: theme.ink }}>
                      Edit Shipping Details
                    </Text>
                  </Pressable>
                </View>

                {/* Quick Status Pipeline Controls (Live Working Status Engine) */}
                <Text style={{ fontSize: 11.5, fontFamily: typography.family.sansBold, color: theme.mute, textTransform: 'uppercase', marginBottom: 8 }}>
                  Advance Order Status Pipeline
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { key: 'packing' as FulfillmentStatus, label: 'Packing (Needs Label)' },
                    { key: 'picked' as FulfillmentStatus, label: 'Picked' },
                    { key: 'shifting' as FulfillmentStatus, label: 'In Transit' },
                    { key: 'delivered' as FulfillmentStatus, label: 'Delivered' },
                    { key: 'completed' as FulfillmentStatus, label: 'Completed' },
                    { key: 'disputed' as FulfillmentStatus, label: 'Disputed' },
                    { key: 'canceled' as FulfillmentStatus, label: 'Cancelled' },
                  ].map((s) => {
                    const isSelected = currentFulfillment === s.key;
                    return (
                      <Pressable
                        key={s.key}
                        onPress={() => handleUpdateStatus(s.key)}
                        style={({ pressed }) => [
                          {
                            height: 32,
                            borderRadius: 16,
                            paddingHorizontal: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isSelected ? theme.ink : theme.surface,
                            borderWidth: 1,
                            borderColor: isSelected ? theme.ink : theme.border,
                          },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        {isSelected && <Feather name="check" size={12} color={theme.background} style={{ marginRight: 4 }} />}
                        <Text
                          style={{
                            fontSize: 12,
                            fontFamily: isSelected ? typography.family.sansBold : typography.family.sansMedium,
                            color: isSelected ? theme.background : theme.ink,
                          }}
                        >
                          {s.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </GroupCard>

            {/* ── Section: Courier & Dispatch ── */}
            <SectionEyebrow title="Courier & Dispatch" icon="truck" />
            <GroupCard>
              {/* Courier Info Row */}
              <View
                style={{
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : theme.hairline,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="truck" size={18} color={theme.ink} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                        letterSpacing: -0.2,
                      }}
                    >
                      {carrierName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: '#10B981',
                          marginRight: 6,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.mute,
                          fontFamily: typography.family.sans,
                        }}
                      >
                        Tracked Courier · {trackingNumber}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Quick Tracking Action */}
                <Pressable
                  onPress={handleCopyTracking}
                  hitSlop={HIT_SLOP_8}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Tracking ID"
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Feather name="copy" size={12} color={theme.ink} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: typography.family.sansMedium,
                      color: theme.ink,
                    }}
                  >
                    Copy
                  </Text>
                </Pressable>
              </View>

              {/* Message Buyer / Seller Row (Matching Image 1) */}
              <Pressable
                onPress={handleContactSeller}
                accessibilityRole="button"
                accessibilityLabel={isSeller ? 'Message Buyer' : 'Message Seller'}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    minHeight: 54,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : theme.hairline,
                  },
                  pressed && { opacity: 0.75, backgroundColor: theme.surface },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="message-square" size={17} color={theme.ink} />
                  </View>

                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      marginLeft: 12,
                      letterSpacing: -0.2,
                    }}
                  >
                    {isSeller ? 'Message Buyer' : 'Message Seller'}
                  </Text>
                </View>

                <Feather name="chevron-right" size={18} color={theme.mute} />
              </Pressable>

              {/* Buyer Protection Fee Row (Matching Checkout Module 5) */}
              <Pressable
                onPress={() => {
                  tap('light');
                  setBpSheetOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="View Buyer Protection details"
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 56,
                  },
                  pressed && { opacity: 0.8, backgroundColor: theme.surface },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
                  <ShieldCheckIcon size={24} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text
                        style={{
                          fontSize: 14.5,
                          fontFamily: typography.family.sansBold,
                          color: theme.ink,
                        }}
                      >
                        {BRAND} Buyer Protection
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: typography.family.sansBold,
                          color: theme.purple,
                        }}
                      >
                        {formatPrice(protectionFee)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                        marginTop: 2,
                        lineHeight: 16,
                      }}
                    >
                      48-hour inspection period · Full refund if item differs or doesn&apos;t arrive
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </Pressable>
            </GroupCard>

            {/* ── Section: Delivery Details ── */}
            <SectionEyebrow title="Delivery Details" icon="truck" />
            <GroupCard>
              <KeyValueRow label="Receiver" value={recipient} />
              <KeyValueRow label="Address" value={streetAddress} />
              <KeyValueRow label="Contact" value={phone} />
              <KeyValueRow label="Item" value={item} isLast={!note} />
              {note ? (
                <KeyValueRow
                  label="Note"
                  isLast
                  rightElement={
                    <View
                      style={{
                        height: 30,
                        borderRadius: 15,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2',
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
                      }}
                    >
                      <Feather
                        name="alert-triangle"
                        size={12}
                        color={theme.danger}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: typography.family.sansBold,
                          color: theme.danger,
                        }}
                      >
                        {note}
                      </Text>
                    </View>
                  }
                />
              ) : null}
            </GroupCard>
          </>
        ) : (
          /* ── Full Activity View with Exact Timestamps (Rule 1 & 3) ── */
          <>
            {/* Status Summary Banner */}
            <GroupCard
              style={{
                padding: 16,
                backgroundColor: isDark ? 'rgba(108, 71, 255, 0.12)' : '#F2F3FE',
                borderColor: isDark ? 'rgba(108, 71, 255, 0.28)' : 'rgba(83, 86, 238, 0.22)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="cube" size={18} color={theme.purple} />
                  <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
                    {trackingNumber}
                  </Text>
                </View>
                <View
                  style={{
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: theme.purple,
                    paddingHorizontal: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11.5, fontFamily: typography.family.sansBold, color: '#FFFFFF' }}>
                    {statusBadge}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 17 }}>
                Carrier: {carrierName} · Tracked Courier · Delivering to {streetAddress}
              </Text>
            </GroupCard>

            {/* Chronological Activity Timeline */}
            <SectionEyebrow title="Activity Timeline" icon="activity" badge={`${activityEvents.length} updates`} />
            <GroupCard style={{ padding: 18 }}>
              {activityEvents.map((evt, idx) => {
                const isLast = idx === activityEvents.length - 1;
                return (
                  <View key={evt.id} style={{ flexDirection: 'row', minHeight: isLast ? 48 : 64 }}>
                    {/* Timestamp Column */}
                    <View style={{ width: 84, paddingRight: 6 }}>
                      <Text
                        style={[
                          {
                            fontSize: 13,
                            fontFamily: typography.family.sansBold,
                            color: theme.ink,
                          },
                          tabularNumberStyle,
                        ]}
                      >
                        {evt.time}
                      </Text>
                      <Text
                        style={[
                          {
                            fontSize: 11,
                            color: theme.mute,
                            fontFamily: typography.family.sans,
                            marginTop: 1,
                          },
                          tabularNumberStyle,
                        ]}
                      >
                        {evt.date}
                      </Text>
                    </View>

                    {/* Stepper Node & Connector */}
                    <View style={{ alignItems: 'center', width: 22 }}>
                      <View
                        style={{
                          width: evt.isLatest ? 20 : 18,
                          height: evt.isLatest ? 20 : 18,
                          borderRadius: evt.isLatest ? 10 : 9,
                          backgroundColor: theme.ink,
                          borderWidth: evt.isLatest ? 2 : 0,
                          borderColor: theme.purple,
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 2,
                        }}
                      >
                        <Feather name="check" size={10} color={theme.background} strokeWidth={3} />
                      </View>
                      {!isLast && (
                        <View
                          style={{
                            flex: 1,
                            width: 1,
                            borderWidth: 1,
                            borderStyle: 'dashed',
                            borderColor: isDark ? 'rgba(255,255,255,0.2)' : theme.hairline,
                            marginVertical: 4,
                          }}
                        />
                      )}
                    </View>

                    {/* Event Description */}
                    <View style={{ flex: 1, paddingLeft: 12, paddingBottom: isLast ? 0 : 16 }}>
                      <Text
                        style={{
                          fontSize: 13.5,
                          color: theme.ink,
                          fontFamily: typography.family.sansBold,
                          marginBottom: 2,
                        }}
                      >
                        {evt.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12.5,
                          color: theme.mute,
                          lineHeight: 17,
                          fontFamily: typography.family.sansMedium,
                        }}
                      >
                        {evt.description}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </GroupCard>

            {/* ── "How to ship" Section Under Shipment Activity (Rule 3) ── */}
            <SectionEyebrow title="Shipping Guide" icon="help-circle" />
            <GroupCard>
              <Pressable
                onPress={() => {
                  tap('light');
                  setHowToShipModalVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="How to ship step-by-step guide"
                style={({ pressed }) => [
                  {
                    padding: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  },
                  pressed && { opacity: 0.8, backgroundColor: theme.surface },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Feather name="info" size={17} color={theme.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
                      How to ship
                    </Text>
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                        marginTop: 2,
                      }}
                    >
                      Read our step-by-step guide
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </Pressable>
            </GroupCard>
          </>
        )}

        {/* ── Contextual Order Action Buttons (Invoice E2E & Flow Compliant) ── */}
        {actionButtons ? (
          <View style={{ paddingBottom: 12 }}>
            {actionButtons}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Country of Origin Edit Modal (Image 4) ── */}
      <Modal
        visible={originModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOriginModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOriginModalVisible(false)} />
          <View
            style={[
              {
                width: '100%',
                maxWidth: 360,
                backgroundColor: theme.panel,
                borderRadius: 20,
                padding: 20,
                borderWidth: 1,
                borderColor: theme.border,
              },
              shadow.lg,
            ]}
          >
            <Text style={{ fontSize: 17, fontFamily: typography.family.sansBold, color: theme.ink, marginBottom: 12 }}>
              Select Country of Origin
            </Text>
            {['United States', 'Pakistan', 'United Kingdom', 'Japan', 'Italy', 'Germany'].map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  tap('light');
                  setCountryOfOrigin(c);
                  setOriginModalVisible(false);
                  toast.show(`Country of Origin set to: ${c}`, { variant: 'default', icon: 'check' });
                }}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 14.5, fontFamily: countryOfOrigin === c ? typography.family.sansBold : typography.family.sansMedium, color: theme.ink }}>
                  {c}
                </Text>
                {countryOfOrigin === c && <Feather name="check" size={16} color={theme.purple} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Modal 1: "Ship your item" (Exact Replica of Image 2) ── */}
      <Modal
        visible={labelModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLabelModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLabelModalVisible(false)} />
          <View
            style={[
              {
                backgroundColor: theme.panel,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: Math.max(insets.bottom, 20) + 12,
                maxHeight: '92%',
                maxWidth: CONTENT_MAX_WIDTH,
                width: '100%',
                alignSelf: 'center',
              },
              shadow.lg,
            ]}
          >
            {/* Header with Circular 'X' on top-left and Centered "Ship your item" */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                paddingVertical: 6,
                marginBottom: 16,
              }}
            >
              <Pressable
                onPress={() => setLabelModalVisible(false)}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => ({
                  position: 'absolute',
                  left: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Feather name="x" size={18} color={theme.ink} />
              </Pressable>

              <Text
                style={{
                  fontSize: 17,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  letterSpacing: -0.3,
                  textAlign: 'center',
                }}
              >
                Ship your item
              </Text>
            </View>

            {/* Sub-toggle: QR code vs Shipping label */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6',
                borderRadius: radii.pill,
                padding: 3,
                marginBottom: 16,
              }}
            >
              <Pressable
                onPress={() => {
                  tap('light');
                  setLabelSubTab('qr');
                }}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: labelSubTab === 'qr' ? (isDark ? '#2C2C2E' : '#FFFFFF') : 'transparent',
                  ...(labelSubTab === 'qr' && Platform.OS !== 'web' ? shadow.sm : {}),
                }}
              >
                <Text
                  style={{
                    fontSize: 13.5,
                    fontFamily: labelSubTab === 'qr' ? typography.family.sansBold : typography.family.sansMedium,
                    color: labelSubTab === 'qr' ? theme.ink : theme.mute,
                  }}
                >
                  QR code
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  tap('light');
                  setLabelSubTab('label');
                }}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: labelSubTab === 'label' ? (isDark ? '#2C2C2E' : '#FFFFFF') : 'transparent',
                  ...(labelSubTab === 'label' && Platform.OS !== 'web' ? shadow.sm : {}),
                }}
              >
                <Text
                  style={{
                    fontSize: 13.5,
                    fontFamily: labelSubTab === 'label' ? typography.family.sansBold : typography.family.sansMedium,
                    color: labelSubTab === 'label' ? theme.ink : theme.mute,
                  }}
                >
                  Shipping label
                </Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
              {labelSubTab === 'label' ? (
                /* ── Shipping Label Document Box (Image 2) ── */
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: '#000000',
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  {/* Top Bar: Big "G" + Postage Box */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottomWidth: 2,
                      borderBottomColor: '#000000',
                      paddingBottom: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 44, fontWeight: '900', color: '#000000', lineHeight: 46 }}>
                        G
                      </Text>
                      <View style={{ width: 1.5, height: 44, backgroundColor: '#000000', marginHorizontal: 12 }} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#000000' }}>
                        USPS GROUND ADVANTAGE
                      </Text>
                    </View>

                    <View
                      style={{
                        borderWidth: 1.5,
                        borderColor: '#000000',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 7, fontWeight: '800', color: '#000000' }}>
                        USPS GROUND ADVANTAGE
                      </Text>
                      <Text style={{ fontSize: 7, fontWeight: '700', color: '#000000' }}>
                        U.S. POSTAGE PAID
                      </Text>
                      <Text style={{ fontSize: 7, color: '#000000' }}>Shippo</Text>
                      <Text style={{ fontSize: 7, fontWeight: '700', color: '#000000' }}>USPS Ship</Text>
                    </View>
                  </View>

                  {/* Sender & Ship Date Row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#000000', textTransform: 'uppercase' }}>
                        {pickupContactName}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#000000', textTransform: 'uppercase' }}>
                        {pickupLine1}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#000000', textTransform: 'uppercase' }}>
                        {pickupCity} {pickupPostalCode}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 9.5, color: '#000000' }}>
                        Ship Date: {formatDate(new Date())}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#000000' }}>
                        Weight: 12 oz
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#000000', marginTop: 4 }}>
                        RDC 01
                      </Text>
                    </View>
                  </View>

                  {/* Recipient Address with Mini QR box */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderWidth: 1.5,
                        borderColor: '#000000',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 14,
                      }}
                    >
                      <Ionicons name="qr-code" size={34} color="#000000" />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#000000', textTransform: 'uppercase' }}>
                        {recipient}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#000000', textTransform: 'uppercase' }}>
                        {streetAddress}
                      </Text>
                    </View>
                  </View>

                  {/* Tracking Barcode Graphic (Image 2) */}
                  <View style={{ borderTopWidth: 2, borderTopColor: '#000000', paddingTop: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#000000', letterSpacing: 0.5, marginBottom: 6 }}>
                      USPS TRACKING # USPS Ship
                    </Text>

                    {/* Barcode Stripes */}
                    <View
                      style={{
                        flexDirection: 'row',
                        height: 52,
                        width: '100%',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 2,
                        marginBottom: 4,
                      }}
                    >
                      {[3, 1, 2, 4, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 3, 2, 1, 3, 4, 1, 2, 3, 1, 4, 2, 1, 3].map(
                        (w, i) => (
                          <View
                            key={i}
                            style={{
                              width: w,
                              height: 52,
                              backgroundColor: '#000000',
                            }}
                          />
                        ),
                      )}
                    </View>

                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#000000', letterSpacing: 1.5 }}>
                      9300 1107 9340 0008 6372 98
                    </Text>

                    <View style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                      <Ionicons name="qr-code" size={26} color="#000000" />
                    </View>
                  </View>
                </View>
              ) : (
                /* ── QR Code Option Box (Image 2) ── */
                <View
                  style={{
                    backgroundColor: theme.surface,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: 24,
                    alignItems: 'center',
                    marginBottom: 16,
                  }}
                >
                  <View
                    style={{
                      width: 180,
                      height: 180,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: '#000000',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                      ...shadow.md,
                    }}
                  >
                    <Ionicons name="qr-code" size={150} color="#000000" />
                  </View>

                  <Text style={{ fontSize: 16, fontFamily: typography.family.sansBold, color: theme.ink, marginBottom: 4 }}>
                    {trackingNumber}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12.5,
                      color: theme.mute,
                      textAlign: 'center',
                      lineHeight: 18,
                      fontFamily: typography.family.sans,
                      paddingHorizontal: 16,
                    }}
                  >
                    No printer needed. Simply show this digital QR code to your pickup courier or at any parcel station.
                  </Text>
                </View>
              )}

              {/* "How to ship" card inside Image 2 modal */}
              <Pressable
                onPress={() => setHowToShipModalVisible(true)}
                style={({ pressed }) => [
                  {
                    backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6',
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                  <Feather name="info" size={18} color={theme.ink} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
                      How to ship
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 1 }}>
                      Read our step-by-step guide
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </Pressable>

              {/* Download Label CTA Button */}
              <Pressable
                onPress={handleDownloadLabel}
                accessibilityRole="button"
                accessibilityLabel="Download label"
                style={({ pressed }) => ({
                  height: 48,
                  borderRadius: radii.pill,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: typography.family.sansBold,
                    color: theme.background,
                    letterSpacing: -0.2,
                  }}
                >
                  Download label
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal 2: "Ready to Deliver" - Pickup Address & 2-Date Selection (Rule 2) ── */}
      <Modal
        visible={readyDeliverModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReadyDeliverModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReadyDeliverModalVisible(false)} />
          <View
            style={[
              {
                backgroundColor: theme.panel,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: Math.max(insets.bottom, 20) + 12,
                maxHeight: '92%',
                maxWidth: CONTENT_MAX_WIDTH,
                width: '100%',
                alignSelf: 'center',
              },
              shadow.lg,
            ]}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
                marginBottom: 16,
              }}
            >
              <View>
                <Text style={{ fontSize: 17, fontFamily: typography.family.sansBold, color: theme.ink }}>
                  Ready to deliver
                </Text>
                <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                  Set your exact pickup location &amp; select a pickup date
                </Text>
              </View>

              <Pressable
                onPress={() => setReadyDeliverModalVisible(false)}
                hitSlop={HIT_SLOP_8}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Feather name="x" size={16} color={theme.ink} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Pickup Address Fields */}
              <Text style={{ fontSize: 12, fontFamily: typography.family.sansBold, color: theme.mute, textTransform: 'uppercase', marginBottom: 8 }}>
                Exact Pickup Point Address (Required)
              </Text>

              <View style={{ gap: 10, marginBottom: 16 }}>
                <TextInput
                  value={pickupLine1}
                  onChangeText={setPickupLine1}
                  placeholder="Street Address (e.g. 210 Dan Allen Drive)"
                  placeholderTextColor={theme.mute}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                  }}
                />
                <TextInput
                  value={pickupLine2}
                  onChangeText={setPickupLine2}
                  placeholder="Apt, Suite, Floor (Optional)"
                  placeholderTextColor={theme.mute}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput
                    value={pickupCity}
                    onChangeText={setPickupCity}
                    placeholder="City"
                    placeholderTextColor={theme.mute}
                    style={{
                      flex: 1,
                      height: 46,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      paddingHorizontal: 14,
                      fontSize: 14,
                      color: theme.ink,
                      fontFamily: typography.family.sans,
                    }}
                  />
                  <TextInput
                    value={pickupPostalCode}
                    onChangeText={setPickupPostalCode}
                    placeholder="Postal Code"
                    placeholderTextColor={theme.mute}
                    style={{
                      width: 110,
                      height: 46,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      paddingHorizontal: 14,
                      fontSize: 14,
                      color: theme.ink,
                      fontFamily: typography.family.sans,
                    }}
                  />
                </View>
              </View>

              {/* Necessary Contact Details */}
              <Text style={{ fontSize: 12, fontFamily: typography.family.sansBold, color: theme.mute, textTransform: 'uppercase', marginBottom: 8 }}>
                Pickup Contact Details (Required)
              </Text>

              <View style={{ gap: 10, marginBottom: 18 }}>
                <TextInput
                  value={pickupContactName}
                  onChangeText={setPickupContactName}
                  placeholder="Contact Person Name"
                  placeholderTextColor={theme.mute}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                  }}
                />
                <TextInput
                  value={pickupContactPhone}
                  onChangeText={setPickupContactPhone}
                  placeholder="Contact Phone (for Driver call/SMS)"
                  keyboardType="phone-pad"
                  placeholderTextColor={theme.mute}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                  }}
                />
              </View>

              {/* 2 Dates Selection: Tomorrow vs Day After (Rule 2) */}
              <Text style={{ fontSize: 12, fontFamily: typography.family.sansBold, color: theme.mute, textTransform: 'uppercase', marginBottom: 8 }}>
                Select Pickup Date (2 Available Slots)
              </Text>

              <View style={{ gap: 10, marginBottom: 22 }}>
                {/* Date Option 1: Tomorrow */}
                <Pressable
                  onPress={() => {
                    tap('light');
                    setPickupSelectedDate('tomorrow');
                  }}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: pickupSelectedDate === 'tomorrow' ? theme.purple : theme.border,
                      backgroundColor:
                        pickupSelectedDate === 'tomorrow'
                          ? isDark
                            ? 'rgba(108, 71, 255, 0.14)'
                            : '#F2F3FE'
                          : theme.surface,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: pickupSelectedDate === 'tomorrow' ? theme.purple : theme.mute,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {pickupSelectedDate === 'tomorrow' && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.purple }} />
                      )}
                    </View>

                    <View>
                      <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
                        Tomorrow ({tomorrowFormatted})
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 1 }}>
                        Pickup window: 10:00 AM – 2:00 PM
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: radii.pill,
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#D1FAE5',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: typography.family.sansBold, color: '#10B981' }}>
                      Recommended
                    </Text>
                  </View>
                </Pressable>

                {/* Date Option 2: The Day After That */}
                <Pressable
                  onPress={() => {
                    tap('light');
                    setPickupSelectedDate('day_after');
                  }}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: pickupSelectedDate === 'day_after' ? theme.purple : theme.border,
                      backgroundColor:
                        pickupSelectedDate === 'day_after'
                          ? isDark
                            ? 'rgba(108, 71, 255, 0.14)'
                            : '#F2F3FE'
                          : theme.surface,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: pickupSelectedDate === 'day_after' ? theme.purple : theme.mute,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {pickupSelectedDate === 'day_after' && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.purple }} />
                      )}
                    </View>

                    <View>
                      <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
                        Day after tomorrow ({dayAfterFormatted})
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 1 }}>
                        Pickup window: 11:00 AM – 3:00 PM
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              {/* Confirm CTA */}
              <Pressable
                onPress={handleConfirmPickupSchedule}
                accessibilityRole="button"
                accessibilityLabel="Confirm pickup schedule"
                style={({ pressed }) => ({
                  height: 48,
                  borderRadius: radii.pill,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: typography.family.sansBold,
                    color: theme.background,
                    letterSpacing: -0.2,
                  }}
                >
                  Confirm Pickup &amp; Mark Ready
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal 3: "How to ship - Step-by-Step Guide" ── */}
      <Modal
        visible={howToShipModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHowToShipModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHowToShipModalVisible(false)} />
          <View
            style={[
              {
                backgroundColor: theme.panel,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: Math.max(insets.bottom, 20) + 12,
                maxHeight: '88%',
                maxWidth: CONTENT_MAX_WIDTH,
                width: '100%',
                alignSelf: 'center',
              },
              shadow.lg,
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
                marginBottom: 16,
              }}
            >
              <View>
                <Text style={{ fontSize: 17, fontFamily: typography.family.sansBold, color: theme.ink }}>
                  How to ship
                </Text>
                <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                  Step-by-step seller packing &amp; dispatch guidelines
                </Text>
              </View>

              <Pressable
                onPress={() => setHowToShipModalVisible(false)}
                hitSlop={HIT_SLOP_8}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Feather name="x" size={16} color={theme.ink} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {[
                {
                  step: '1',
                  title: 'Secure Packaging',
                  description:
                    'Place item inside a sturdy box or tear-resistant mailer. Add bubble wrap or tissue cushioning so the item does not shift.',
                  icon: 'package',
                },
                {
                  step: '2',
                  title: 'Label Placement',
                  description:
                    'Print your shipping label or prepare the QR code. Tape the printed label flat on top without covering the barcode or address.',
                  icon: 'file-text',
                },
                {
                  step: '3',
                  title: 'Hand Over at Pickup',
                  description:
                    `Courier will arrive on your chosen pickup date (${pickupConfirmedDateStr || tomorrowFormatted}). Hand over the package and request a digital receipt.`,
                  icon: 'truck',
                },
                {
                  step: '4',
                  title: 'Automatic Tracking & Escrow',
                  description:
                    'The tracking stepper will flip to Picked and then In Transit as soon as scanned. Payout is released after 48-hour delivery verification.',
                  icon: 'shield',
                },
              ].map((item, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    marginBottom: 16,
                    backgroundColor: theme.surface,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: theme.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      marginTop: 2,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: typography.family.sansBold, color: theme.background }}>
                      {item.step}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink, marginBottom: 3 }}>
                      {item.title}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 17 }}>
                      {item.description}
                    </Text>
                  </View>
                </View>
              ))}

              <Pressable
                onPress={() => setHowToShipModalVisible(false)}
                style={({ pressed }) => ({
                  height: 48,
                  borderRadius: radii.pill,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 8,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.background }}>
                  Got it
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Buyer Protection Breakdown Sheet ── */}
      <BuyerProtectionSheet
        visible={bpSheetOpen}
        onClose={() => setBpSheetOpen(false)}
        itemPrice={listingPrice}
      />

      {/* ── Live Track Shipping Modal (Carrier Sheet) ── */}
      <Modal
        visible={trackingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTrackingModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTrackingModalVisible(false)} />
          <View
            style={[
              {
                backgroundColor: theme.panel,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 22,
                maxHeight: '82%',
                maxWidth: CONTENT_MAX_WIDTH,
                width: '100%',
                alignSelf: 'center',
              },
              shadow.lg,
            ]}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.hairline,
                alignSelf: 'center',
                marginBottom: 18,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 17,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                    letterSpacing: -0.3,
                  }}
                >
                  Live Shipment Tracking
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.mute,
                    marginTop: 2,
                    fontFamily: typography.family.sans,
                  }}
                >
                  Carrier: {BRAND} Managed Express Delivery
                </Text>
              </View>

              <Pressable
                onPress={() => setTrackingModalVisible(false)}
                hitSlop={HIT_SLOP_8}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="x" size={16} color={theme.ink} />
              </Pressable>
            </View>

            <View
              style={{
                backgroundColor: isDark ? 'rgba(108, 71, 255, 0.16)' : '#F2F3FE',
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(108, 71, 255, 0.3)' : 'rgba(83, 86, 238, 0.22)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="truck" size={16} color={theme.purple} />
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: typography.family.sansBold,
                    color: theme.purple,
                  }}
                >
                  On Schedule · {statusBadge}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12.5,
                  color: isDark ? '#C7D2FE' : '#3730A3',
                  marginTop: 4,
                  fontFamily: typography.family.sans,
                  lineHeight: 17,
                }}
              >
                Estimated delivery to {streetAddress} by {formatDate(new Date(orderCreatedAt.getTime() + 86400000 * 3))}. Tracked via {carrierName}.
              </Text>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: theme.background,
              }}
            >
              <KeyValueRow label="Waybill / Tracking No." value={trackingNumber} />
              <KeyValueRow label="Package Status" value={statusBadge} />
              <KeyValueRow label="Carrier" value={carrierName} isLast />
            </View>

            <Pressable
              onPress={() => setTrackingModalVisible(false)}
              style={({ pressed }) => ({
                backgroundColor: theme.ink,
                height: 48,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 20,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 14.5,
                  fontFamily: typography.family.sansBold,
                  color: theme.background,
                  letterSpacing: -0.2,
                }}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
