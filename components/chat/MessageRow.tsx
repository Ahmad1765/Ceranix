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
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '@/components/PressableScale';
import { colors, radii, shadow, type as typography } from '@/lib/theme';
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
  listingId: string | null;
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
}: Omit<
  MessageRowProps,
  'grouped' | 'lastOfGroup' | 'senderName' | 'onRetry' | 'reactions' | 'onLongPress'
>) {
  const amount = msg.metadata?.amount ?? 0;
  const status = msg.offer_status ?? 'pending';
  const canRespond = !mine && isSeller && status === 'pending';
  const canPay = mine && !isSeller && status === 'accepted' && !!listingId && !listingSold;
  const awaitingPayment = !mine && isSeller && status === 'accepted' && !listingSold;
  const settled = status !== 'pending' ? OFFER_STATUS_COPY[status] : null;
  const showStruck = !!listingPrice && listingPrice > amount;
  const discountPct =
    showStruck && listingPrice
      ? Math.max(1, Math.round(((listingPrice - amount) / listingPrice) * 100))
      : 0;

  const isAccepted = status === 'accepted';
  const isDeclined = status === 'declined';

  return (
    <View
      style={{
        minWidth: 232,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: isAccepted
          ? 'rgba(16,185,129,0.30)'
          : isDeclined
          ? 'rgba(239,68,68,0.25)'
          : 'rgba(108,71,255,0.18)',
        borderRadius: 20,
        padding: 15,
        ...shadow.sm,
      }}
    >
      {/* ── Top Header: Badge + Status ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 8,
            paddingVertical: 3.5,
            borderRadius: radii.pill,
            backgroundColor: isAccepted
              ? 'rgba(16,185,129,0.10)'
              : colors.purpleSoft,
          }}
        >
          <Feather
            name={isAccepted ? 'check' : mine ? 'arrow-up-right' : 'tag'}
            size={11}
            color={isAccepted ? '#059669' : colors.purple}
          />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 10.5,
              letterSpacing: 0.5,
              color: isAccepted ? '#059669' : colors.purple,
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
              paddingHorizontal: 7,
              paddingVertical: 2.5,
              borderRadius: radii.pill,
              backgroundColor: isAccepted
                ? 'rgba(16,185,129,0.12)'
                : isDeclined
                ? 'rgba(239,68,68,0.10)'
                : colors.panel,
            }}
          >
            <Feather
              name={settled.icon}
              size={11}
              color={
                isAccepted
                  ? '#059669'
                  : isDeclined
                  ? '#DC2626'
                  : colors.muteSoft
              }
            />
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 10.5,
                color:
                  isAccepted
                    ? '#059669'
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
              gap: 4,
              paddingHorizontal: 7,
              paddingVertical: 2.5,
              borderRadius: radii.pill,
              backgroundColor: colors.panel,
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: colors.purple,
              }}
            />
            <Text
              style={{
                fontFamily: typography.family.sansSemibold,
                fontSize: 10.5,
                color: colors.mute,
              }}
            >
              Pending
            </Text>
          </View>
        )}
      </View>

      {/* ── Hero Price Container ── */}
      <View
        style={{
          backgroundColor: colors.panel,
          borderRadius: radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: colors.hairline,
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sansSemibold,
            fontSize: 10.5,
            color: colors.muteSoft,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Offered Price
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 7,
            marginTop: 2,
            flexWrap: 'wrap',
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 21,
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
                fontSize: 12.5,
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
                backgroundColor: 'rgba(108,71,255,0.12)',
                paddingHorizontal: 5.5,
                paddingVertical: 1.5,
                borderRadius: 5,
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 10.5,
                  color: colors.purple,
                }}
              >
                −{discountPct}%
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Optional Note ── */}
      {msg.metadata?.note ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 6,
            marginTop: 8,
            paddingHorizontal: 10,
            paddingVertical: 7,
            backgroundColor: 'rgba(15,15,15,0.02)',
            borderRadius: radii.sm,
            borderLeftWidth: 2.5,
            borderLeftColor: colors.purple,
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 12.5,
              lineHeight: 17,
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
              flex: 1.2,
              height: 38,
              borderRadius: radii.pill,
              backgroundColor: colors.purple,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              ...shadow.sm,
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

      {/* ── CTA for Buyer to Pay ── */}
      {canPay && (
        <PressableScale
          onPress={() => onPay(amount)}
          accessibilityLabel={`Pay ${formatPrice(amount)}`}
          style={{
            marginTop: 12,
            height: 42,
            borderRadius: radii.pill,
            backgroundColor: colors.purple,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            ...shadow.sm,
          }}
        >
          <Feather name="credit-card" size={15} color={colors.white} />
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

      {/* ── Status Footers ── */}
      {awaitingPayment && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginTop: 9,
            paddingVertical: 2,
          }}
        >
          <Feather name="clock" size={11.5} color={colors.muteSoft} />
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 11,
              color: colors.muteSoft,
            }}
          >
            Waiting for buyer to complete payment
          </Text>
        </View>
      )}

      {status === 'accepted' && listingSold && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginTop: 9,
            paddingVertical: 2,
          }}
        >
          <Feather name="shield" size={12} color="#059669" />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 11,
              color: '#059669',
            }}
          >
            Paid · Covered by Buyer Protection
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
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.hairline,
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
