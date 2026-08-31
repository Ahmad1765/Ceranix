// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION SCREEN (CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Container vs. Presentational Component Pattern
//
// 1. Separation of Concerns:
//    This screen acts purely as a "Container / Coordinator":
//    - It manages route parameters (`useLocalSearchParams`).
//    - It coordinates custom hooks (`useConversationThread`, `useConversationBlock`).
//    - It delegates rendering to focused subcomponents (`ThreadHeader`, `MessageRow`,
//      `ConversationListingHeader`, `ConversationBlockedBanner`, `ConversationActionSheets`).
//
// 2. High Cohesion & Low Coupling:
//    WebSocket lifecycles, message reconciliation, and blocking workflows are no longer
//    tangled inside UI render trees. They are self-contained, easily testable hooks.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Text } from '@/lib/rnText';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { EmptyState, SafeContainer } from '@/components/ui';
import { explainCoverage } from '@/components/SafetyBanner';
import { HIT_SLOP_8 } from '@/lib/responsive';
import {
  type Anchor,
  type ChatAction,
  type MessageAction,
  type ThreadRow,
  Composer,
  ConversationActionSheets,
  ConversationBlockedBanner,
  ConversationListingHeader,
  DateDivider,
  MessageRow,
  ReactionPicker,
  SafetyNote,
  SellerIntroBubble,
  ThreadHeader,
  useConversationBlock,
  useConversationThread,
} from '@/components/chat';

