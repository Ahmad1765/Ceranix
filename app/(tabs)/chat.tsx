import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  listConversations,
  subscribeToInbox,
  otherParticipant,
  type ConversationRow,
} from '@/lib/chat';
import { getOptimizedImageUrl } from '@/lib/images';
import { colors } from '@/lib/theme';
import { EmptyState } from '@/components/ui';
import { HIT_SLOP_8 } from '@/lib/responsive';

type InboxTab = 'selling' | 'buying' | 'social' | 'support';

const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: 'selling', label: 'Selling' },
  { value: 'buying', label: 'Buying' },
  { value: 'social', label: 'Social' },
  { value: 'support', label: 'Support' },
];

const TAB_COUNT = INBOX_TABS.length;
// Width ratio of the underline indicator relative to its tab cell.
const UNDERLINE_WIDTH_RATIO = 0.42;

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
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
                  fontSize: 15,
                  fontWeight: active ? '800' : '500',
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

function ConversationRowItem({
  conv,
  userId,
  onPress,
}: {
  conv: ConversationRow;
  userId: string;
  onPress: () => void;
}) {
  const other = otherParticipant(conv, userId);
  const thumb = conv.listing?.images?.[0]
    ? getOptimizedImageUrl(conv.listing.images[0], { width: 240 })
    : null;
  const avatar = other?.avatar_url ? getOptimizedImageUrl(other.avatar_url, { width: 140 }) : null;
  const isUnread = !!conv.last_sender_id && conv.last_sender_id !== userId;
  const preview = conv.last_message ?? 'Tap to start the conversation';
  const initial = (other?.full_name || other?.username || 'U').trim().charAt(0).toUpperCase();
  const displayName = other?.full_name || other?.username || 'Unknown';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      {/* Avatar */}
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.panel,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
          />
        ) : (
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.purple }}>{initial}</Text>
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
        <Text
          style={{
            fontSize: 15.5,
            fontWeight: '800',
            color: colors.ink,
            letterSpacing: -0.2,
            marginBottom: 2,
          }}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        <Text
          style={{
            fontSize: 13.5,
            color: isUnread ? colors.ink : colors.mute,
            fontWeight: isUnread ? '600' : '400',
          }}
          numberOfLines={1}
        >
          {preview}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.muteSoft,
            marginTop: 4,
          }}
        >
          {formatRelativeTime(conv.updated_at)}
        </Text>
      </View>

      {/* Listing thumbnail */}
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          style={{ width: 56, height: 72, borderRadius: 8, backgroundColor: colors.panel }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={{ width: 56, height: 72 }} />
      )}

      {isUnread && (
        <View
          style={{
            position: 'absolute',
            top: 18,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.purple,
          }}
        />
      )}
    </Pressable>
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
}: {
  data: ConversationRow[];
  userId: string;
  tab: InboxTab;
  pageWidth: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const empty = emptyStateFor(tab);
  return (
    <View style={{ width: pageWidth, flex: 1 }}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationRowItem
            conv={item}
            userId={userId}
            onPress={() => router.push(`/conversation/${item.id}` as any)}
          />
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: colors.hairline, marginLeft: 84 }} />
        )}
        ListEmptyComponent={
          <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
        }
        contentContainerStyle={data.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
      />
    </View>
  );
}

function PushNotificationBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View
      style={{
        backgroundColor: 'rgba(15,15,15,0.72)',
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Feather name="bell-off" size={18} color={colors.white} />
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Text style={{ color: colors.white, fontSize: 13, fontWeight: '400' }}>
          Never miss a message{' '}
        </Text>
        <Text style={{ color: colors.white, fontSize: 13, fontWeight: '800' }}>
          Activate push notifications{' '}
        </Text>
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={() => router.push('/profile/notifications' as any)}
        >
          <Text
            style={{
              color: colors.white,
              fontSize: 13,
              fontWeight: '700',
              textDecorationLine: 'underline',
            }}
          >
            now
          </Text>
        </Pressable>
      </View>
      <Pressable
        hitSlop={HIT_SLOP_8}
        onPress={onDismiss}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Feather name="x" size={16} color={colors.white} />
      </Pressable>
    </View>
  );
}

export default function InboxScreen() {
  const { user, loading: authLoading } = useAuth();
  const { width: pageWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<InboxTab>('buying');
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const pagerRef = useRef<FlatList<{ value: InboxTab; label: string }>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const activeTabRef = useRef<InboxTab>(activeTab);
  activeTabRef.current = activeTab;
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // Update activeTab live during a swipe so the bold/dark text tracks the
  // gesture instead of only flipping at momentum end. Native-driver friendly:
  // we don't disable useNativeDriver on the Animated.event, we just attach a
  // JS listener that fires on every committed value.
  useEffect(() => {
    if (pageWidth <= 0) return;
    const id = scrollX.addListener(({ value }) => {
      const index = Math.round(value / pageWidth);
      const next = INBOX_TABS[index]?.value;
      if (next && next !== activeTabRef.current) {
        activeTabRef.current = next;
        setActiveTab(next);
      }
    });
    return () => scrollX.removeListener(id);
  }, [scrollX, pageWidth]);

  const fetchInbox = useCallback(async (uid: string) => {
    return listConversations(uid);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setConversations([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchInbox(user.id)
      .then((rows) => {
        if (cancelled) return;
        setConversations(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, fetchInbox]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      fetchInbox(user.id).then((rows) => setConversations(rows)).catch(() => {});
    }, [user?.id, fetchInbox]),
  );

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToInbox(user.id, () => {
      fetchInbox(user.id).then((rows) => setConversations(rows)).catch(() => {});
    });
    return unsub;
  }, [user?.id, fetchInbox]);

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
    if (!user?.id) return;
    setRefreshing(true);
    try {
      const rows = await fetchInbox(user.id);
      setConversations(rows);
    } catch (e) {
      console.warn('[Inbox] refresh failed', e);
    } finally {
      setRefreshing(false);
    }
  }, [user?.id, fetchInbox]);

  const goToTab = useCallback(
    (tab: InboxTab) => {
      const index = INBOX_TABS.findIndex((t) => t.value === tab);
      if (index < 0) return;
      setActiveTab(tab);
      pagerRef.current?.scrollToOffset({ offset: index * pageWidth, animated: true });
    },
    [pageWidth],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      const next = INBOX_TABS[index]?.value;
      if (next && next !== activeTab) setActiveTab(next);
    },
    [activeTab, pageWidth],
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
          onPress={() => router.push('/profile/settings' as any)}
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
            fontSize: 17,
            fontWeight: '600',
            color: colors.ink,
            letterSpacing: -0.2,
          }}
        >
          Inbox
        </Text>
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={() => router.push('/discover' as any)}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="message-circle" size={22} color={colors.ink} />
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.purple} />
        </View>
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
            { useNativeDriver: true },
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
