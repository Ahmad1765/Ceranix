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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/lib/rnText';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { uploadListingImages, type LocalImage } from '@/lib/upload';
import { FullscreenImageViewer } from '@/components/product/FullscreenImageViewer';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { confirm } from '@/lib/confirm';
import { isImageMessage } from '@/lib/chat';
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

function useChatKeyboardLayout(containerRef?: React.RefObject<any>) {
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [webViewportHeight, setWebViewportHeight] = useState<number | null>(null);
  const [webViewportOffsetTop, setWebViewportOffsetTop] = useState(0);

  useEffect(() => {
    // 1. Native Keyboard Events (iOS & Android)
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardUp(true);
      const h = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(h);
    });

    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardUp(false);
      setKeyboardHeight(0);
    });

    // 2. Web VisualViewport Events (Mobile Safari / iOS WebKit / Chrome Mobile)
    let cleanupWeb: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const applyDirectStyles = (isUp: boolean, height: number, offsetTop: number) => {
        if (containerRef?.current) {
          const el = containerRef.current as unknown as HTMLElement;
          if (el && el.style) {
            if (isUp) {
              el.style.position = 'fixed';
              el.style.top = `${offsetTop}px`;
              el.style.left = '0px';
              el.style.right = '0px';
              el.style.height = `${height}px`;
              el.style.maxHeight = `${height}px`;
              el.style.overflow = 'hidden';
            } else {
              el.style.position = '';
              el.style.top = '';
              el.style.left = '';
              el.style.right = '';
              el.style.height = '';
              el.style.maxHeight = '';
              el.style.overflow = '';
            }
          }
        }
      };

      const onViewportChange = () => {
        const vv = window.visualViewport;
        if (!vv) return;

        const currentHeight = vv.height;
        const offsetTop = vv.offsetTop;
        const totalHeight = window.innerHeight;
        const diff = Math.max(0, totalHeight - currentHeight);

        // Virtual keyboard is active on mobile web if visual viewport shrunk (> 60px)
        const isUp = diff > 60;
        setKeyboardUp(isUp);
        setKeyboardHeight(isUp ? diff : 0);
        setWebViewportHeight(isUp ? currentHeight : null);
        setWebViewportOffsetTop(isUp ? offsetTop : 0);

        applyDirectStyles(isUp, currentHeight, offsetTop);

        // Keep page/document scroll pinned to top on iOS Safari
        if (window.scrollY !== 0 || (document.body && document.body.scrollTop !== 0)) {
          window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
          if (document.body) document.body.scrollTop = 0;
        }
      };

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewportChange);
        window.visualViewport.addEventListener('scroll', onViewportChange);
      }
      window.addEventListener('scroll', onViewportChange, { passive: true });

      cleanupWeb = () => {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', onViewportChange);
          window.visualViewport.removeEventListener('scroll', onViewportChange);
        }
        window.removeEventListener('scroll', onViewportChange);
        applyDirectStyles(false, 0, 0);
      };
    }

    return () => {
      showSub.remove();
      hideSub.remove();
      cleanupWeb?.();
    };
  }, [containerRef]);

  return { keyboardUp, keyboardHeight, webViewportHeight, webViewportOffsetTop };
}