/** Breathing room under composer when software keyboard is up */
const DOCK_GAP_KEYBOARD = 6;
const EMPTY_REACTIONS: string[] = [];

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === 'string' ? id : '';
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();

  // ── Custom Domain Hooks ──────────────────────────────────────────────────
  const thread = useConversationThread(conversationId, user);
  const block = useConversationBlock(user, thread.other);

  // ── Sheet & Context Menu Visibility States ───────────────────────────────
  const [pressed, setPressed] = useState<{ msg: any; anchor: Anchor } | null>(null);
  const [offerVisible, setOfferVisible] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // ── Navigation & Clipboard Helpers ───────────────────────────────────────
  const openListing = useCallback(() => {
    if (thread.convListingId) router.push(`/product/${thread.convListingId}` as any);
  }, [thread.convListingId]);

  const handleCopy = useCallback(async () => {
    const msg = pressed?.msg;
    if (!msg) return;
    const text =
      msg.kind === 'offer' && msg.metadata?.amount
        ? formatPrice(msg.metadata.amount)
        : msg.content;
    await Clipboard.setStringAsync(text);
    toast.show('Copied', { variant: 'success', icon: 'check' });
  }, [pressed?.msg, toast]);

  const messageActions: MessageAction[] = useMemo(
    () => [{ id: 'copy', label: 'Copy', icon: 'copy', onPress: handleCopy }],
    [handleCopy],
  );

  // ── Context Action Sheets Menus ──────────────────────────────────────────
  const plusActions: ChatAction[] = useMemo(
    () => [
      ...(thread.canOffer
        ? [
            {
              id: 'offer',
              label: 'Make an offer',
              hint: thread.convListingPrice ? `Listed at ${formatPrice(thread.convListingPrice)}` : undefined,
              icon: 'tag' as const,
              tone: 'primary' as const,
              onPress: () => setOfferVisible(true),
            },
          ]
        : []),
      ...(thread.convListingId
        ? [
            {
              id: 'listing',
              label: 'View listing',
              icon: 'external-link' as const,
              onPress: openListing,
            },
          ]
        : []),
      {
        id: 'coverage',
        label: "How you're covered",
        hint: 'Buyer Protection, payments, and support',
        icon: 'shield' as const,
        onPress: explainCoverage,
      },
    ],
    [thread.canOffer, thread.convListingPrice, thread.convListingId, openListing],
  );

  const overflowActions: ChatAction[] = useMemo(
    () => [
      ...(thread.other?.id
        ? [
            {
              id: 'profile',
              label: 'View profile',
              icon: 'user' as const,
              onPress: () => router.push(`/user/${thread.other!.id}` as any),
            },
          ]
        : []),
      ...(thread.convListingId
        ? [
            {
              id: 'listing',
              label: 'View listing',
              icon: 'external-link' as const,
              onPress: openListing,
            },
          ]
        : []),
      {
        id: 'coverage',
        label: "How you're covered",
        icon: 'shield' as const,
        onPress: explainCoverage,
      },
      ...(thread.convListingId
        ? [
            {
              id: 'report',
              label: 'Report this conversation',
              icon: 'flag' as const,
              onPress: () => setReportOpen(true),
            },
          ]
        : []),
      ...(thread.other?.id
        ? [
            {
              id: 'block',
              label: block.isBlocked
                ? `Unblock ${thread.other.username ? `@${thread.other.username}` : 'user'}`
                : `Block ${thread.other.username ? `@${thread.other.username}` : 'user'}`,
              hint: block.isBlocked ? 'Allow messages from this user' : 'Prevent messages and interaction',
              icon: 'slash' as const,
              tone: block.isBlocked ? ('default' as const) : ('destructive' as const),
              onPress: block.handleToggleBlock,
            },
          ]
        : []),
    ],
    [thread.other, thread.convListingId, openListing, block.isBlocked, block.handleToggleBlock],
  );

  // ── Message Thread Row Renderer ──────────────────────────────────────────
  const renderRow = useCallback(
    ({ item }: { item: ThreadRow }) => {
      if (item.type === 'date') return <DateDivider iso={item.iso} />;
      return (
        <MessageRow
          msg={item.msg}
          mine={!!user && item.msg.sender_id === user.id}
          isSeller={thread.isSeller}
          grouped={item.grouped}
          lastOfGroup={item.lastOfGroup}
          senderName={thread.senderName}
          senderAvatar={thread.otherAvatar}
          listingId={thread.convListingId}
          listingTitle={thread.conv?.listing?.title ?? null}
          listingThumb={thread.listingThumb}
          listingPrice={thread.convListingPrice}
          listingSold={thread.convListingSold}
          reactions={thread.byMessage.get(item.msg.id) ?? EMPTY_REACTIONS}
          onAccept={() => thread.handleOfferResponse(item.msg, 'accepted')}
          onDecline={() => thread.handleOfferResponse(item.msg, 'declined')}
          onCounterOffer={() => setOfferVisible(true)}
          onPay={(amount) =>
            thread.convListingId &&
            router.push(`/payment/${thread.convListingId}?offer=${amount}` as any)
          }
          onRetry={() => thread.handleRetry(item.msg)}
          onLongPress={(anchor) => setPressed({ msg: item.msg, anchor })}
        />
      );
    },
    [user, thread],
  );

  // ── Loading & Empty Fallbacks ────────────────────────────────────────────
  if (thread.loading) {
    return (
      <SafeContainer edges={['top', 'left', 'right']} backgroundColor={theme.background} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeContainer>
    );
  }

  if (!thread.conv) {
    return (
      <SafeContainer edges={['top', 'left', 'right']} backgroundColor={theme.background} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </Pressable>
        </View>
        <EmptyState
          icon="alert-circle"
          title="Conversation unavailable"
          description="This thread may have been removed."
        />
      </SafeContainer>
    );
  }

  return (
    <SafeContainer
      mode="keyboard-avoiding"
      noScroll
      edges={['top', 'left', 'right']}
      backgroundColor={theme.background}
      style={{ flex: 1 }}
    >
      {/* Floating Header — absolutely positioned like the product page */}
      <LinearGradient
        colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
        locations={[0, 0.6, 1]}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          borderBottomWidth: 0,
        }}
        pointerEvents="box-none"
      >
        <ThreadHeader
          name={thread.senderName}
          subtitle={thread.other?.username ? `@${thread.other.username}` : null}
          avatar={thread.otherAvatar}
          onBack={() => safeBack()}
          onPressIdentity={thread.other?.id ? () => router.push(`/user/${thread.other!.id}` as any) : undefined}
          onOverflow={() => setOverflowOpen(true)}
        />
      </LinearGradient>

      {/* Message Thread FlatList */}
      <FlatList
        ref={thread.listRef}
        data={thread.rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingBottom: (thread.convListingId ? 140 : 80) + (keyboardUp ? DOCK_GAP_KEYBOARD : Math.max(insets.bottom, 12)),
          paddingTop: 64,
        }}
        onContentSizeChange={thread.followEnd}
        onScroll={thread.onScroll}
        scrollEventThrottle={16}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <SafetyNote onPress={explainCoverage} />
            {thread.other?.username ? (
              <SellerIntroBubble
                name={thread.other.username}
                location={(thread.other as any).location ?? null}
                lastSeen={null}
                rating={(thread.other as any).rating ? Number((thread.other as any).rating).toFixed(1) : null}
                reviewCount={(thread.other as any).total_sales ?? (thread.other as any).reviews_count ?? null}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 32, paddingVertical: 16 }}>
            <Text
              style={{
                fontFamily: typography.family.sans,
                fontSize: 13,
                color: theme.muteSoft,
                textAlign: 'center',
              }}
            >
              No messages yet. Ask a question, or send an offer.
            </Text>
          </View>
        }
      />

      {/* Floating Bottom Composer / Block Banner Dock */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          backgroundColor: 'transparent',
          paddingBottom: keyboardUp ? DOCK_GAP_KEYBOARD : Math.max(insets.bottom, 12),
        }}
        pointerEvents="box-none"
      >
        {/* Listing Header — floating card docked above the composer */}
        <ConversationListingHeader
          listing={thread.conv.listing}
          listingId={thread.convListingId}
          listingThumb={thread.listingThumb}
          status={thread.status}
          isSeller={thread.isSeller}
          onPressListing={openListing}
          onPressBuyNow={() => router.push(`/payment/${thread.convListingId}` as any)}
        />

        {block.blockStatus === 'unblocked' ? (
          <Composer
            value={thread.input}
            onChangeText={thread.setInput}
            onSend={thread.handleSend}
            onPlus={() => setPlusOpen(true)}
          />
        ) : (
          <ConversationBlockedBanner
            blockStatus={block.blockStatus}
            onUnblock={block.handleToggleBlock}
          />
        )}
      </View>

      {/* Pop-up Reaction Picker */}
      <ReactionPicker
        anchor={pressed?.anchor ?? null}
        selected={pressed ? thread.myReactionOn(pressed.msg.id) : null}
        actions={messageActions}
        onSelect={(emoji) => {
          if (pressed?.msg?.id) thread.handleReact(pressed.msg.id, emoji);
          setPressed(null);
        }}
        onClose={() => setPressed(null)}
      />

      {/* Overlays & Action Sheets */}
      <ConversationActionSheets
        plusOpen={plusOpen}
        plusActions={plusActions}
        onClosePlus={() => setPlusOpen(false)}
        overflowOpen={overflowOpen}
        overflowActions={overflowActions}
        onCloseOverflow={() => setOverflowOpen(false)}
        reportOpen={reportOpen}
        onCloseReport={() => setReportOpen(false)}
        onSelectReportReason={thread.handleReport}
        blockSheetOpen={block.blockSheetOpen}
        onCloseBlockSheet={() => block.setBlockSheetOpen(false)}
        onSelectBlockReason={block.handleBlockWithReason}
        offerVisible={offerVisible}
        listingPrice={thread.convListingPrice}
        listingTitle={thread.conv?.listing?.title}
        listingThumb={thread.listingThumb}
        onCloseOffer={() => setOfferVisible(false)}
        onSubmitOffer={async (amount) => {
          const success = await thread.handleSendOffer(amount, '');
          if (success) setOfferVisible(false);
        }}
      />
    </SafeContainer>
  );
}
