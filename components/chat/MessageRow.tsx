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
import { colors, radii, shadow, type as typography } from '@/lib/theme';
import { formatPrice } from '@/lib/currency';
import { buyerProtectionFee } from '@/lib/fees';
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
  listingId: string | null;
  listingTitle?: string | null;
  listingThumb?: string | null;
  listingPrice: number | null;
  listingSold: boolean;
  /** Every emoji on this message, in arrival order. */
  reactions: string[];
  onAccept: () => void;
  onDecline: () => void;
  onPay: (amount: number) => void;
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

function SystemNotice({ msg }: { msg: ChatMessage }) {
  if (msg.metadata?.paid === true) {
    return (
      <View style={{ paddingHorizontal: 16, marginVertical: 12 }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            padding: 14,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 14.5,
              fontWeight: '700',
              color: '#111111',
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
              color: '#4B5563',
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
  listingTitle,
  listingThumb,
  listingPrice,
  listingSold,
  onAccept,
  onDecline,
  onPay,
}: Omit<
  MessageRowProps,
  'grouped' | 'lastOfGroup' | 'senderName' | 'onRetry' | 'reactions' | 'onLongPress'
>) {
  const amount = msg.metadata?.amount ?? 0;
  const status = msg.offer_status ?? 'pending';
  const isPaid = Boolean(
    msg.metadata?.paid ||
    msg.metadata?.order_status === 'paid' ||
    msg.metadata?.payment_status === 'paid'
  );
  const canRespond = !mine && isSeller && status === 'pending';
  const canPay = mine && !isSeller && status === 'accepted' && !!listingId && !listingSold && !isPaid;
  const awaitingPayment = !mine && isSeller && status === 'accepted' && !listingSold && !isPaid;
  const settled = status !== 'pending' ? OFFER_STATUS_COPY[status] : null;
  const showStruck = !!listingPrice && listingPrice > amount;
  const savingsAmount = showStruck && listingPrice ? listingPrice - amount : 0;
  const discountPct =
    showStruck && listingPrice
      ? Math.round(((listingPrice - amount) / listingPrice) * 100)
      : 0;

  const isAccepted = status === 'accepted';
  const isDeclined = status === 'declined';
  const fee = buyerProtectionFee(amount);

  return (
    <View
      style={{
        minWidth: 260,
        maxWidth: 320,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: isAccepted
          ? 'rgba(108,71,255,0.35)'
          : isDeclined
          ? 'rgba(239,68,68,0.25)'
          : colors.border,
        borderRadius: radii['2xl'],
        padding: 16,
        ...shadow.sm,
      }}
    >
      {/* ── Top Header: Directional Tag + Status ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: radii.pill,
            backgroundColor: isAccepted ? colors.purpleSoft : colors.surface,
          }}
        >
          <Feather
            name={isAccepted ? 'check' : mine ? 'arrow-up-right' : 'arrow-down-left'}
            size={11.5}
            color={isAccepted ? colors.purple : colors.ink}
          />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 10.5,
              fontWeight: '700',
              letterSpacing: 0.6,
              color: isAccepted ? colors.purple : colors.ink,
              textTransform: 'uppercase',
            }}
          >
            {mine ? 'Offer sent' : 'Offer received'}
          </Text>
        </View>

        {settled ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: radii.pill,
              backgroundColor: isAccepted
                ? colors.purpleSoft
                : isDeclined
                ? 'rgba(239,68,68,0.10)'
                : colors.surface,
            }}
          >
            <Feather
              name={settled.icon}
              size={11.5}
              color={
                isAccepted
                  ? colors.purple
                  : isDeclined
                  ? '#DC2626'
                  : colors.muteSoft
              }
            />
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 11,
                fontWeight: '700',
                color:
                  isAccepted
                    ? colors.purple
                    : isDeclined
                    ? '#DC2626'
                    : colors.muteSoft,
              }}
            >
              {settled.label}
            </Text>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: radii.pill,
              backgroundColor: colors.surface,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.purple,
              }}
            />
            <Text
              style={{
                fontFamily: typography.family.sansSemibold,
                fontSize: 11,
                fontWeight: '600',
                color: colors.mute,
              }}
            >
              Pending
            </Text>
          </View>
        )}
      </View>

      {/* ── Product Context Snippet (if available) ── */}
      {listingTitle ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingBottom: 12,
            marginBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
          }}
        >
          {listingThumb ? (
            <Image
              source={{ uri: listingThumb }}
              style={{
                width: 38,
                height: 38,
                borderRadius: radii.md,
                backgroundColor: colors.surface,
              }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radii.md,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="tag" size={16} color={colors.mute} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 13,
                color: colors.ink,
                letterSpacing: -0.1,
              }}
            >
              {listingTitle}
            </Text>
            {listingPrice != null && (
              <Text
                style={{
                  fontFamily: typography.family.sans,
                  fontSize: 11.5,
                  color: colors.muteSoft,
                  marginTop: 1,
                }}
              >
                Listed at {formatPrice(listingPrice)}
              </Text>
            )}
          </View>
        </View>
      ) : null}

      {/* ── Hero Price Container ── */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.xl,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderWidth: 1,
          borderColor: colors.hairline,
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sansSemibold,
            fontSize: 10.5,
            fontWeight: '600',
            color: colors.muteSoft,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          Offered Price
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 8,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 24,
              fontWeight: '700',
              letterSpacing: -0.5,
              color: colors.ink,
            }}
          >
            {formatPrice(amount)}
          </Text>
          {showStruck && (
            <Text
              style={{
                fontFamily: typography.family.sans,
                fontSize: 13.5,
                color: colors.muteSoft,
                textDecorationLine: 'line-through',
              }}
            >
              {formatPrice(listingPrice)}
            </Text>
          )}
          {discountPct > 0 && (
            <View
              style={{
                backgroundColor: colors.purpleSoft,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: radii.sm,
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.purple,
                }}
              >
                −{discountPct}% ({formatPrice(savingsAmount)} off)
              </Text>
            </View>
          )}
        </View>

        {/* Protection fee helper line */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginTop: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
          }}
        >
          <Feather name="shield" size={11} color={colors.purple} />
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 11,
              color: colors.mute,
            }}
          >
            Includes {formatPrice(fee)} Buyer Protection
          </Text>
        </View>
      </View>

      {/* ── Optional Note ── */}
      {msg.metadata?.note ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            marginTop: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.surface,
            borderRadius: radii.md,
            borderLeftWidth: 3,
            borderLeftColor: colors.purple,
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13,
              lineHeight: 18,
              color: colors.ink,
              flex: 1,
            }}
          >
            {`"${msg.metadata.note}"`}
          </Text>
        </View>
      ) : null}

      {/* ── Action Buttons for Seller ── */}
      {canRespond && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
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
              height: 42,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 13,
                fontWeight: '700',
                color: colors.ink,
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
              flex: 1.3,
              height: 42,
              borderRadius: radii.pill,
              backgroundColor: colors.purple,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              ...shadow.sm,
            }}
          >
            <Feather name="check" size={14} color="#FFFFFF" />
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 13,
                fontWeight: '700',
                color: '#FFFFFF',
              }}
            >
              Accept
            </Text>
          </PressableScale>
        </View>
      )}

      {/* ── CTA for Buyer to Pay ── */}
      {canPay && (
        <View style={{ marginTop: 14 }}>
          <PressableScale
            onPress={() => {
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              }
              onPay(amount);
            }}
            accessibilityLabel={`Pay ${formatPrice(amount)}`}
            style={{
              height: 48,
              borderRadius: radii.pill,
              backgroundColor: colors.purple,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              ...shadow.sm,
            }}
          >
            <Feather name="credit-card" size={15} color="#FFFFFF" />
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 14,
                fontWeight: '700',
                color: '#FFFFFF',
              }}
            >
              Complete Purchase · Pay {formatPrice(amount)}
            </Text>
          </PressableScale>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              marginTop: 8,
            }}
          >
            <Feather name="shield" size={11} color={colors.purple} />
            <Text
              style={{
                fontFamily: typography.family.sansMedium,
                fontSize: 11,
                color: colors.muteSoft,
              }}
            >
              Escrow Protected · Funds released after delivery
            </Text>
          </View>
        </View>
      )}

      {/* ── Status Footers ── */}
      {awaitingPayment && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 12,
            paddingVertical: 2,
          }}
        >
          <Feather name="clock" size={12} color={colors.muteSoft} />
          <Text
            style={{
              fontFamily: typography.family.sansMedium,
              fontSize: 11.5,
              color: colors.muteSoft,
            }}
          >
            Waiting for buyer to complete checkout
          </Text>
        </View>
      )}

      {status === 'accepted' && isPaid && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 12,
            paddingVertical: 2,
          }}
        >
          <Feather name="shield" size={12.5} color={colors.purple} />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 11.5,
              fontWeight: '700',
              color: colors.purple,
            }}
          >
            Paid · Covered by Buyer Protection 🛡️
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
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: mine ? colors.purple : colors.surface,
        borderWidth: mine ? 0 : 1,
        borderColor: colors.border,
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
          color: mine ? '#FFFFFF' : colors.ink,
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
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
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
                color: colors.mute,
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
  const { msg, mine, grouped, lastOfGroup, senderName, reactions, onRetry, onLongPress } = props;
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
        marginTop: grouped ? 2 : 12,
        alignItems: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <Pressable
        ref={bubbleRef}
        onLongPress={canReact ? handleLongPress : undefined}
        // Long enough not to fire while someone is scrolling with a finger
        // resting on a bubble, short enough to feel deliberate.
        delayLongPress={320}
        accessibilityRole={canReact ? 'button' : undefined}
        accessibilityLabel={canReact ? 'Message. Long press to react' : undefined}
        // No pressed styling: the bubble isn't a button, and flashing it on
        // every tap-through would be noise.
        //
        // The width cap lives here, not on the bubble: this is the outermost
        // node with a definite-width parent, so the percentage has something
        // real to resolve against. On the bubble it resolved against a
        // shrink-wrapped parent, which on web collapses to min-content — one
        // character per line.
        style={{
          maxWidth: msg.kind === 'offer' ? '86%' : '78%',
          alignItems: mine ? 'flex-end' : 'flex-start',
        }}
      >
        {msg.kind === 'offer' ? <OfferBubble {...props} /> : <TextBubble {...props} />}
        <ReactionChip reactions={reactions} mine={mine} />
      </Pressable>
      {lastOfGroup && (
        <MetaLine msg={msg} mine={mine} senderName={senderName} onRetry={onRetry} />
      )}
    </View>
  );
}

export const MessageRow = memo(MessageRowImpl);
