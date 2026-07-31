import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, Pressable, RefreshControl, Animated, Platform, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import {
  subscribeToInbox,
  type ConversationRow,
} from '@/lib/chat';
import { useInboxQuery } from '@/lib/queries';
import { colors, radii, shadow, type as typography } from '@/lib/theme';
import { EmptyState } from '@/components/ui';
import { InboxRow, InboxSkeleton, INBOX_ROW_INSET } from '@/components/chat';
import { HIT_SLOP_8, useTabBarClearance } from '@/lib/responsive';

type InboxTab = 'selling' | 'buying' | 'social' | 'support';

// Stable empty reference so the inbox fallback doesn't churn the pageData memo.
const EMPTY_CONVERSATIONS: ConversationRow[] = [];

const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: 'selling', label: 'Selling' },
  { value: 'buying', label: 'Buying' },
  { value: 'social', label: 'Social' },
  { value: 'support', label: 'Support' },
];

const TAB_COUNT = INBOX_TABS.length;
// Width ratio of the underline indicator relative to its tab cell.
const UNDERLINE_WIDTH_RATIO = 0.42;

// Light tap on every interactive control on this screen. No-op on web, where
// the Haptics API has nothing to drive.
function haptic() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function SignedOutState() {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        icon="message-circle"
        title="Sign in to chat"
        description="Your conversations with buyers and sellers live here."
        cta={{ label: 'Sign in', icon: 'log-in', onPress: () => router.push('/auth/login' as any) }}
      />
    </View>
  );
}

