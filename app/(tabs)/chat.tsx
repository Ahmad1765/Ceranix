import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Animated,
  Platform,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import {
  subscribeToInbox,
  isConversationUnread,
  type ConversationRow,
} from '@/lib/chat';
import {
  isSupportConversation,
  getOrCreateSupportConversation,
  SUPPORT_TOPICS,
  SUPPORT_BOT_NAME,
  SUPPORT_BOT_AVATAR,
} from '@/lib/support';
import { useInboxQuery } from '@/lib/queries';
import { colors, radii, shadow, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState, BellIcon } from '@/components/ui';
import { InboxRow, InboxSkeleton, OrdersInboxPage } from '@/components/chat';
import { HIT_SLOP_8, useTabBarClearance } from '@/lib/responsive';
import { PressableScale } from '@/components/PressableScale';

type InboxTab = 'messages' | 'orders' | 'support';
type MessageChip = 'all' | 'buying' | 'selling' | 'socials';

const EMPTY_CONVERSATIONS: ConversationRow[] = [];
const keyById = (item: ConversationRow) => item.id;

const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: 'messages', label: 'Messages' },
  { value: 'orders', label: 'Orders' },
  { value: 'support', label: 'Support' },
];

const MESSAGE_CHIPS: { key: MessageChip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'buying', label: 'Buying' },
  { key: 'selling', label: 'Selling' },
  { key: 'socials', label: 'Socials' },
];

const TAB_COUNT = INBOX_TABS.length;
const UNDERLINE_WIDTH_RATIO = 0.42;

function haptic() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function SignedOutState() {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        icon="message-circle"
        title="Sign in to chat"
        description="Your conversations with buyers, sellers, and support live here."
        cta={{ label: 'Sign in', icon: 'log-in', onPress: () => router.push('/auth/login' as any) }}
      />
    </View>
  );
}

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
  badges?: Partial<Record<InboxTab, number>>;
}) {
  const { theme } = useTheme();
  const tabWidth = pageWidth / TAB_COUNT;
  const underlineWidth = tabWidth * UNDERLINE_WIDTH_RATIO;
  const underlineOffset = (tabWidth - underlineWidth) / 2;

  const translateX = scrollX.interpolate({
    inputRange: INBOX_TABS.map((_, i) => i * pageWidth),
    outputRange: INBOX_TABS.map((_, i) => i * tabWidth + underlineOffset),
    extrapolate: 'clamp',
  });

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.hairline,
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
              accessibilityLabel={count > 0 ? `${t.label}, ${count} new` : t.label}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 14,
              }}
            >
              <View>
                <Text
                  style={{
                    fontFamily: active ? typography.family.sansBold : typography.family.sansMedium,
                    fontSize: 15,
                    color: active ? theme.ink : theme.muteSoft,
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
            backgroundColor: theme.ink,
            borderRadius: 2,
            transform: [{ translateX }],
          }}
        />
      )}
    </View>
  );
}

function emptyStateFor(chip: MessageChip) {
  switch (chip) {
    case 'all':
      return {
        icon: 'message-circle' as const,
        title: 'No messages yet',
        description: 'Your conversations with buyers, sellers, and other members live here.',
      };
    case 'buying':
      return {
        icon: 'shopping-bag' as const,
        title: 'No buying chats yet',
        description: 'Found something you love? Tap message on any listing to chat with the seller.',
      };
    case 'selling':
      return {
        icon: 'tag' as const,
        title: 'No buyer chats yet',
        description: 'Post a great listing and buyers will reach out to make offers and ask questions.',
      };
    case 'socials':
      return {
        icon: 'users' as const,
        title: 'No social messages yet',
        description: 'Connect with sellers and other collectors directly from their profiles.',
      };
  }
}

function InboxSeparator() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.hairline }} />;
}

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

