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

// ── Offer ─────────────────────────────────────────────────────────────────

const TEAL_BRAND = '#007782';

function OutgoingOfferBubble({
  msg,
  listingPrice,
  canPay,
  onPay,
}: {
  msg: ChatMessage;
  listingPrice: number | null;
  canPay: boolean;
  onPay: (amount: number) => void;
}) {
  const { theme } = useTheme();
  const amount = msg.metadata?.amount ?? 0;
  const status = msg.offer_status ?? 'pending';
  const showStruck = !!listingPrice && listingPrice > amount;
  const isPaid = Boolean(
    msg.metadata?.paid ||
    msg.metadata?.order_status === 'paid' ||
    msg.metadata?.payment_status === 'paid'
  );

  return (
    <View
      style={{
        backgroundColor: theme.panel,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 15,
            fontWeight: '700',
            color: theme.ink,
          }}
        >
          {formatPrice(amount)}
        </Text>
        {showStruck && (
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13,
              color: theme.muteSoft,
              textDecorationLine: 'line-through',
            }}
          >
            {formatPrice(listingPrice)}
          </Text>
        )}
        {status === 'declined' && (
          <Text
            style={{
              fontFamily: typography.family.sansMedium,
              fontSize: 13,
              color: '#EF4444',
              marginLeft: 2,
            }}
          >
            Declined
          </Text>
        )}
        {status === 'accepted' && (
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13,
              color: '#10B981',
              marginLeft: 2,
            }}
          >
            Accepted
          </Text>
        )}
        {status === 'expired' && (
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13,
              color: theme.muteSoft,
              marginLeft: 2,
            }}
          >
            Expired
          </Text>
        )}
      </View>

      {msg.metadata?.note ? (
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 12.5,
            color: theme.mute,
            marginTop: 4,
          }}
        >
          {`"${msg.metadata.note}"`}
        </Text>
      ) : null}

      {canPay && (
        <PressableScale
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            onPay(amount);
          }}
          accessibilityLabel={`Pay ${formatPrice(amount)}`}
          style={{
            marginTop: 8,
            height: 38,
            borderRadius: 6,
            backgroundColor: TEAL_BRAND,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 12,
            alignSelf: 'stretch',
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13,
              fontWeight: '700',
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            Buy now · Pay {formatPrice(amount)}
          </Text>
        </PressableScale>
      )}

      {isPaid && (
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 11.5,
            color: TEAL_BRAND,
            marginTop: 4,
          }}
        >
          Paid · Protected 🛡️
        </Text>
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
  onPay: (amount: number) => void;
}) {
  const { theme } = useTheme();
  const amount = msg.metadata?.amount ?? 0;
  const status = msg.offer_status ?? 'pending';
  const showStruck = !!listingPrice && listingPrice > amount;
  const isDeclined = status === 'declined';
  const isAccepted = status === 'accepted';
  const isExpired = status === 'expired';
  const canMakeCounter = (isDeclined || isExpired) && !listingSold && !!onCounterOffer;

  return (
    <View
      style={{
        minWidth: 240,
        maxWidth: 320,
        backgroundColor: theme.white,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        padding: 14,
        ...shadow.sm,
      }}
    >
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 13.5,
          color: theme.mute,
          marginBottom: 4,
        }}
      >
        {senderName} made you a new offer:
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: canRespond || canPay || canMakeCounter || awaitingPayment || isPaid ? 10 : 0,
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 16,
            fontWeight: '700',
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
        {isDeclined && (
          <Text
            style={{
              fontFamily: typography.family.sansMedium,
              fontSize: 13.5,
              color: '#EF4444',
              marginLeft: 2,
            }}
          >
            Declined
          </Text>
        )}
        {isAccepted && (
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13.5,
              color: '#10B981',
              marginLeft: 2,
            }}
          >
            Accepted
          </Text>
        )}
        {isExpired && (
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13.5,
              color: theme.muteSoft,
              marginLeft: 2,
            }}
          >
            Expired
          </Text>
        )}
      </View>

      {msg.metadata?.note ? (
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 12.5,
            color: theme.mute,
            marginBottom: 8,
          }}
        >
          {`"${msg.metadata.note}"`}
        </Text>
      ) : null}

      {/* Seller Action Buttons for Pending Offer */}
      {canRespond && (
        <View style={{ gap: 8, marginTop: 4 }}>
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
                borderRadius: 6,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 13,
                  fontWeight: '700',
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
                borderRadius: 6,
                backgroundColor: TEAL_BRAND,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 13,
                  fontWeight: '700',
                  color: '#FFFFFF',
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
                height: 38,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: TEAL_BRAND,
                backgroundColor: 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 13,
                  fontWeight: '700',
                  color: TEAL_BRAND,
                  textAlign: 'center',
                }}
              >
                Offer your price
              </Text>
            </PressableScale>
          )}
        </View>
      )}

      {/* Offer your price button when declined or counterable */}
      {canMakeCounter && (
        <PressableScale
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            onCounterOffer?.();
          }}
          accessibilityLabel="Offer your price"
          style={{
            height: 40,
            borderRadius: 6,
            backgroundColor: TEAL_BRAND,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 4,
            alignSelf: 'stretch',
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13.5,
              fontWeight: '700',
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            Offer your price
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
            onPay(amount);
          }}
          accessibilityLabel={`Buy now for ${formatPrice(amount)}`}
          style={{
            height: 42,
            borderRadius: 6,
            backgroundColor: TEAL_BRAND,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 4,
            alignSelf: 'stretch',
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13.5,
              fontWeight: '700',
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
        <Text
          style={{
            fontFamily: typography.family.sansMedium,
            fontSize: 12,
            color: theme.muteSoft,
            marginTop: 4,
          }}
        >
          Waiting for buyer to complete checkout
        </Text>
      )}

      {/* Paid confirmation */}
      {isPaid && (
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 12,
            color: TEAL_BRAND,
            marginTop: 4,
          }}
        >
          Paid · Covered by Buyer Protection 🛡️
        </Text>
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
