// One row in a conversation thread: a text bubble, an offer, or a system
// notice. Grouping-aware — a run of messages from the same sender collapses
// into one visual block with a single tail and a single meta line.
//
// The meta (time, sender, delivery state) lives OUTSIDE the bubble. That's the
// Plick move and it's the right one: the bubble stays a clean container for
// what was actually said, and the metadata reads as a consistent muted column
// down each side instead of as chrome inside every message.

import { memo } from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '@/components/PressableScale';
import { colors, radii, type as typography } from '@/lib/theme';
import { formatPrice } from '@/lib/currency';
import type { ChatMessage } from '@/lib/chat';
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
  listingId: string | null;
  listingPrice: number | null;
  listingSold: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onPay: (amount: number) => void;
  onRetry: () => void;
};

// ── Meta line ─────────────────────────────────────────────────────────────

function MetaLine({
  msg,
  mine,
  senderName,
  onRetry,
}: Pick<MessageRowProps, 'msg' | 'mine' | 'senderName' | 'onRetry'>) {
  const base = {
    fontFamily: typography.family.sans,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muteSoft,
  } as const;

  if (mine && msg.failed) {
    return (
      <PressableScale
        onPress={onRetry}
        accessibilityLabel="Retry sending message"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}
      >
        <Feather name="rotate-cw" size={10} color={colors.ink} />
        <Text style={{ ...base, fontFamily: typography.family.sansSemibold, color: colors.ink }}>
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
        marginTop: 5,
        paddingHorizontal: 2,
      }}
    >
      <Text style={base}>
        {msg.pending ? 'Sending…' : bubbleStamp(msg.created_at)}
        {!mine && senderName ? `  ${senderName}` : ''}
      </Text>
      {mine && !msg.pending && <Feather name="check" size={11} color={colors.muteSoft} />}
    </View>
  );
}

// ── System notice ─────────────────────────────────────────────────────────

function SystemNotice({ msg }: { msg: ChatMessage }) {
  return (
    <View style={{ paddingHorizontal: 40, marginVertical: 12 }}>
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 12,
          lineHeight: 17,
          color: colors.muteSoft,
          textAlign: 'center',
        }}
      >
        {msg.content}
      </Text>
    </View>
  );
}

// ── Offer ─────────────────────────────────────────────────────────────────

const OFFER_STATUS_COPY: Record<string, { label: string; icon: keyof typeof Feather.glyphMap }> = {
  accepted: { label: 'Accepted', icon: 'check-circle' },
  declined: { label: 'Declined', icon: 'x-circle' },
  expired: { label: 'Expired', icon: 'clock' },
  withdrawn: { label: 'Withdrawn', icon: 'corner-up-left' },
};

