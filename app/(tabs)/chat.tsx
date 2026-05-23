import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
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

type InboxTab = 'All' | 'Selling' | 'Buying';
const INBOX_TABS: InboxTab[] = ['All', 'Selling', 'Buying'];

const BRAND_PURPLE = '#6C47FF';
const BRAND_INK = '#0a0a0a';
const BRAND_LIME = '#d8f53a';

function SignedOutState() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#f3f0ff', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Feather name="message-circle" size={28} color={BRAND_PURPLE} />
      </View>
      <Text style={{ fontSize: 19, fontWeight: '800', color: BRAND_INK, marginBottom: 6 }}>
        Sign in to chat
      </Text>
      <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20, marginBottom: 18 }}>
        Your conversations with buyers and sellers live here.
      </Text>
      <Pressable
        onPress={() => router.push('/auth/login' as any)}
        style={({ pressed }) => ({
          backgroundColor: BRAND_INK,
          paddingHorizontal: 26,
          paddingVertical: 12,
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Sign in</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ tab }: { tab: InboxTab }) {
  const msg =
    tab === 'Selling'
      ? 'No buyers in your inbox yet.\nList something to start the conversation.'
      : tab === 'Buying'
      ? "You haven't reached out yet.\nFound something you love? Send the seller a message."
      : 'Seems to be empty here ✨\nMessages from buyers and sellers will appear here.';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 100 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#eee', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Feather name="message-square" size={24} color="#9ca3af" />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '700', color: BRAND_INK, marginBottom: 6, textAlign: 'center' }}>
        Nothing here yet
      </Text>
      <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19 }}>
        {msg}
      </Text>
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
  const avatar = other?.avatar_url
    ? getOptimizedImageUrl(other.avatar_url, { width: 120 })
    : null;
  const unreadHint = conv.last_sender_id && conv.last_sender_id !== userId;
  const preview = conv.last_message ?? 'Tap to start the conversation';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: pressed ? '#fafafa' : 'transparent',
      })}
    >
      <View style={{ position: 'relative', marginRight: 12 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: '#f3f4f6',
            overflow: 'hidden',
          }}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={120} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="user" size={22} color="#9ca3af" />
            </View>
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
              borderRadius: 6,
              borderWidth: 2,
              borderColor: 'white',
              overflow: 'hidden',
              backgroundColor: '#f3f4f6',
            }}
          >
            <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_INK, flexShrink: 1 }} numberOfLines={1}>
            {other?.full_name || other?.username || 'Unknown'}
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>
            {formatChatTime(conv.updated_at)}
          </Text>
        </View>
        {conv.listing?.title && (
          <Text style={{ fontSize: 12, color: BRAND_PURPLE, fontWeight: '600', marginBottom: 2 }} numberOfLines={1}>
            {conv.listing.title}{conv.listing.is_sold ? ' · Sold' : ''}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: unreadHint ? BRAND_INK : '#6b7280',
              fontWeight: unreadHint ? '600' : '400',
            }}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {unreadHint && (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND_PURPLE, marginLeft: 8 }} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function InboxScreen() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<InboxTab>('All');
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const load = useCallback(async () => {
    if (!user?.id) {
      setConversations([]);
      setLoading(false);
      return;
    }
    const rows = await listConversations(user.id);
    setConversations(rows);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setLoading((prev) => (conversations.length === 0 ? true : prev));
      load().finally(() => {
        if (cancelled) return;
      });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, load]),
  );

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToInbox(user.id, () => {
      load();
    });
    return unsub;
  }, [user?.id, load]);

  const filtered = useMemo(() => {
    if (!user?.id) return conversations;
    if (activeTab === 'Selling') return conversations.filter((c) => c.seller_id === user.id);
    if (activeTab === 'Buying') return conversations.filter((c) => c.buyer_id === user.id);
    return conversations;
  }, [activeTab, conversations, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: BRAND_INK, letterSpacing: -0.4 }}>
          Inbox
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {conversations.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f0ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND_PURPLE, marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND_PURPLE }}>
                {conversations.length} {conversations.length === 1 ? 'thread' : 'threads'}
              </Text>
            </View>
          )}
          <Pressable onPress={onRefresh} hitSlop={8}>
            <Feather name="refresh-cw" size={18} color={BRAND_INK} />
          </Pressable>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f1f1', paddingHorizontal: 8 }}>
        {INBOX_TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: active ? '800' : '500',
                  color: active ? BRAND_INK : '#9ca3af',
                  letterSpacing: -0.1,
                }}
              >
                {tab}
              </Text>
              {active && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    height: 3,
                    width: 28,
                    backgroundColor: BRAND_INK,
                    borderRadius: 2,
                  }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {authLoading || (loading && conversations.length === 0) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND_PURPLE} />
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
            <View style={{ height: 1, backgroundColor: '#f5f5f5', marginLeft: 80 }} />
          )}
          ListEmptyComponent={<EmptyState tab={activeTab} />}
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND_PURPLE} />}
        />
      )}
    </SafeAreaView>
  );
}