function MessagesPage({
  allData,
  userId,
  activeChip,
  onChipChange,
  pageWidth,
  pageHeight,
  refreshing,
  onRefresh,
  bottomInset,
}: {
  allData: {
    all: ConversationRow[];
    buying: ConversationRow[];
    selling: ConversationRow[];
    socials: ConversationRow[];
  };
  userId: string;
  activeChip: MessageChip;
  onChipChange: (chip: MessageChip) => void;
  pageWidth: number;
  pageHeight: number;
  refreshing: boolean;
  onRefresh: () => void;
  bottomInset: number;
}) {
  const { theme, isDark } = useTheme();
  const currentData = allData[activeChip] ?? allData.all;
  const empty = emptyStateFor(activeChip);

  const renderItem = useCallback(
    ({ item }: { item: ConversationRow }) => <InboxListRow conv={item} userId={userId} />,
    [userId],
  );

  return (
    <View style={{ width: pageWidth, height: pageHeight, flex: 1 }}>
      {/* 4 Filter Chips (Image 4 design: squircle, bold labels) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 8,
          alignItems: 'center',
        }}
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.hairline,
          backgroundColor: theme.background,
          flexGrow: 0,
        }}
      >
        {MESSAGE_CHIPS.map((chip) => {
          const active = activeChip === chip.key;
          return (
            <Pressable
              key={chip.key}
              onPress={() => {
                haptic();
                onChipChange(chip.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={chip.label}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active
                    ? (isDark ? '#FFFFFF' : '#18181B')
                    : (isDark ? theme.panel : '#F3F4F6'),
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: active ? '700' : '600',
                  color: active
                    ? (isDark ? '#111111' : '#FFFFFF')
                    : (isDark ? '#E5E7EB' : '#1F1F1F'),
                  fontFamily: active ? typography.family.sansBold : typography.family.sansSemibold,
                }}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Messages FlatList */}
      <FlatList
        style={{ flex: 1 }}
        data={currentData}
        keyExtractor={keyById}
        renderItem={renderItem}
        ItemSeparatorComponent={InboxSeparator}
        windowSize={7}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
        }
        contentContainerStyle={currentData.length === 0 ? { flex: 1 } : { paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      />
    </View>
  );
}

// ── Working Support Hub Page ────────────────────────────────────────────────
function SupportPage({
  data,
  userId,
  pageWidth,
  pageHeight,
  refreshing,
  onRefresh,
  bottomInset,
}: {
  data: ConversationRow[];
  userId: string;
  pageWidth: number;
  pageHeight: number;
  refreshing: boolean;
  onRefresh: () => void;
  bottomInset: number;
}) {
  const { theme } = useTheme();
  const [startingChat, setStartingChat] = useState(false);

  const handleStartSupportChat = async (prompt?: string) => {
    if (startingChat) return;
    haptic();
    setStartingChat(true);
    try {
      const conv = await getOrCreateSupportConversation(userId);
      if (conv) {
        if (prompt) {
          router.push({
            pathname: `/conversation/${conv.id}`,
            params: { prefill: prompt },
          } as any);
        } else {
          router.push(`/conversation/${conv.id}` as any);
        }
        setStartingChat(false);
      } else {
        setStartingChat(false);
        Alert.alert('Unable to start support chat', 'Please check your connection and try again.');
      }
    } catch (e) {
      setStartingChat(false);
      console.warn('[support] failed to start', e);
      Alert.alert('Support unavailable', 'Failed to connect to Ceranix Support. Please try again later.');
    }
  };

  return (
    <View style={{ width: pageWidth, height: pageHeight }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: bottomInset + 100,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Ceranix Support Assistant Hero Card */}
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: radii['2xl'],
            borderWidth: 1,
            borderColor: theme.hairline,
            padding: 16,
            marginBottom: 20,
            ...shadow.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ position: 'relative' }}>
              <Image
                source={{ uri: SUPPORT_BOT_AVATAR }}
                style={{ width: 48, height: 48, borderRadius: 24 }}
                contentFit="cover"
              />
              <View
                style={{
                  position: 'absolute',
                  bottom: -1,
                  right: -1,
                  width: 13,
                  height: 13,
                  borderRadius: 7,
                  backgroundColor: '#10B981',
                  borderWidth: 2,
                  borderColor: theme.surface,
                }}
              />
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontFamily: typography.family.sansBold, fontSize: 16, color: theme.ink }}>
                  {SUPPORT_BOT_NAME}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: radii.pill,
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  }}
                >
                  <Text style={{ fontSize: 10, fontFamily: typography.family.sansBold, color: '#10B981' }}>
                    ONLINE
                  </Text>
                </View>
              </View>
              <Text style={{ fontFamily: typography.family.sans, fontSize: 12.5, color: theme.mute, marginTop: 2 }}>
                Instant AI Help & Dedicated Support Concierge
              </Text>
            </View>
          </View>

          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13.5,
              lineHeight: 19,
              color: theme.ink,
              marginBottom: 14,
            }}
          >
            Have a question about an order, refund, delivery, or payout? Start a chat to get immediate answers.
          </Text>

          <PressableScale
            onPress={() => handleStartSupportChat()}
            disabled={startingChat}
            style={{
              height: 44,
              borderRadius: radii.pill,
              backgroundColor: theme.purple,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              ...shadow.sm,
            }}
          >
            <Feather name="message-square" size={16} color="#FFFFFF" />
            <Text style={{ fontFamily: typography.family.sansBold, fontSize: 14, color: '#FFFFFF' }}>
              {startingChat ? 'Connecting…' : 'Chat with Ceranix Support'}
            </Text>
          </PressableScale>
        </View>

        {/* Quick Help Topics */}
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 11.5,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: theme.muteSoft,
            marginBottom: 10,
            paddingHorizontal: 2,
          }}
        >
          Frequently Asked Questions & Guides
        </Text>

        <View style={{ gap: 8, marginBottom: 24 }}>
          {SUPPORT_TOPICS.map((topic) => (
            <PressableScale
              key={topic.id}
              disabled={startingChat}
              onPress={() => handleStartSupportChat(topic.prompt)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.surface,
                borderRadius: radii.xl,
                borderWidth: 1,
                borderColor: theme.hairline,
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 12,
                opacity: startingChat ? 0.6 : 1,
                ...shadow.sm,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: theme.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={topic.icon as any} size={17} color={theme.primary} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: typography.family.sansBold, fontSize: 14, color: theme.ink }}>
                  {topic.title}
                </Text>
                <Text style={{ fontFamily: typography.family.sans, fontSize: 12, color: theme.mute, marginTop: 1 }}>
                  {topic.description}
                </Text>
              </View>

              <Feather name="chevron-right" size={18} color={theme.muteSoft} />
            </PressableScale>
          ))}
        </View>

        {/* Existing Support Threads if any */}
        {data.length > 0 && (
          <View>
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 11.5,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: theme.muteSoft,
                marginBottom: 8,
                paddingHorizontal: 2,
              }}
            >
              Your Support Threads
            </Text>

            <View
              style={{
                backgroundColor: theme.surface,
                borderRadius: radii.xl,
                borderWidth: 1,
                borderColor: theme.hairline,
                overflow: 'hidden',
              }}
            >
              {data.map((conv, idx) => (
                <View key={conv.id}>
                  <InboxListRow conv={conv} userId={userId} />
                  {idx < data.length - 1 && <InboxSeparator />}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function PushNotificationBanner({ onDismiss }: { onDismiss: () => void }) {
  const { theme } = useTheme();
  const bottom = useTabBarClearance();
  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom,
        backgroundColor: theme.surface,
        borderRadius: radii['2xl'],
        borderWidth: 1,
        borderColor: theme.hairline,
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
          backgroundColor: theme.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BellIcon size={18} color={theme.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 13,
            color: theme.ink,
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
            color: theme.mute,
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
          router.push('/settings?open=enhance' as any);
        }}
        style={({ pressed }) => ({
          paddingHorizontal: 13,
          paddingVertical: 8,
          borderRadius: radii.pill,
          backgroundColor: theme.ink,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 12.5,
            color: theme.background,
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
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.hairline,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
          ...shadow.sm,
        })}
      >
        <Feather name="x" size={12} color={theme.mute} />
      </Pressable>
    </View>
  );
}

export default function InboxScreen() {
  const { theme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const { width: pageWidth } = useWindowDimensions();
  const tabBarClearance = useTabBarClearance();

  const params = useLocalSearchParams<{
    tab?: string;
    side?: string;
    justPaid?: string;
    title?: string;
    amount?: string;
  }>();

  const requestedTab: InboxTab =
    params.tab === 'orders' || params.tab === 'support'
      ? (params.tab as InboxTab)
      : 'messages';

  const initialChip: MessageChip =
    params.tab === 'buying' || params.tab === 'selling' || params.tab === 'socials'
      ? (params.tab as MessageChip)
      : 'all';

  const [activeTab, setActiveTab] = useState<InboxTab>(requestedTab);
  const [messageFilter, setMessageFilter] = useState<MessageChip>(initialChip);
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
  const { refetch: inboxRefetch } = inboxQ;

  const pagerRef = useRef<FlatList<{ value: InboxTab; label: string }>>(null);
  const [scrollX] = useState(() => new Animated.Value(0));
  const activeTabRef = useRef<InboxTab>(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  const ignoreListenerUntilRef = useRef(0);

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

  useFocusEffect(
    useCallback(() => {
      inboxRefetch();
    }, [inboxRefetch]),
  );

  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToInbox(userId, () => {
      inboxRefetch();
    });
    return unsub;
  }, [userId, inboxRefetch]);

  // Tab data partition:
  // - Messages: { all, buying, selling, socials }
  // - Support: chats involving Support Bot
  const pageData = useMemo(() => {
    const uid = user?.id;
    if (!uid) {
      return {
        messages: { all: [], buying: [], selling: [], socials: [] },
        support: [],
      };
    }
    const nonSupport = conversations.filter((c) => !isSupportConversation(c));
    const support = conversations.filter((c) => isSupportConversation(c));

    const buying = nonSupport.filter(
      (c) => c.buyer_id === uid && Boolean(c.listing_id || c.listing),
    );
    const selling = nonSupport.filter(
      (c) => c.seller_id === uid && Boolean(c.listing_id || c.listing),
    );
    // Socials: chats without a listing (direct user-to-user messages)
    const socials = nonSupport.filter(
      (c) => !c.listing_id && !c.listing,
    );

    return {
      messages: {
        all: nonSupport,
        buying,
        selling,
        socials,
      },
      support,
    };
  }, [conversations, user?.id]);

  const tabBadges = useMemo(() => {
    let messagesCount = 0;
    let supportCount = 0;
    if (userId) {
      pageData.messages.all.forEach((c) => {
        if (isConversationUnread(c, userId)) messagesCount++;
      });
      pageData.support.forEach((c) => {
        if (isConversationUnread(c, userId)) supportCount++;
      });
    }
    return { messages: messagesCount, support: supportCount };
  }, [pageData, userId]);

  const onRefresh = useCallback(async () => {
    await inboxRefetch();
  }, [inboxRefetch]);

  const goToTab = useCallback(
    (tab: InboxTab) => {
      const to = INBOX_TABS.findIndex((t) => t.value === tab);
      if (to < 0 || pageWidth <= 0) return;
      if (tab === activeTabRef.current) return;
      activeTabRef.current = tab;
      setActiveTab(tab);
      ignoreListenerUntilRef.current = Date.now() + 450;
      pagerRef.current?.scrollToOffset({ offset: to * pageWidth, animated: Platform.OS !== 'web' });
    },
    [pageWidth],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
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

  useEffect(() => {
    if (!params.tab) return;
    if (params.tab === 'orders' || params.tab === 'support') {
      if (params.tab !== activeTabRef.current) {
        goToTab(params.tab as InboxTab);
      }
    } else if (params.tab === 'messages') {
      if (activeTabRef.current !== 'messages') {
        goToTab('messages');
      }
    } else if (params.tab === 'buying' || params.tab === 'selling' || params.tab === 'socials' || params.tab === 'all') {
      if (activeTabRef.current !== 'messages') {
        goToTab('messages');
      }
      setMessageFilter(params.tab as MessageChip);
    }
  }, [params.tab, goToTab]);

  useEffect(() => {
    const target = params.tab && INBOX_TABS.some((t) => t.value === params.tab)
      ? (params.tab as InboxTab)
      : activeTabRef.current;
    const index = INBOX_TABS.findIndex((t) => t.value === target);
    if (index < 0) return;
    pagerRef.current?.scrollToOffset({ offset: index * pageWidth, animated: false });
  }, [pageWidth, params.tab]);

  const [initialScrollIndex] = useState(() => {
    const idx = INBOX_TABS.findIndex((t) => t.value === requestedTab);
    return idx >= 0 ? idx : 0;
  });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 14,
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 18,
            color: theme.ink,
            letterSpacing: -0.2,
          }}
        >
          Inbox
        </Text>
      </View>

      {/* Underline tabs */}
      <UnderlineTabs
        value={activeTab}
        onChange={goToTab}
        scrollX={scrollX}
        pageWidth={pageWidth}
        badges={tabBadges}
      />

      {/* Content */}
      <View style={{ flex: 1 }} onLayout={onPagerLayout}>
        {authLoading || (loading && conversations.length === 0) ? (
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
              if (item.value === 'orders') {
                return (
                  <OrdersInboxPage
                    userId={user.id}
                    pageWidth={pageWidth}
                    pageHeight={pagerHeight}
                    bottomInset={tabBarClearance}
                    initialSide={params.side === 'sold' ? 'sold' : 'bought'}
                    justPaid={params.justPaid}
                    recentTitle={params.title}
                    recentAmount={params.amount}
                  />
                );
              }
              if (item.value === 'support') {
                return (
                  <SupportPage
                    data={pageData.support}
                    userId={user.id}
                    pageWidth={pageWidth}
                    pageHeight={pagerHeight}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    bottomInset={tabBarClearance}
                  />
                );
              }
              return (
                <MessagesPage
                  allData={pageData.messages}
                  userId={user.id}
                  activeChip={messageFilter}
                  onChipChange={setMessageFilter}
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

      {/* Push notification banner */}
      {!bannerDismissed && user && (
        <PushNotificationBanner onDismiss={() => setBannerDismissed(true)} />
      )}
    </SafeAreaView>
  );
}