function OfferBubble({
  msg,
  mine,
  isSeller,
  listingId,
  listingPrice,
  listingSold,
  onAccept,
  onDecline,
  onPay,
}: Omit<MessageRowProps, 'grouped' | 'lastOfGroup' | 'senderName' | 'onRetry'>) {
  const amount = msg.metadata?.amount ?? 0;
  const status = msg.offer_status ?? 'pending';
  const canRespond = !mine && isSeller && status === 'pending';
  // The buyer keeps a Pay CTA on their own accepted offer until the listing is
  // marked sold; the seller sees the passive counterpart.
  const canPay = mine && !isSeller && status === 'accepted' && !!listingId && !listingSold;
  const awaitingPayment = !mine && isSeller && status === 'accepted' && !listingSold;
  const settled = status !== 'pending' ? OFFER_STATUS_COPY[status] : null;
  const showStruck = !!listingPrice && listingPrice > amount;

  return (
    <View
      style={{
        maxWidth: '86%',
        minWidth: 172,
        backgroundColor: colors.primarySoft,
        borderWidth: 1,
        borderColor: colors.primarySofter,
        borderRadius: BUBBLE_RADIUS,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Text
        style={{
          fontFamily: typography.family.sansBold,
          fontSize: 12.5,
          letterSpacing: -0.1,
          color: colors.ink,
        }}
      >
        {mine ? 'Offer sent' : 'Offer received'}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 19,
            letterSpacing: -0.4,
            color: colors.ink,
          }}
        >
          {formatPrice(amount)}
        </Text>
        {showStruck && (
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13,
              color: colors.muteSoft,
              textDecorationLine: 'line-through',
            }}
          >
            {formatPrice(listingPrice)}
          </Text>
        )}
      </View>

      {msg.metadata?.note ? (
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 13.5,
            lineHeight: 19,
            color: colors.mute,
            marginTop: 6,
          }}
        >
          {msg.metadata.note}
        </Text>
      ) : null}

      {settled && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Feather
            name={settled.icon}
            size={12}
            color={status === 'accepted' ? colors.primary : colors.muteSoft}
          />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 11.5,
              color: status === 'accepted' ? colors.primary : colors.muteSoft,
            }}
          >
            {settled.label}
          </Text>
        </View>
      )}

      {canRespond && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <PressableScale
            onPress={onDecline}
            accessibilityLabel="Decline offer"
            style={{
              flex: 1,
              height: 38,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.hairline,
              backgroundColor: colors.white,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 13,
                color: colors.ink,
              }}
            >
              Decline
            </Text>
          </PressableScale>
          <PressableScale
            onPress={onAccept}
            accessibilityLabel="Accept offer"
            style={{
              flex: 1,
              height: 38,
              borderRadius: radii.pill,
              backgroundColor: colors.ink,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <Feather name="check" size={14} color={colors.white} />
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 13,
                color: colors.white,
              }}
            >
              Accept
            </Text>
          </PressableScale>
        </View>
      )}

      {canPay && (
        <PressableScale
          onPress={() => onPay(amount)}
          accessibilityLabel={`Pay ${formatPrice(amount)}`}
          style={{
            marginTop: 12,
            height: 40,
            borderRadius: radii.pill,
            backgroundColor: colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Feather name="credit-card" size={14} color={colors.white} />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13.5,
              color: colors.white,
            }}
          >
            Pay {formatPrice(amount)}
          </Text>
        </PressableScale>
      )}

      {awaitingPayment && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Feather name="clock" size={12} color={colors.muteSoft} />
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 11.5,
              color: colors.muteSoft,
            }}
          >
            Waiting for the buyer to pay
          </Text>
        </View>
      )}

      {status === 'accepted' && listingSold && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Feather name="shield" size={12} color={colors.primary} />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 11.5,
              color: colors.primary,
            }}
          >
            Paid · covered by Buyer Protection
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Text ──────────────────────────────────────────────────────────────────

function TextBubble({
  msg,
  mine,
  grouped,
  lastOfGroup,
}: Pick<MessageRowProps, 'msg' | 'mine' | 'grouped' | 'lastOfGroup'>) {
  return (
    <View
      style={{
        maxWidth: '78%',
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: mine ? colors.primary : colors.white,
        borderWidth: mine ? 0 : 1,
        borderColor: colors.hairline,
        opacity: msg.pending ? 0.65 : 1,
        borderRadius: BUBBLE_RADIUS,
        // The tail sits on the sender's own side: tightened at the bottom of a
        // run, and at the top of any bubble continuing one.
        borderTopRightRadius: mine && grouped ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderTopLeftRadius: !mine && grouped ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderBottomRightRadius: mine && lastOfGroup ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderBottomLeftRadius: !mine && lastOfGroup ? TAIL_RADIUS : BUBBLE_RADIUS,
      }}
    >
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 15,
          lineHeight: 21,
          color: mine ? colors.white : colors.ink,
        }}
      >
        {msg.content}
      </Text>
    </View>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

function MessageRowImpl(props: MessageRowProps) {
  const { msg, mine, grouped, lastOfGroup, senderName, onRetry } = props;

  if (msg.kind === 'system') return <SystemNotice msg={msg} />;

  return (
    <View
      style={{
        paddingHorizontal: 16,
        marginTop: grouped ? 2 : 12,
        alignItems: mine ? 'flex-end' : 'flex-start',
      }}
    >
      {msg.kind === 'offer' ? <OfferBubble {...props} /> : <TextBubble {...props} />}
      {lastOfGroup && (
        <MetaLine msg={msg} mine={mine} senderName={senderName} onRetry={onRetry} />
      )}
    </View>
  );
}

export const MessageRow = memo(MessageRowImpl);
