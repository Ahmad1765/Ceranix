// One row in a conversation thread: a text bubble, an offer, or a system
// notice. Grouping-aware — a run of messages from the same sender collapses
// into one visual block with a single tail and a single meta line.
//
// The meta (time, sender, delivery state) lives OUTSIDE the bubble. That's the
// Plick move and it's the right one: the bubble stays a clean container for
// what was actually said, and the metadata reads as a consistent muted column
// down each side instead of as chrome inside every message.

import { memo, useCallback, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '@/components/PressableScale';
import { radii, shadow, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import type { ChatMessage } from '@/lib/chat';
import type { Anchor } from './ReactionPicker';
import { bubbleStamp } from './format';

const TAIL_RADIUS = 6;
const BUBBLE_RADIUS = 18;

export type MessageRowProps = {
  msg: ChatMessage;
  mine: boolean;
  /** Viewer is the seller on this listing — controls who can answer an offer. */
  isSeller: boolean;
  /** Continues a run from the same sender: tighten the top corner, tight margin. */
  grouped: boolean;
  /** Last of its run: draws the tail and the meta line. */
  lastOfGroup: boolean;
  /** Shown in the meta line of an incoming group, the way Plick attributes them. */
  senderName: string;
  senderAvatar?: string | null;
  listingId: string | null;
  listingTitle?: string | null;
  listingThumb?: string | null;
  listingPrice: number | null;
  listingSold: boolean;
  /** Every emoji on this message, in arrival order. */
  reactions: string[];
  onAccept: () => void;
  onDecline: () => void;
  onCounterOffer?: () => void;
  onPay: (amount: number, bundleIds?: string[]) => void;
  onRetry: () => void;
  /** Long-press: opens the reaction bar over the measured bubble. */
  onLongPress: (anchor: Anchor) => void;
};

// ── Meta line ─────────────────────────────────────────────────────────────

function MetaLine({
  msg,
  mine,
  senderName,
  onRetry,
}: Pick<MessageRowProps, 'msg' | 'mine' | 'senderName' | 'onRetry'>) {
  const { theme } = useTheme();
  const base = {
    fontFamily: typography.family.sans,
    fontSize: 11,
    lineHeight: 14,
    color: theme.muteSoft,
  } as const;

  if (mine && msg.failed) {
    return (
      <PressableScale
        onPress={onRetry}
        accessibilityLabel="Retry sending message"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
      >
        <Feather name="rotate-cw" size={10} color={theme.ink} />
        <Text style={{ ...base, fontFamily: typography.family.sansSemibold, color: theme.ink }}>
          Not sent · Tap to retry
        </Text>
      </PressableScale>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
        paddingHorizontal: 2,
      }}
    >
      <Text style={base}>
        {msg.pending ? 'Sending…' : bubbleStamp(msg.created_at)}
      </Text>
      {mine && !msg.pending && <Feather name="check" size={11} color={theme.muteSoft} />}
    </View>
  );
}

function SystemNotice({ msg }: { msg: ChatMessage }) {
  const { theme } = useTheme();
  if (msg.metadata?.paid === true) {
    return (
      <View style={{ paddingHorizontal: 16, marginVertical: 12 }}>
        <View
          style={{
            backgroundColor: theme.white,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 14,
            ...shadow.sm,
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 14.5,
              fontWeight: '700',
              color: theme.ink,
              marginBottom: 4,
            }}
          >
            Done!
          </Text>
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13,
              lineHeight: 18,
              color: theme.mute,
            }}
          >
            {msg.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 40, marginVertical: 12 }}>
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 12,
          lineHeight: 17,
          color: theme.mute,
          textAlign: 'center',
        }}
      >
        {msg.content}
      </Text>
    </View>
  );
}

// ── Modern AI / Grok-Inspired Offer UI ──────────────────────────────────────

