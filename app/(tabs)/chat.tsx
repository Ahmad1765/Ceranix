import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, Pressable, RefreshControl, Animated, Platform, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import {
  subscribeToInbox,
  type ConversationRow,
} from '@/lib/chat';
import { useActivityUnreadCount, useInboxQuery } from '@/lib/queries';
import { colors, radii, shadow, type as typography } from '@/lib/theme';
import { EmptyState } from '@/components/ui';
import { InboxRow, InboxSkeleton } from '@/components/chat';
import { ActivityFeed } from '@/components/activity';
import { HIT_SLOP_8, useTabBarClearance } from '@/lib/responsive';

type InboxTab = 'selling' | 'buying' | 'activity' | 'support';
/**
 * Every tab except Activity is backed by a conversation list. Activity renders
 * <ActivityFeed> instead, so the conversation-shaped pieces below exclude it
 * rather than carrying a branch that can never run.
 */
type ConversationTab = Exclude<InboxTab, 'activity'>;

// Stable empty reference so the inbox fallback doesn't churn the pageData memo.
const EMPTY_CONVERSATIONS: ConversationRow[] = [];

// Module-level so the FlatList doesn't see a new keyExtractor every render.
const keyById = (item: ConversationRow) => item.id;

// "Activity" took the slot that used to be a dead "Social" placeholder. It is
// now the only way into the Activity feed — the bell that used to open /news
// from the profile header is gone — so it sits inside the pager rather than
// behind an icon.
const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: 'selling', label: 'Selling' },
  { value: 'buying', label: 'Buying' },
  { value: 'activity', label: 'Activity' },
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

// Unread count on a tab label. Positioned absolutely off the label's trailing
// edge rather than laid out beside it: four tabs already split the width evenly,
// and an inline badge would push "Activity" into wrapping on a narrow phone.
// Costs zero layout width, so it can't break the row at any viewport.
function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: '100%',
        bottom: '58%',
        marginLeft: 3,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        borderRadius: 8,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: typography.family.sansBold,
          fontSize: 10,
          lineHeight: 12,
          color: colors.white,
        }}
      >
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}