function UnderlineTabs({
  value,
  onChange,
  scrollX,
  pageWidth,
}: {
  value: InboxTab;
  onChange: (v: InboxTab) => void;
  scrollX: Animated.Value;
  pageWidth: number;
}) {
  const tabWidth = pageWidth / TAB_COUNT;
  const underlineWidth = tabWidth * UNDERLINE_WIDTH_RATIO;
  const underlineOffset = (tabWidth - underlineWidth) / 2;

  // Indicator follows scroll position in real time. Input range covers all
  // four pages; output is the corresponding tab cell's left edge plus the
  // centering offset for the indicator.
  const translateX = scrollX.interpolate({
    inputRange: INBOX_TABS.map((_, i) => i * pageWidth),
    outputRange: INBOX_TABS.map((_, i) => i * tabWidth + underlineOffset),
    extrapolate: 'clamp',
  });

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {INBOX_TABS.map((t) => {
          const active = t.value === value;
          return (
            <Pressable
              key={t.value}
              onPress={() => onChange(t.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: active ? typography.family.sansBold : typography.family.sansMedium,
                  fontSize: 15,
                  color: active ? colors.ink : colors.muteSoft,
                  letterSpacing: -0.1,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {pageWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -1,
            left: 0,
            height: 2.5,
            width: underlineWidth,
            backgroundColor: colors.ink,
            borderRadius: 2,
            transform: [{ translateX }],
          }}
        />
      )}
    </View>
  );
}

function emptyStateFor(tab: InboxTab) {
  switch (tab) {
    case 'selling':
      return {
        icon: 'tag' as const,
        title: 'No buyer chats yet',
        description: 'Post a great listing and buyers will reach out.',
      };
    case 'buying':
      return {
        icon: 'shopping-bag' as const,
        title: 'No conversations yet',
        description: 'Found something you love? Tap message on the listing.',
      };
    case 'social':
      return {
        icon: 'users' as const,
        title: 'No social messages',
        description: 'Messages from people you follow will show up here.',
      };
    case 'support':
      return {
        icon: 'life-buoy' as const,
        title: 'No support threads',
        description: "We'll respond to your support requests here.",
      };
  }
}

function ConversationPage({
  data,
  userId,
  tab,
  pageWidth,
  refreshing,
  onRefresh,
  bottomInset,
}: {
  data: ConversationRow[];
  userId: string;
  tab: InboxTab;
  pageWidth: number;
  refreshing: boolean;
  onRefresh: () => void;
  bottomInset: number;
}) {
  const empty = emptyStateFor(tab);
  return (
    <View style={{ width: pageWidth, flex: 1 }}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InboxRow
            conv={item}
            userId={userId}
            onPress={() => router.push(`/conversation/${item.id}` as any)}
          />
        )}
        ItemSeparatorComponent={() => (
          <View
            style={{
              height: 1,
              backgroundColor: colors.hairline,
              marginLeft: INBOX_ROW_INSET,
            }}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
        }
        contentContainerStyle={data.length === 0 ? { flex: 1 } : { paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />
    </View>
  );
}

// Floating card, not a full-width bar — sits above the tab dock (which is
// absolutely positioned and reserves no layout space of its own) with the
// same breathing room the dock keeps off the screen edges, so it reads as
// part of the same floating-surface language instead of a stray strip
// peeking out from behind it.
function PushNotificationBanner({ onDismiss }: { onDismiss: () => void }) {
  const bottom = useTabBarClearance();
  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom,
        backgroundColor: colors.white,
        borderRadius: radii['2xl'],
        borderWidth: 1,
        borderColor: colors.hairline,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        ...shadow.lg,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="bell" size={17} color={colors.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 13,
            color: colors.ink,
            letterSpacing: -0.1,
          }}
          numberOfLines={1}
        >
          Turn on notifications
        </Text>
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 11.5,
            color: colors.mute,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          Never miss a new message or offer
        </Text>
      </View>

      <Pressable
        hitSlop={HIT_SLOP_8}
        onPress={() => {
          haptic();
          // `/profile/notifications` was pushed here and that route does not
          // exist — the tap dead-ended on expo-router's "Unmatched Route"
          // screen. Notification prefs live on the Settings page's "Enhance the
          // experience" card, so open it directly.
          router.push('/settings?open=enhance' as any);
        }}
        style={({ pressed }) => ({
          paddingHorizontal: 13,
          paddingVertical: 8,
          borderRadius: radii.pill,
          backgroundColor: colors.primary,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 12.5,
            color: colors.white,
          }}
        >
          Enable
        </Text>
      </Pressable>

      <Pressable
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={() => {
          haptic();
          onDismiss();
        }}
        style={({ pressed }) => ({
          position: 'absolute',
          top: -7,
          right: -7,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.white,
          borderWidth: 1,
          borderColor: colors.hairline,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
          ...shadow.sm,
        })}
      >
        <Feather name="x" size={12} color={colors.mute} />
      </Pressable>
    </View>
  );
}

export default function InboxScreen() {
  const { user, loading: authLoading } = useAuth();
  const { width: pageWidth } = useWindowDimensions();
  const tabBarClearance = useTabBarClearance();
  const [activeTab, setActiveTab] = useState<InboxTab>('buying');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const userId = user?.id ?? null;
  const inboxQ = useInboxQuery(userId);
  const conversations = inboxQ.data ?? EMPTY_CONVERSATIONS;
  const loading = inboxQ.isLoading;
  const refreshing = inboxQ.isRefetching;
  const { refetch: inboxRefetch, isStale: inboxStale } = inboxQ;

  const pagerRef = useRef<FlatList<{ value: InboxTab; label: string }>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const activeTabRef = useRef<InboxTab>(activeTab);
  activeTabRef.current = activeTab;
  // Timestamp until which the scroll listener should ignore updates because
  // a tap kicked off a programmatic animated scroll. This window covers the
  // ~300ms animation. Platform-agnostic: doesn't rely on begin/end-drag
  // events (which react-native-web doesn't fire for native scrollers).
  const ignoreListenerUntilRef = useRef(0);

  // Drive activeTab from scrollX so the bold text tracks the indicator
  // under your finger during a swipe. After a tap, the listener is briefly
  // muted so the animation flying through intermediate pages doesn't make
  // the bold flicker — see goToTab.
  useEffect(() => {
    if (pageWidth <= 0) return;
    const id = scrollX.addListener(({ value }) => {
      if (Date.now() < ignoreListenerUntilRef.current) return;
      const nextIndex = Math.round(value / pageWidth);
      const next = INBOX_TABS[nextIndex]?.value;
      if (next && next !== activeTabRef.current) {
        activeTabRef.current = next;
        setActiveTab(next);
      }
    });
    return () => scrollX.removeListener(id);
  }, [scrollX, pageWidth]);

  // Revalidate the inbox on focus when stale (the initial fetch is automatic).
  useFocusEffect(
    useCallback(() => {
      if (inboxStale) inboxRefetch();
    }, [inboxStale, inboxRefetch]),
  );

  // Realtime: a new/updated conversation simply triggers a refetch.
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToInbox(userId, () => {
      inboxRefetch();
    });
    return unsub;
  }, [userId, inboxRefetch]);

  // Per-tab filtered data so the pager always has all four pages ready.
  const pageData = useMemo<Record<InboxTab, ConversationRow[]>>(() => {
    const uid = user?.id;
    if (!uid) {
      return { selling: [], buying: [], social: [], support: [] };
    }
    return {
      selling: conversations.filter((c) => c.seller_id === uid),
      buying: conversations.filter((c) => c.buyer_id === uid),
      // Social and Support categories don't exist yet in the data model.
      social: [],
      support: [],
    };
  }, [conversations, user?.id]);

  const onRefresh = useCallback(async () => {
    await inboxRefetch();
  }, [inboxRefetch]);

  const goToTab = useCallback(
    (tab: InboxTab) => {
      const to = INBOX_TABS.findIndex((t) => t.value === tab);
      if (to < 0 || pageWidth <= 0) return;
      if (tab === activeTabRef.current) return;
      // Snap state to destination immediately so the bold flips once, cleanly,
      // while the pager slides underneath. Mute the listener for the duration
      // of the animation so it doesn't briefly bold each tab the scroll flies
      // through.
      activeTabRef.current = tab;
      setActiveTab(tab);
      ignoreListenerUntilRef.current = Date.now() + 450;
      pagerRef.current?.scrollToOffset({ offset: to * pageWidth, animated: true });
    },
    [pageWidth],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Force-reconcile to whatever page we actually settled on. Cheap safety
      // net — covers the case where the listener was muted and the final
      // resting page differs from activeTab (shouldn't happen, but free).
      ignoreListenerUntilRef.current = 0;
      if (pageWidth <= 0) return;
      const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      const next = INBOX_TABS[index]?.value;
      if (next && next !== activeTabRef.current) {
        activeTabRef.current = next;
        setActiveTab(next);
      }
    },
    [pageWidth],
  );

  // Keep pager aligned with activeTab if window width changes (e.g. rotation).
  useEffect(() => {
    const index = INBOX_TABS.findIndex((t) => t.value === activeTab);
    if (index < 0) return;
    pagerRef.current?.scrollToOffset({ offset: index * pageWidth, animated: false });
    // We intentionally only sync on pageWidth changes; activeTab changes are
    // already handled via goToTab/onMomentumScrollEnd.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth]);

  const initialScrollIndex = useMemo(
    () => INBOX_TABS.findIndex((t) => t.value === activeTab),
    // initialScrollIndex is only read on mount; activeTab is intentionally
    // omitted to avoid forcing a remount of the pager.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Header — centered title, side icons */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <Pressable
          hitSlop={HIT_SLOP_8}
          // `/profile/settings` is not a route (the screen is `app/settings.tsx`),
          // so this overflow button used to land on "Unmatched Route". No `as any`
          // here on purpose — the cast is what let the broken path compile.
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="more-horizontal" size={22} color={colors.ink} />
        </Pressable>
        <Text
          style={{
            fontFamily: typography.family.sansSemibold,
            fontSize: 17,
            color: colors.ink,
            letterSpacing: -0.2,
          }}
        >
          Inbox
        </Text>
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={() => router.push('/discover' as any)}
          accessibilityRole="button"
          accessibilityLabel="Find something to talk about"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="search" size={21} color={colors.ink} />
        </Pressable>
      </View>

      {/* Underline tabs with scroll-driven indicator */}
      <UnderlineTabs
        value={activeTab}
        onChange={goToTab}
        scrollX={scrollX}
        pageWidth={pageWidth}
      />

      {/* Content */}
      {authLoading || (loading && conversations.length === 0) ? (
        // Skeleton rows rather than a centred spinner: the list geometry is
        // already on screen, so nothing jumps when the data lands.
        <InboxSkeleton />
      ) : !user ? (
        <SignedOutState />
      ) : (
        <Animated.FlatList
          ref={pagerRef as any}
          data={INBOX_TABS}
          keyExtractor={(t) => t.value}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          initialScrollIndex={initialScrollIndex >= 0 ? initialScrollIndex : 1}
          getItemLayout={(_, index) => ({
            length: pageWidth,
            offset: pageWidth * index,
            index,
          })}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: Platform.OS !== 'web' },
          )}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item }) => (
            <ConversationPage
              data={pageData[item.value]}
              userId={user.id}
              tab={item.value}
              pageWidth={pageWidth}
              refreshing={refreshing}
              onRefresh={onRefresh}
              bottomInset={tabBarClearance}
            />
          )}
        />
      )}

      {/* Push notification banner — sits above the tab bar */}
      {!bannerDismissed && user && (
        <PushNotificationBanner onDismiss={() => setBannerDismissed(true)} />
      )}
    </SafeAreaView>
  );
}