function OfferStatusPill({ status, isPaid }: { status: string; isPaid: boolean }) {
  const { theme } = useTheme();

  if (isPaid) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: radii.pill,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
        }}
      >
        <Feather name="shield" size={10} color="#10B981" />
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 11,
            color: '#10B981',
            letterSpacing: 0.2,
          }}
        >
          Paid
        </Text>
      </View>
    );
  }

  if (status === 'accepted') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: radii.pill,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
        }}
      >
        <Feather name="check" size={10} color="#10B981" />
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 11,
            color: '#10B981',
            letterSpacing: 0.2,
          }}
        >
          Accepted
        </Text>
      </View>
    );
  }

  if (status === 'declined') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: radii.pill,
          backgroundColor: 'rgba(239, 68, 68, 0.10)',
        }}
      >
        <Feather name="x" size={10} color="#EF4444" />
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 11,
            color: '#EF4444',
            letterSpacing: 0.2,
          }}
        >
          Declined
        </Text>
      </View>
    );
  }

  if (status === 'expired') {
    return (
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: radii.pill,
          backgroundColor: theme.panel,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sansMedium,
            fontSize: 11,
            color: theme.muteSoft,
          }}
        >
          Expired
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radii.pill,
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
      }}
    >
      <Feather name="clock" size={10} color="#D97706" />
      <Text
        style={{
          fontFamily: typography.family.sansBold,
          fontSize: 11,
          color: '#D97706',
          letterSpacing: 0.2,
        }}
      >
        Pending
      </Text>
    </View>
  );
}

function OutgoingOfferBubble({
  msg,
  listingPrice,
  canPay,
  onPay,
}: {
  msg: ChatMessage;
  listingPrice: number | null;
  canPay: boolean;
  onPay: (amount: number, bundleIds?: string[]) => void;
}) {
  const { theme } = useTheme();
  const amount = msg.metadata?.amount ?? 0;
  const status = msg.offer_status ?? 'pending';
  const isBundle = Boolean(msg.metadata?.is_bundle);
  const bundleCount = msg.metadata?.bundle_count ?? (msg.metadata?.bundle_item_ids ? msg.metadata.bundle_item_ids.length + 1 : 1);
  const showStruck = !isBundle && !!listingPrice && listingPrice > amount;
  const discountPercent = showStruck && listingPrice ? Math.round(((listingPrice - amount) / listingPrice) * 100) : 0;
  const isPaid = Boolean(
    msg.metadata?.paid ||
    msg.metadata?.order_status === 'paid' ||
    msg.metadata?.payment_status === 'paid'
  );

  return (
    <View
      style={{
        minWidth: 220,
        maxWidth: 320,
        backgroundColor: theme.panel,
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.border,
        ...shadow.sm,
      }}
    >
      {/* Top Header: Type & Status */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Feather name={isBundle ? 'package' : 'tag'} size={12} color={theme.primary} />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 11,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: theme.mute,
            }}
          >
            {isBundle ? `Bundle (${bundleCount})` : 'Your Offer'}
          </Text>
        </View>
        <OfferStatusPill status={status} isPaid={isPaid} />
      </View>

      {/* Main Price Row */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 20,
            letterSpacing: -0.3,
            color: theme.ink,
          }}
        >
          {formatPrice(amount)}
        </Text>
        {showStruck && (
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13.5,
              color: theme.muteSoft,
              textDecorationLine: 'line-through',
            }}
          >
            {formatPrice(listingPrice)}
          </Text>
        )}
        {discountPercent > 0 && (
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: radii.pill,
              backgroundColor: theme.primarySoft,
            }}
          >
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 10.5,
                color: theme.primary,
              }}
            >
              -{discountPercent}%
            </Text>
          </View>
        )}
      </View>

      {/* Note Callout if provided */}
      {msg.metadata?.note ? (
        <View
          style={{
            marginTop: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: radii.lg,
            backgroundColor: theme.surface,
            borderLeftWidth: 2,
            borderLeftColor: theme.primary,
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 12,
              lineHeight: 16,
              color: theme.ink,
            }}
          >
            {msg.metadata.note}
          </Text>
        </View>
      ) : null}

      {/* Pay Now Button (if Accepted) */}
      {canPay && (
        <PressableScale
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            onPay(amount, msg.metadata?.bundle_item_ids);
          }}
          accessibilityLabel={`Pay ${formatPrice(amount)}`}
          style={{
            marginTop: 10,
            height: 40,
            borderRadius: radii.pill,
            backgroundColor: theme.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingHorizontal: 14,
            alignSelf: 'stretch',
            ...shadow.sm,
          }}
        >
          <Feather name="credit-card" size={14} color="#FFFFFF" />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13.5,
              color: '#FFFFFF',
              letterSpacing: 0.1,
            }}
          >
            Buy now · {formatPrice(amount)}
          </Text>
        </PressableScale>
      )}

      {/* Paid Guarantee note */}
      {isPaid && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Feather name="check-circle" size={12} color="#10B981" />
          <Text
            style={{
              fontFamily: typography.family.sansMedium,
              fontSize: 11.5,
              color: '#10B981',
            }}
          >
            Paid · Buyer Protection active 🛡️
          </Text>
        </View>
      )}
    </View>
  );
}