function UnderlineTabs({
  value,
  onChange,
  scrollX,
  pageWidth,
  badges,
}: {
  value: InboxTab;
  onChange: (v: InboxTab) => void;
  scrollX: Animated.Value;
  pageWidth: number;
  /** Unread counts per tab. Absent or 0 renders no badge. */
  badges?: Partial<Record<InboxTab, number>>;
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
          const count = badges?.[t.value] ?? 0;
          return (
            <Pressable
              key={t.value}
              onPress={() => onChange(t.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              // The badge is a bare number on screen; spell it out for a screen
              // reader or the tab just announces "Activity" either way.
              accessibilityLabel={
                count > 0 ? `${t.label}, ${count} new` : t.label
              }
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 14,
              }}
            >
              {/* Wrapper hugs the label so the badge can anchor to its
                  trailing edge rather than the full-width tab cell. */}
              <View>
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
                <TabBadge count={count} />
              </View>
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

function emptyStateFor(tab: ConversationTab) {
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
    case 'support':
      return {
        icon: 'life-buoy' as const,
        title: 'No support threads',
        description: "We'll respond to your support requests here.",
      };
  }
}

// Module-level so the component TYPE is stable. As an inline
// `ItemSeparatorComponent={() => ...}` this was a brand-new type on every render
// of the page, which unmounts and remounts every separator in the list.
function InboxSeparator() {
  return <View style={{ height: 1, backgroundColor: colors.hairline }} />;
}

// `InboxRow` is already memo'd, but it was being handed a fresh
// `onPress={() => router.push(...)}` closure on every render, so the memo never
// bit. Owning the navigation here keeps the row's props down to two values that
// are stable between renders (the row object out of `data`, and a string id), so
// re-rendering the page now re-renders zero rows.
const InboxListRow = memo(function InboxListRow({
  conv,
  userId,
}: {
  conv: ConversationRow;
  userId: string;
}) {
  const onPress = useCallback(() => {
    router.push(`/conversation/${conv.id}` as any);
  }, [conv.id]);
  return <InboxRow conv={conv} userId={userId} onPress={onPress} />;
});

function ConversationPage({
  data,
  userId,
  tab,
  pageWidth,
  pageHeight,
  refreshing,
  onRefresh,
  bottomInset,
}: {
  data: ConversationRow[];
  userId: string;
  tab: ConversationTab;
  pageWidth: number;
  pageHeight: number;
  refreshing: boolean;
  onRefresh: () => void;
  bottomInset: number;
}) {
  const empty = emptyStateFor(tab);
  const renderItem = useCallback(
    ({ item }: { item: ConversationRow }) => <InboxListRow conv={item} userId={userId} />,
    [userId],
  );
  return (
    <View style={{ width: pageWidth, height: pageHeight }}>
      <FlatList
        style={{ flex: 1 }}
        data={data}
        keyExtractor={keyById}
        renderItem={renderItem}
        ItemSeparatorComponent={InboxSeparator}
        // Four of these lists are mounted at once (one per inbox tab in the
        // horizontal pager), so the defaults — windowSize 21, i.e. 10 screens of
        // rows in each direction — were being paid four times over for three
        // pages the user isn't looking at. An inbox row is a fixed-height
        // 3-column strip, so a tighter window is safe here.
        windowSize={7}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        // Android-only in practice; detaches off-screen rows from the native
        // view hierarchy. Rows have no absolutely-positioned overflow, which is
        // the case where this is known to clip content.
        removeClippedSubviews={Platform.OS === 'android'}
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
  const [pagerHeight, setPagerHeight] = useState(0);

  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    setPagerHeight(e.nativeEvent.layout.height);
  }, []);

  const userId = user?.id ?? null;
  const inboxQ = useInboxQuery(userId);
  const conversations = inboxQ.data ?? EMPTY_CONVERSATIONS;
  const loading = inboxQ.isLoading;
  const refreshing = inboxQ.isRefetching;
  const { refetch: inboxRefetch, isStale: inboxStale } = inboxQ;

  // Activity's unread count. Reads the same caches <ActivityFeed> renders from,
  // so the badge and the list it points at can't drift apart.
  const activityUnread = useActivityUnreadCount(userId);
  const tabBadges = useMemo(() => ({ activity: activityUnread }), [activityUnread]);

  const pagerRef = useRef<FlatList<{ value: InboxTab; label: string }>>(null);
  // `useState(() => ...)` rather than the more familiar
  // `useRef(new Animated.Value(0)).current`, for two reasons:
  //   1. Reading `.current` during render is a Rules-of-React violation, and
  //      React Compiler bails out of the whole component over it.
  //   2. The useRef form evaluates `new Animated.Value(0)` on EVERY render and
  //      throws the result away — useRef only keeps the first one. The lazy
  //      initializer actually runs once.
  // Identical semantics: one instance for the lifetime of the component.
  const [scrollX] = useState(() => new Animated.Value(0));
  // Mirrors activeTab for the scroll/gesture callbacks, which need the current
  // value without being re-created on every tab change.
  //
  // Synced in an effect, NOT by assigning during render. The render-time
  // assignment that used to sit here is a Rules-of-React violation ("Cannot
  // access refs during render"), and it made React Compiler bail out of this
  // whole screen. Every reader is an event handler or an effect, so all of them
  // run after commit and see the synced value.
  const activeTabRef = useRef<InboxTab>(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
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
  // Activity isn't in here — it renders <ActivityFeed>, not a conversation list.
  const pageData = useMemo<Record<ConversationTab, ConversationRow[]>>(() => {
    const uid = user?.id;
    if (!uid) {
      return { selling: [], buying: [], support: [] };
    }
    return {
      selling: conversations.filter((c) => c.seller_id === uid),
      buying: conversations.filter((c) => c.buyer_id === uid),
      // Support doesn't exist yet in the data model.
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
  //
  // Reads activeTabRef rather than activeTab so the dep list is honest and no
  // eslint-disable is needed. That matters beyond tidiness: React Compiler
  // refuses to optimize any component where a React ESLint rule has been
  // disabled ("React Compiler has skipped optimizing this component because one
  // or more React ESLint rules were disabled"), so the two suppressions that
  // used to be here cost ChatScreen its memoization entirely. The ref is
  // assigned on every render above, so it always holds the current tab; the
  // intent — resync on width change only, since tab changes already scroll via
  // goToTab/onMomentumScrollEnd — is unchanged.
  useEffect(() => {
    const index = INBOX_TABS.findIndex((t) => t.value === activeTabRef.current);
    if (index < 0) return;
    pagerRef.current?.scrollToOffset({ offset: index * pageWidth, animated: false });
  }, [pageWidth]);

  // Mount-only value. A useState initializer says "compute once" directly,
  // instead of a useMemo with a dep list that lies about what it reads.
  // Recomputing would remount the pager.
  const [initialScrollIndex] = useState(() =>
    INBOX_TABS.findIndex((t) => t.value === activeTab),
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
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
        badges={tabBadges}
      />

      {/* Content — the measuring wrapper gives us a concrete pixel height
          for each pager page. On web, flex-based height propagation through
          a horizontal FlatList's content container is broken, so the inner
          vertical FlatLists need an explicit height to scroll. */}
      <View style={{ flex: 1 }} onLayout={onPagerLayout}>
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
            style={{ flex: 1 }}
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
            renderItem={({ item }) => {
              // Activity is the odd page out: notifications and saved searches,
              // not conversations. Same page geometry, different body.
              if (item.value === 'activity') {
                return (
                  <View style={{ width: pageWidth, height: pagerHeight }}>
                    <ActivityFeed bottomInset={tabBarClearance} />
                  </View>
                );
              }
              return (
                <ConversationPage
                  data={pageData[item.value]}
                  userId={user.id}
                  tab={item.value}
                  pageWidth={pageWidth}
                  pageHeight={pagerHeight}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  bottomInset={tabBarClearance}
                />
              );
            }}
          />
        )}
      </View>

      {/* Push notification banner — sits above the tab bar */}
      {!bannerDismissed && user && (
        <PushNotificationBanner onDismiss={() => setBannerDismissed(true)} />
      )}
    </SafeAreaView>
  );
}