export default function ConversationScreen() {
  const { id, prefill } = useLocalSearchParams<{ id: string; prefill?: string }>();
  const conversationId = typeof id === 'string' ? id : '';
  const prefillParam = typeof prefill === 'string' ? prefill : '';
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const containerRef = useRef<any>(null);
  const { keyboardUp, webViewportHeight, webViewportOffsetTop } = useChatKeyboardLayout(containerRef);

  // Prevent document body scrolling on mobile web when in a conversation
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const origHtmlOverflow = html.style.overflow;
    const origBodyOverflow = body.style.overflow;
    const origBodyHeight = body.style.height;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.height = '100%';

    return () => {
      html.style.overflow = origHtmlOverflow;
      body.style.overflow = origBodyOverflow;
      body.style.height = origBodyHeight;
    };
  }, []);

  // ── Custom Domain Hooks ──────────────────────────────────────────────────
  const thread = useConversationThread(conversationId, user, prefillParam);
  const block = useConversationBlock(user, thread.other);

  // ── Sheet & Context Menu Visibility States ───────────────────────────────
  const [pressed, setPressed] = useState<{ msg: any; anchor: Anchor } | null>(null);
  const [offerVisible, setOfferVisible] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

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

  const handleDeleteMessage = useCallback(async () => {
    const msg = pressed?.msg;
    if (!msg || !user) return;
    const isImage = isImageMessage(msg);

    const ok = await confirm({
      title: isImage ? 'Delete photo?' : 'Delete message?',
      message: 'This message will be deleted for everyone in this conversation. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    const success = await thread.handleDeleteMessage(msg.id);
    if (!success) {
      toast.show("Couldn't delete message", { variant: 'default', icon: 'alert-triangle' });
    } else {
      toast.show(isImage ? 'Photo deleted' : 'Message deleted', { variant: 'success', icon: 'check' });
    }
  }, [pressed?.msg, thread, toast, user]);

  const messageActions: MessageAction[] = useMemo(() => {
    const actions: MessageAction[] = [
      { id: 'copy', label: 'Copy', icon: 'copy', onPress: handleCopy },
    ];
    if (pressed?.msg && user && pressed.msg.sender_id === user.id) {
      const isImage = isImageMessage(pressed.msg);
      actions.push({
        id: 'delete',
        label: isImage ? 'Delete photo' : 'Delete message',
        icon: 'trash-2',
        tone: 'destructive',
        onPress: handleDeleteMessage,
      });
    }
    return actions;
  }, [handleCopy, handleDeleteMessage, pressed?.msg, user]);

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
      ...(thread.convListingId || thread.other?.id
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
    [thread.other, thread.canOffer, thread.convListingPrice, thread.convListingId, openListing, block.isBlocked, block.handleToggleBlock],
  );

  // ── Image Picking & Sending ──────────────────────────────────────────────
  const handlePickAndSendImage = useCallback(async () => {
    if (!user || !conversationId || uploadingImage) return;
    let tempId: string | null = null;
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setUploadingImage(true);
      const asset = result.assets[0];
      const localImg: LocalImage = {
        uri: asset.uri,
        base64: asset.base64 ?? null,
      };

      // Optimistic message shown in thread immediately
      tempId = `temp-${Date.now()}`;
      const tempMsg = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: asset.uri,
        kind: 'text' as const,
        metadata: { image_url: asset.uri },
        offer_status: null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      thread.addOptimisticMessage(tempMsg);

      // Upload image via the standard upload pipeline
      const uploaded = await uploadListingImages([localImg], user.id);
      const publicUrl = uploaded[0]?.url;

      if (!publicUrl) {
        throw new Error('Could not upload photo');
      }

      // Deliver the server message
      await thread.handleSendImage(publicUrl, tempId);
    } catch (err: any) {
      if (tempId) {
        try {
          await thread.handleDeleteMessage(tempId);
        } catch (cleanupErr) {
          console.warn('[conversation] cleanup temp message error', cleanupErr);
        }
      }
      console.warn('[conversation] send image error', err);
      toast.show(err?.message || 'Failed to send image', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setUploadingImage(false);
    }
  }, [conversationId, thread, toast, uploadingImage, user]);

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
          onPay={(amount, bundleIds) => {
            if (!thread.convListingId) return;
            const params: Record<string, string> = { offer: String(amount) };
            if (bundleIds && bundleIds.length > 0) {
              params.bundle_ids = bundleIds.join(',');
            }
            router.push({
              pathname: `/payment/${thread.convListingId}`,
              params,
            } as any);
          }}
          onRetry={() => thread.handleRetry(item.msg)}
          onLongPress={(anchor) => setPressed({ msg: item.msg, anchor })}
          onImagePress={(url) => setFullscreenImage(url)}
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
      ref={containerRef}
      mode="keyboard-avoiding"
      noScroll
      edges={['top', 'left', 'right']}
      backgroundColor={theme.background}
      style={[
        { flex: 1 },
        Platform.OS === 'web' && webViewportHeight != null
          ? ({
              height: webViewportHeight,
              maxHeight: webViewportHeight,
              position: 'fixed',
              top: webViewportOffsetTop,
              left: 0,
              right: 0,
              overflow: 'hidden',
            } as any)
          : null,
      ]}
    >
      {/* Floating Header — absolutely positioned like the product page */}
      <LinearGradient
        colors={[theme.background, theme.background, 'transparent']}
        locations={[0, 0.65, 1]}
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
          paddingBottom: (thread.convListingId ? 140 : 80) + (keyboardUp ? DOCK_GAP_KEYBOARD : Math.max(insets.bottom + 10, 20)),
          paddingTop: 64,
        }}
        onContentSizeChange={thread.followEnd}
        onScroll={thread.onScroll}
        onScrollBeginDrag={() => {
          if (Platform.OS === 'web' && typeof document !== 'undefined') {
            if (document.activeElement instanceof HTMLElement && document.activeElement.tagName === 'TEXTAREA') {
              document.activeElement.blur();
            }
          }
        }}
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
      <LinearGradient
        colors={['transparent', theme.background, theme.background]}
        locations={[0, 0.35, 1]}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          paddingTop: 12,
          paddingBottom: keyboardUp ? DOCK_GAP_KEYBOARD : Math.max(insets.bottom + 10, 20),
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
            onSendImage={handlePickAndSendImage}
            uploadingImage={uploadingImage}
            onPlus={() => setPlusOpen(true)}
            onFocus={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
                if (document.body) document.body.scrollTop = 0;
                requestAnimationFrame(() => {
                  window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
                  if (document.body) document.body.scrollTop = 0;
                });
                setTimeout(() => {
                  window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
                  if (document.body) document.body.scrollTop = 0;
                  thread.followEnd();
                }, 100);
              }
            }}
            onBlur={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
                if (document.body) document.body.scrollTop = 0;
              }
            }}
          />
        ) : (
          <ConversationBlockedBanner
            blockStatus={block.blockStatus}
            onUnblock={block.handleToggleBlock}
          />
        )}
      </LinearGradient>

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

      {/* Fullscreen Photo Viewer */}
      <FullscreenImageViewer
        visible={!!fullscreenImage}
        images={fullscreenImage ? [fullscreenImage] : []}
        initialIndex={0}
        onClose={() => setFullscreenImage(null)}
      />
    </SafeContainer>
  );
}