function IncomingOfferCard({
  msg,
  senderName,
  listingPrice,
  listingSold,
  isSeller,
  canRespond,
  canPay,
  awaitingPayment,
  isPaid,
  onAccept,
  onDecline,
  onCounterOffer,
  onPay,
}: {
  msg: ChatMessage;
  senderName: string;
  listingPrice: number | null;
  listingSold: boolean;
  isSeller: boolean;
  canRespond: boolean;
  canPay: boolean;
  awaitingPayment: boolean;
  isPaid: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCounterOffer?: () => void;
  onPay: (amount: number, bundleIds?: string[]) => void;
}) {
  const { theme } = useTheme();
  const amount = msg.metadata?.amount ?? 0;
  const status = msg.offer_status ?? 'pending';
  const isBundle = Boolean(msg.metadata?.is_bundle);
  const bundleCount = msg.metadata?.bundle_count ?? (msg.metadata?.bundle_item_ids ? msg.metadata.bundle_item_ids.length + 1 : 1);
  const showStruck = !isBundle && !!listingPrice && listingPrice > amount;
  const discountPercent = showStruck && listingPrice ? Math.round(((listingPrice - amount) / listingPrice) * 100) : 0;
  const isDeclined = status === 'declined';
  const isExpired = status === 'expired';
  const canMakeCounter = (isDeclined || isExpired) && !listingSold && !!onCounterOffer;

  return (
    <View
      style={{
        minWidth: 240,
        maxWidth: 320,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 18,
        padding: 14,
        ...shadow.sm,
      }}
    >
      {/* Top Header: Sender & Status */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <Feather name={isBundle ? 'package' : 'tag'} size={12} color={theme.primary} />
          <Text
            numberOfLines={1}
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 11,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: theme.mute,
            }}
          >
            {isBundle ? `Bundle Offer · ${bundleCount} items` : `${senderName}'s Offer`}
          </Text>
        </View>
        <OfferStatusPill status={status} isPaid={isPaid} />
      </View>

      {/* Main Price Row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 6,
          flexWrap: 'wrap',
          marginTop: 2,
          marginBottom: canRespond || canPay || canMakeCounter || awaitingPayment || isPaid ? 10 : 0,
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 20,
            letterSpacing: -0.3,
            color: theme.ink,
          }}
        >
          {formatPrice(amount)}
        </Text>
        {showStruck && (
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13.5,
              color: theme.muteSoft,
              textDecorationLine: 'line-through',
            }}
          >
            {formatPrice(listingPrice)}
          </Text>
        )}
        {discountPercent > 0 && (
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: radii.pill,
              backgroundColor: theme.primarySoft,
            }}
          >
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 10.5,
                color: theme.primary,
              }}
            >
              -{discountPercent}%
            </Text>
          </View>
        )}
      </View>

      {/* Note Callout */}
      {msg.metadata?.note ? (
        <View
          style={{
            marginBottom: 10,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: radii.lg,
            backgroundColor: theme.panel,
            borderLeftWidth: 2,
            borderLeftColor: theme.primary,
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 12,
              lineHeight: 16,
              color: theme.ink,
            }}
          >
            {msg.metadata.note}
          </Text>
        </View>
      ) : null}

      {/* Seller Action Buttons for Pending Offer (Minimal AI Pill layout) */}
      {canRespond && (
        <View style={{ gap: 8, marginTop: 2 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PressableScale
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                onDecline();
              }}
              accessibilityLabel="Decline offer"
              style={{
                flex: 1,
                height: 38,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.panel,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 13,
                  color: theme.ink,
                  textAlign: 'center',
                }}
              >
                Decline
              </Text>
            </PressableScale>

            <PressableScale
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                }
                onAccept();
              }}
              accessibilityLabel="Accept offer"
              style={{
                flex: 1,
                height: 38,
                borderRadius: radii.pill,
                backgroundColor: theme.ink,
                alignItems: 'center',
                justifyContent: 'center',
                ...shadow.sm,
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 13,
                  color: theme.panel,
                  textAlign: 'center',
                }}
              >
                Accept
              </Text>
            </PressableScale>
          </View>

          {onCounterOffer && (
            <PressableScale
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                onCounterOffer();
              }}
              accessibilityLabel="Offer your price"
              style={{
                height: 36,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: theme.hairline,
                backgroundColor: 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                alignSelf: 'stretch',
              }}
            >
              <Feather name="refresh-cw" size={11} color={theme.primary} />
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 12.5,
                  color: theme.primary,
                  textAlign: 'center',
                }}
              >
                Counter with new price
              </Text>
            </PressableScale>
          )}
        </View>
      )}

      {/* Counter offer button when declined or expired */}
      {canMakeCounter && (
        <PressableScale
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            onCounterOffer?.();
          }}
          accessibilityLabel="Make a new offer"
          style={{
            height: 38,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: theme.primary,
            backgroundColor: theme.primarySoft,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 4,
            alignSelf: 'stretch',
          }}
        >
          <Feather name="refresh-cw" size={12} color={theme.primary} />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13,
              color: theme.primary,
              textAlign: 'center',
            }}
          >
            Make a new offer
          </Text>
        </PressableScale>
      )}

      {/* Buyer CTA to Complete Purchase */}
      {canPay && (
        <PressableScale
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            onPay(amount, msg.metadata?.bundle_item_ids);
          }}
          accessibilityLabel={`Buy now for ${formatPrice(amount)}`}
          style={{
            height: 42,
            borderRadius: radii.pill,
            backgroundColor: theme.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 4,
            alignSelf: 'stretch',
            ...shadow.sm,
          }}
        >
          <Feather name="credit-card" size={14} color="#FFFFFF" />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13.5,
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            Buy now · Pay {formatPrice(amount)}
          </Text>
        </PressableScale>
      )}

      {/* Awaiting buyer checkout notice */}
      {awaitingPayment && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <Feather name="clock" size={12} color={theme.muteSoft} />
          <Text
            style={{
              fontFamily: typography.family.sansMedium,
              fontSize: 12,
              color: theme.muteSoft,
            }}
          >
            Waiting for buyer to complete checkout
          </Text>
        </View>
      )}

      {/* Paid confirmation */}
      {isPaid && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <Feather name="shield" size={12} color="#10B981" />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 12,
              color: '#10B981',
            }}
          >
            Paid · Protected by Buyer Protection 🛡️
          </Text>
        </View>
      )}
    </View>
  );
}

