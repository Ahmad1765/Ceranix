import React, { useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import type { Order } from '@/lib/payments';
import type { Listing } from '@/types';

export interface OrderDetailsTrackingViewProps {
  order?: Order | null;
  listing?: Listing | null;
  isSeller?: boolean;
  onBack?: () => void;
  onShare?: () => void;
  actionButtons?: React.ReactNode;
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

/**
 * Section eyebrow header with high-contrast micro-typography
 */
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

/**
 * Grouped card container with crisp hairline border and subtle elevation
 */
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
          marginBottom: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * High-density key-value row with hairline dividers
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// ORDER DETAILS TRACKING VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function OrderDetailsTrackingView({
  order,
  listing,
  isSeller = false,
  onBack,
  onShare,
  actionButtons,
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
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);

  // Dynamic values resolving to exact mockup defaults when not supplied
  const trackingNumber =
    propTrackingId ||
    (order as any)?.tracking_number ||
    (order?.id ? `PAQ-${order.id.slice(0, 3).toUpperCase()}-${order.id.slice(-3).toUpperCase()}` : 'PAQ-327-P21');

  const fulfillment = (order as any)?.fulfillment_status || order?.status;
  const statusBadge =
    propStatusLabel ||
    (fulfillment === 'delivered'
      ? 'Delivered'
      : fulfillment === 'shifting' || (order as any)?.shipped_at
      ? 'In Transit'
      : fulfillment === 'completed'
      ? 'Completed'
      : 'In Transit');

  const addr = (order?.shipping_address as any) || {};
  const recipient =
    propReceiverName ||
    addr.recipientName ||
    addr.recipient_name ||
    (order as any)?.buyer?.full_name ||
    'John Doe';

  const streetAddress =
    propDeliveryAddress ||
    [addr.line1, addr.city].filter(Boolean).join(', ') ||
    '12, Palm Groove';

  const phone =
    propContactPhone ||
    addr.phone ||
    '+234 - 123 -201-419';

  const item =
    propItemTitle ||
    listing?.title ||
    (order as any)?.listing?.title ||
    'Samsung 75" Oled';

  const note =
    propDeliveryNote ||
    order?.delivery_notes ||
    'Fragile';

  const rider = propRiderName || (order as any)?.courier_name || 'Mr John';
  const riderPhoto =
    propRiderAvatar ||
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80';
  const riderTel = propRiderPhone || phone;

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

  // Call Rider Handler
  const handleCallRider = () => {
    tap('medium');
    const sanitized = riderTel.replace(/[^0-9+]/g, '');
    const url = `tel:${sanitized}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          toast.show(`Calling ${rider}: ${riderTel}`, {
            variant: 'default',
            icon: 'phone',
          });
        }
      })
      .catch(() => {
        toast.show(`Calling ${rider}: ${riderTel}`, {
          variant: 'default',
          icon: 'phone',
        });
      });
  };

  // Message Rider Handler
  const handleMessageRider = () => {
    tap('light');
    toast.show(`Opened message thread with ${rider}`, {
      variant: 'default',
      icon: 'message-square',
    });
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

  // Safe bottom clearance accounting for the floating dock
  const bottomScrollPadding = Math.max(insets.bottom, 24) + 64;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* ── Top Header Navigation Bar (Quiet Atelier Standard) ── */}
      <View
        style={{
          paddingTop: Platform.OS === 'ios' ? 10 : 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: theme.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
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
          {/* Back Circular Button matching Emil's spring press feel */}
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
              fontSize: 16,
              fontFamily: typography.family.sansBold,
              color: theme.ink,
              letterSpacing: -0.2,
            }}
          >
            Details
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
          paddingTop: 16,
          paddingBottom: bottomScrollPadding,
          maxWidth: CONTENT_MAX_WIDTH,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {/* ── Card 1: Tracking Hero, Stepper & Primary Track CTA ── */}
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

            {/* Canonical In-Transit Status Pill (Protected Three-Hue Invariant & 30px Chip Standard) */}
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

          {/* Stepper Progress Nodes (Emil Kowalski Active Pulse Ring) */}
          <View style={{ marginTop: 22, paddingHorizontal: 4 }}>
            {/* Top Node Track Bar */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* Node 1: Recieved (Completed) */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                <Feather name="check" size={11} color={theme.background} strokeWidth={3} />
              </View>

              {/* Line 1 -> 2 (Completed Solid Ink) */}
              <View
                style={{
                  flex: 1,
                  height: 2.5,
                  backgroundColor: theme.ink,
                  marginHorizontal: -2,
                  zIndex: 1,
                }}
              />

              {/* Node 2: In Transit (Active Stage with Halo Ring) */}
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: 2.5,
                  borderColor: isDark ? '#6C47FF' : '#5356EE',
                  backgroundColor: theme.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 3,
                }}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: theme.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="check" size={8} color={theme.background} strokeWidth={3} />
                </View>
              </View>

              {/* Line 2 -> 3 (Pending Track) */}
              <View
                style={{
                  flex: 1,
                  height: 2.5,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : theme.hairline,
                  marginHorizontal: -2,
                  zIndex: 1,
                }}
              />

              {/* Node 3: Delivered (Pending) */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              />
            </View>

            {/* Labels Beneath Stepper Nodes */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 8,
              }}
            >
              {/* Step 1 Label */}
              <View style={{ alignItems: 'flex-start', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                  }}
                >
                  Received
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
                  10:30am
                </Text>
              </View>

              {/* Step 2 Label */}
              <View style={{ alignItems: 'center', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: isDark ? '#A5B4FC' : '#5356EE',
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
                  12:00pm
                </Text>
              </View>

              {/* Step 3 Label */}
              <View style={{ alignItems: 'flex-end', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: theme.mute,
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
                  Pending
                </Text>
              </View>
            </View>
          </View>

          {/* Track Shipping Action Button (Pill Capsule, Solid Ink, Tactile Press) */}
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

        {/* ── Section 2: Delivery Details ── */}
        <SectionEyebrow title="Delivery Details" icon="truck" />
        <GroupCard>
          <KeyValueRow label="Receiver" value={recipient} />
          <KeyValueRow label="Address" value={streetAddress} />
          <KeyValueRow label="Contact" value={phone} />
          <KeyValueRow label="Item" value={item} />
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
        </GroupCard>

        {/* ── Section 3: Courier & Dispatch ── */}
        <SectionEyebrow title="Courier & Dispatch" icon="user" />
        <GroupCard
          style={{
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Courier Info */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Image
              source={{ uri: riderPhoto }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
              contentFit="cover"
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  letterSpacing: -0.2,
                }}
              >
                {rider}
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
                  Assigned Driver · {BRAND} Express
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Communication Actions (Message & Call with Emil Tactile Scale) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={handleMessageRider}
              hitSlop={HIT_SLOP_8}
              accessibilityRole="button"
              accessibilityLabel={`Message ${rider}`}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
            >
              <Feather name="message-square" size={16} color={theme.ink} />
            </Pressable>

            <Pressable
              onPress={handleCallRider}
              hitSlop={HIT_SLOP_8}
              accessibilityRole="button"
              accessibilityLabel={`Call ${rider}`}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: theme.ink,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
            >
              <Feather name="phone" size={16} color={theme.background} />
            </Pressable>
          </View>
        </GroupCard>

        {/* ── Section 4: Shipment Activity ── */}
        <SectionEyebrow title="Shipment Activity" icon="activity" badge="3 updates" />
        <GroupCard style={{ padding: 18 }}>
          {/* Timeline Item 1 (Latest / Active) */}
          <View style={{ flexDirection: 'row', minHeight: 64 }}>
            {/* Timestamp Column */}
            <View style={{ width: 80, paddingRight: 6 }}>
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
                9:30am
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
                16 Jan 2026
              </Text>
            </View>

            {/* Stepper Node & Connector */}
            <View style={{ alignItems: 'center', width: 22 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="check" size={10} color={theme.background} strokeWidth={3} />
              </View>
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
            </View>

            {/* Event Description */}
            <View style={{ flex: 1, paddingLeft: 12, paddingBottom: 16 }}>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.ink,
                  lineHeight: 18,
                  fontFamily: typography.family.sansMedium,
                }}
              >
                The package has reached the local delivery center and is being sorted.
              </Text>
            </View>
          </View>

          {/* Timeline Item 2 */}
          <View style={{ flexDirection: 'row', minHeight: 64 }}>
            {/* Timestamp Column */}
            <View style={{ width: 80, paddingRight: 6 }}>
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
                12:00pm
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
                16 Jan 2026
              </Text>
            </View>

            {/* Stepper Node & Connector */}
            <View style={{ alignItems: 'center', width: 22 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="check" size={10} color={theme.background} strokeWidth={3} />
              </View>
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
            </View>

            {/* Event Description */}
            <View style={{ flex: 1, paddingLeft: 12, paddingBottom: 16 }}>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.ink,
                  lineHeight: 18,
                  fontFamily: typography.family.sansMedium,
                }}
              >
                The package is out for delivery. Estimated delivery by 26 Jan 2026.
              </Text>
            </View>
          </View>

          {/* Timeline Item 3 (Terminal) */}
          <View style={{ flexDirection: 'row' }}>
            {/* Timestamp Column */}
            <View style={{ width: 80, paddingRight: 6 }}>
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
                3:45pm
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
                20 Jan 2026
              </Text>
            </View>

            {/* Stepper Node */}
            <View style={{ alignItems: 'center', width: 22 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="check" size={10} color={theme.background} strokeWidth={3} />
              </View>
            </View>

            {/* Event Description */}
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.ink,
                  lineHeight: 18,
                  fontFamily: typography.family.sansMedium,
                }}
              >
                The package arrived distribution center. Item is being processed.
              </Text>
            </View>
          </View>
        </GroupCard>

        {/* ── Contextual Order Action Buttons (Invoice E2E & Flow Compliant) ── */}
        {actionButtons ? (
          <View style={{ paddingBottom: 12 }}>
            {actionButtons}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Live Track Shipping Modal (Unified Sheet Primitive) ── */}
      <Modal
        visible={trackingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTrackingModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.overlay,
            justifyContent: 'flex-end',
          }}
        >
          {/* Backdrop Tap to Dismiss (Emil Kowalski Sheet Pattern) */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setTrackingModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close tracking sheet"
          />
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
            {/* Modal Drag Handle matching Emil's sheet physics */}
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

            {/* Sheet Title Bar */}
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
                accessibilityRole="button"
                accessibilityLabel="Close tracking modal"
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
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <Feather name="x" size={16} color={theme.ink} />
              </Pressable>
            </View>

            {/* Status Summary Banner */}
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
                  On Schedule · In Transit
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
                Estimated delivery to {streetAddress} by 26 Jan 2026. Driver {rider} is on the way.
              </Text>
            </View>

            {/* Key-Value Details inside Sheet */}
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
              <KeyValueRow label="Package Weight" value="18.5 kg · Fragile" />
              <KeyValueRow label="Assigned Driver" value={`${rider} (${phone})`} isLast />
            </View>

            {/* Done Dismiss Button */}
            <Pressable
              onPress={() => setTrackingModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss modal"
              style={({ pressed }) => ({
                backgroundColor: theme.ink,
                height: 48,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 20,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
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
