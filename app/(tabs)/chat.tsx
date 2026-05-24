import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  listConversations,
  subscribeToInbox,
  formatChatTime,
  otherParticipant,
  type ConversationRow,
} from '@/lib/chat';
import { getOptimizedImageUrl } from '@/lib/images';
import { colors, radii } from '@/lib/theme';
import { Tabs, EmptyState } from '@/components/ui';
import { HIT_SLOP_8 } from '@/lib/responsive';

type InboxTab = 'all' | 'selling' | 'buying';

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
    ? getOptimizedImageUrl(conv.listing.images[0], { width: 200 })
    : null;
  const avatar = other?.avatar_url ? getOptimizedImageUrl(other.avatar_url, { width: 120 }) : null;
  const isUnread = !!conv.last_sender_id && conv.last_sender_id !== userId;
  const preview = conv.last_message ?? 'Tap to start the conversation';
  const initial = (other?.full_name || other?.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      {/* Avatar with listing peek */}
      <View style={{ position: 'relative', marginRight: 12 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: colors.panel,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
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
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.purple }}>{initial}</Text>
          )}
        </View>
        {thumb && (
          <View
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: 22,
              height: 22,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: 'white',
              overflow: 'hidden',
              backgroundColor: colors.panel,
            }}
          >
            <Image
              source={{ uri: thumb }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </View>
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: isUnread ? '800' : '700',
              color: colors.ink,
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {other?.full_name || other?.username || 'Unknown'}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muteSoft, marginLeft: 8 }}>
            {formatChatTime(conv.updated_at)}
          </Text>
        </View>
        {conv.listing?.title && (
          <Text
            style={{
              fontSize: 12.5,
              color: colors.purple,
              fontWeight: '700',
              marginBottom: 2,
            }}
            numberOfLines={1}
          >
            {conv.listing.title}
            {conv.listing.is_sold ? ' · Sold' : ''}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: isUnread ? colors.ink : colors.mute,
              fontWeight: isUnread ? '600' : '400',
            }}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {isUnread && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.purple,
                marginLeft: 8,
              }}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function InboxScreen() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<InboxTab>('all');
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // Stable loader without setLoading side-effects.
  const fetchInbox = useCallback(async (uid: string) => {
    return listConversations(uid);
  }, []);

  // Initial load explicitly tied to user.id arrival. This was the bug:
  // useFocusEffect alone wouldn't re-fire after auth resolved.
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

  // Silent re-fetch on tab focus.
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      fetchInbox(user.id).then((rows) => setConversations(rows));
    }, [user?.id, fetchInbox]),
  );

  // Realtime subscription for new messages.
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToInbox(user.id, () => {
      fetchInbox(user.id).then((rows) => setConversations(rows));
    });
    return unsub;
  }, [user?.id, fetchInbox]);

  const filtered = useMemo(() => {
    if (!user?.id) return conversations;
    if (activeTab === 'selling') return conversations.filter((c) => c.seller_id === user.id);
    if (activeTab === 'buying') return conversations.filter((c) => c.buyer_id === user.id);
    return conversations;
  }, [activeTab, conversations, user?.id]);

  const unreadCount = useMemo(
    () =>
      conversations.filter((c) => !!c.last_sender_id && c.last_sender_id !== user?.id).length,
    [conversations, user?.id],
  );

  const onRefresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    const rows = await fetchInbox(user.id);
    setConversations(rows);
    setRefreshing(false);
  }, [user?.id, fetchInbox]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
            Inbox
          </Text>
          {unreadCount > 0 && (
            <View
              style={{
                backgroundColor: colors.purple,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>
                {unreadCount} new
              </Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={onRefresh}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.panel,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="refresh-cw" size={16} color={colors.ink} />
        </Pressable>
      </View>

      {/* Pill tabs */}
      <View style={{ paddingBottom: 6 }}>
        <Tabs
          variant="pill"
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: 'all', label: 'All', icon: 'inbox', count: conversations.length },
            {
              value: 'buying',
              label: 'Buying',
              icon: 'shopping-bag',
              count: conversations.filter((c) => c.buyer_id === user?.id).length,
            },
            {
              value: 'selling',
              label: 'Selling',
              icon: 'tag',
              count: conversations.filter((c) => c.seller_id === user?.id).length,
            },
          ]}
        />
      </View>

      {/* Content */}
      {authLoading || (loading && conversations.length === 0) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : !user ? (
        <SignedOutState />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationRowItem
              conv={item}
              userId={user.id}
              onPress={() => router.push(`/conversation/${item.id}` as any)}
            />
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.hairline, marginLeft: 80 }} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={activeTab === 'selling' ? 'tag' : activeTab === 'buying' ? 'shopping-bag' : 'message-square'}
              title={
                activeTab === 'selling'
                  ? 'No buyer chats yet'
                  : activeTab === 'buying'
                    ? 'No conversations yet'
                    : "It's quiet here"
              }
              description={
                activeTab === 'selling'
                  ? 'Post a great listing and buyers will reach out.'
                  : activeTab === 'buying'
                    ? 'Found something you love? Tap message on the listing.'
                    : 'Messages from buyers and sellers will appear here.'
              }
            />
          }
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
          }
        />
      )}
    </SafeAreaView>
  );
}