function OfferBubble(
  props: Omit<
    MessageRowProps,
    'grouped' | 'lastOfGroup' | 'onRetry' | 'reactions' | 'onLongPress'
  >,
) {
  const {
    msg,
    mine,
    isSeller,
    senderName,
    listingId,
    listingPrice,
    listingSold,
    onAccept,
    onDecline,
    onCounterOffer,
    onPay,
  } = props;
  const status = msg.offer_status ?? 'pending';
  const isPaid = Boolean(
    msg.metadata?.paid ||
    msg.metadata?.order_status === 'paid' ||
    msg.metadata?.payment_status === 'paid'
  );
  const canRespond = !mine && isSeller && status === 'pending';
  const canPay = !isSeller && status === 'accepted' && !!listingId && !listingSold && !isPaid;
  const awaitingPayment = isSeller && status === 'accepted' && !listingSold && !isPaid;

  if (mine) {
    return (
      <OutgoingOfferBubble
        msg={msg}
        listingPrice={listingPrice}
        canPay={canPay}
        onPay={onPay}
      />
    );
  }

  return (
    <IncomingOfferCard
      msg={msg}
      senderName={senderName}
      listingPrice={listingPrice}
      listingSold={listingSold}
      isSeller={isSeller}
      canRespond={canRespond}
      canPay={canPay}
      awaitingPayment={awaitingPayment}
      isPaid={isPaid}
      onAccept={onAccept}
      onDecline={onDecline}
      onCounterOffer={onCounterOffer}
      onPay={onPay}
    />
  );
}

// ── Text ──────────────────────────────────────────────────────────────────

function TextBubble({
  msg,
  mine,
  grouped,
  lastOfGroup,
}: Pick<MessageRowProps, 'msg' | 'mine' | 'grouped' | 'lastOfGroup'>) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: mine ? theme.purple : theme.panel,
        borderWidth: mine ? 0 : 1,
        borderColor: theme.border,
        opacity: msg.pending ? 0.65 : 1,
        borderRadius: BUBBLE_RADIUS,
        // The tail sits on the sender's own side: tightened at the bottom of a
        // run, and at the top of any bubble continuing one.
        borderTopRightRadius: mine && grouped ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderTopLeftRadius: !mine && grouped ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderBottomRightRadius: mine && lastOfGroup ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderBottomLeftRadius: !mine && lastOfGroup ? TAIL_RADIUS : BUBBLE_RADIUS,
        alignSelf: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 15,
          lineHeight: 21,
          color: mine ? '#FFFFFF' : theme.ink,
          ...(Platform.OS === 'web'
            ? ({
                wordBreak: 'normal',
                overflowWrap: 'break-word',
                wordWrap: 'break-word',
              } as any)
            : null),
        }}
      >
        {msg.content}
      </Text>
    </View>
  );
}

// ── Reactions ─────────────────────────────────────────────────────────────

/** The chip that rides the bottom edge of a reacted-to bubble, iMessage-style:
 *  it overlaps the corner so it reads as attached to that message and not as a
 *  new row in the thread. */
function ReactionChip({ reactions, mine }: { reactions: string[]; mine: boolean }) {
  const { theme } = useTheme();
  if (reactions.length === 0) return null;

  // Two people, one reaction each — so at most a couple of emoji, and counting
  // duplicates is cheaper than showing the same emoji twice.
  const counts = new Map<string, number>();
  reactions.forEach((e) => counts.set(e, (counts.get(e) ?? 0) + 1));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        alignSelf: mine ? 'flex-end' : 'flex-start',
        marginTop: -9,
        marginRight: mine ? 8 : 0,
        marginLeft: mine ? 0 : 8,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: radii.pill,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      {[...counts.entries()].map(([emoji, count]) => (
        <View key={emoji} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17 }}>{emoji}</Text>
          {count > 1 && (
            <Text
              style={{
                fontFamily: typography.family.sansSemibold,
                fontSize: 11,
                color: theme.mute,
              }}
            >
              {count}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

function MessageRowImpl(props: MessageRowProps) {
  const { theme } = useTheme();
  const { msg, mine, grouped, lastOfGroup, senderName, senderAvatar, reactions, onRetry, onLongPress } = props;
  const bubbleRef = useRef<View>(null);

  // A message that hasn't landed yet has no server id to hang a reaction off.
  const canReact = msg.kind !== 'system' && !msg.pending && !msg.failed;

  const handleLongPress = useCallback(() => {
    if (!canReact) return;
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      // A zero measurement means the row scrolled out from under the press —
      // opening a bar pinned to (0,0) would be worse than doing nothing.
      if (!width && !height) return;
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      onLongPress({ x, y, width, height, mine });
    });
  }, [canReact, mine, onLongPress]);

  if (msg.kind === 'system') return <SystemNotice msg={msg} />;

  return (
    <View
      style={{
        paddingHorizontal: 16,
        marginTop: grouped ? 2 : 10,
        alignItems: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: mine ? 'flex-end' : 'flex-start',
          gap: 8,
          maxWidth: '100%',
        }}
      >
        {!mine && (
          <View style={{ width: 28, height: 28, marginBottom: 2 }}>
            {lastOfGroup ? (
              senderAvatar ? (
                <Image
                  source={{ uri: senderAvatar }}
                  style={{ width: 28, height: 28, borderRadius: 14 }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: theme.panel,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="user" size={15} color={theme.mute} />
                </View>
              )
            ) : null}
          </View>
        )}

        <Pressable
          ref={bubbleRef}
          onLongPress={canReact ? handleLongPress : undefined}
          // Long enough not to fire while someone is scrolling with a finger
          // resting on a bubble, short enough to feel deliberate.
          delayLongPress={320}
          accessibilityRole={canReact ? 'button' : undefined}
          accessibilityLabel={canReact ? 'Message. Long press to react' : undefined}
          style={{
            maxWidth: msg.kind === 'offer' ? (mine ? '86%' : '82%') : '78%',
            alignItems: mine ? 'flex-end' : 'flex-start',
            alignSelf: mine ? 'flex-end' : 'flex-start',
          }}
        >
          {msg.kind === 'offer' ? <OfferBubble {...props} /> : <TextBubble {...props} />}
          <ReactionChip reactions={reactions} mine={mine} />
        </Pressable>
      </View>

      {lastOfGroup && (
        <View style={{ marginLeft: mine ? 0 : 36 }}>
          <MetaLine msg={msg} mine={mine} senderName={senderName} onRetry={onRetry} />
        </View>
      )}
    </View>
  );
}

export const MessageRow = memo(MessageRowImpl);
