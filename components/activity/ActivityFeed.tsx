import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Text } from '@/lib/rnText';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { radii, shadow, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { Tabs, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  useDeleteSavedSearch,
  useSavedSearchMatchesQuery,
  useSavedSearchesQuery,
  useInboxQuery,
} from '@/lib/queries';
import { type SavedSearch } from '@/lib/savedSearches';
import { isSupportConversation } from '@/lib/support';
import { type ConversationRow } from '@/lib/chat';
import { InboxRow } from '@/components/chat/InboxRow';

type ActivityTab = 'following' | 'foryou' | 'searches';

const EMPTY_SEARCHES: SavedSearch[] = [];
const EMPTY_COUNTS: Record<string, number> = {};
const EMPTY_CONVERSATIONS: ConversationRow[] = [];

type Props = {
  bottomInset?: number;
};

export function ActivityFeed({ bottomInset = 24 }: Props) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActivityTab>('following');
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const searchesQ = useSavedSearchesQuery(userId);
  const searches = searchesQ.data ?? EMPTY_SEARCHES;
  const matchesQ = useSavedSearchMatchesQuery(userId, searches);
  const matchCounts = matchesQ.data?.counts ?? EMPTY_COUNTS;
  const deleteSearch = useDeleteSavedSearch(userId);

  const inboxQ = useInboxQuery(userId);
  const conversations = inboxQ.data ?? EMPTY_CONVERSATIONS;

  // Filter direct profile messages (conversations without a listing, not support bot)
  const directMessages = useMemo(
    () => conversations.filter((c) => !c.listing_id && !isSupportConversation(c)),
    [conversations],
  );

  const { refetch: searchesRefetch, isStale: searchesStale } = searchesQ;
  const { refetch: matchesRefetch, isStale: matchesStale } = matchesQ;
  const { refetch: inboxRefetch, isStale: inboxStale } = inboxQ;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (searchesStale) searchesRefetch();
      if (matchesStale) matchesRefetch();
      if (inboxStale) inboxRefetch();
    }, [userId, searchesStale, searchesRefetch, matchesStale, matchesRefetch, inboxStale, inboxRefetch]),
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([searchesRefetch(), matchesRefetch(), inboxRefetch()]);
  }, [searchesRefetch, matchesRefetch, inboxRefetch]);

  const applySearch = useCallback((s: SavedSearch) => {
    const params = new URLSearchParams();
    if (s.query) params.set('q', s.query);
    if (s.category) params.set('category', s.category);
    params.set('savedId', s.id);
    router.push(`/discover?${params.toString()}` as any);
  }, []);

  const confirmDelete = useCallback(
    (s: SavedSearch) => {
      Alert.alert('Delete saved search?', s.label ?? '', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSearch.mutate(s.id),
        },
      ]);
    },
    [deleteSearch],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Tabs */}
      <View style={{ marginTop: 12 }}>
        <Tabs
          variant="pill"
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            {
              value: 'following',
              label: 'Following',
              icon: 'users',
              count: directMessages.length > 0 ? directMessages.length : undefined,
            },
            { value: 'foryou', label: 'For you', icon: 'compass' },
            { value: 'searches', label: 'Saved', icon: 'bookmark', count: searches.length },
          ]}
        />
      </View>

      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 30 }}
        refreshControl={
          <RefreshControl
            refreshing={searchesQ.isRefetching || matchesQ.isRefetching || inboxQ.isRefetching}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {activeTab === 'following' && (
          <View style={{ paddingTop: 10 }}>
            {directMessages.length > 0 ? (
              <View>
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: typography.family.sansBold,
                      fontSize: 11.5,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: theme.muteSoft,
                    }}
                  >
                    Direct Profile Messages
                  </Text>
                  <Text
                    style={{
                      fontFamily: typography.family.sansMedium,
                      fontSize: 12,
                      color: theme.primary,
                    }}
                  >
                    {directMessages.length} {directMessages.length === 1 ? 'chat' : 'chats'}
                  </Text>
                </View>

                {directMessages.map((conv) => (
                  <View key={conv.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                    <InboxRow
                      conv={conv}
                      userId={userId || ''}
                      onPress={() => router.push(`/conversation/${conv.id}` as any)}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="users"
                title="No direct messages yet"
                description="When you message creators directly through their profile or people you follow message you, they'll appear here."
                cta={{
                  label: 'Find Sellers to Follow',
                  icon: 'search',
                  onPress: () => router.push('/discover' as any),
                }}
              />
            )}
          </View>
        )}

        {activeTab === 'foryou' && (
          <View style={{ paddingTop: 14 }}>
            <EmptyState
              icon="bell"
              title="Nothing new for you yet"
              description="We'll surface special price drops and curated updates from your favorite categories here."
              cta={{
                label: 'Explore Discover',
                icon: 'compass',
                onPress: () => router.push('/discover' as any),
              }}
            />
          </View>
        )}

        {activeTab === 'searches' && (
          <View style={{ paddingTop: 6 }}>
            {!user ? (
              <EmptyState
                icon="bookmark"
                title="Sign in to save searches"
                description="We'll alert you when something new matches what you're looking for."
                cta={{
                  label: 'Sign in',
                  icon: 'log-in',
                  onPress: () => router.push('/auth/login' as any),
                }}
              />
            ) : searchesQ.isLoading ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : searches.length === 0 ? (
              <EmptyState
                icon="bookmark"
                title="No saved searches"
                description="Save a search in Discover and we'll alert you whenever new pieces match."
                cta={{
                  label: 'Search now',
                  icon: 'search',
                  onPress: () => router.push('/discover' as any),
                }}
              />
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
                {searches.map((s) => {
                  const count = matchCounts[s.id] ?? 0;
                  return (
                    <View
                      key={s.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: theme.surface,
                        borderWidth: 1,
                        borderColor: theme.hairline,
                        borderRadius: radii.xl,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        ...shadow.sm,
                      }}
                    >
                      <Pressable
                        onPress={() => applySearch(s)}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                      >
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: theme.primarySoft,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Feather name="search" size={16} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              fontFamily: typography.family.sansBold,
                              fontSize: 14,
                              color: theme.ink,
                            }}
                            numberOfLines={1}
                          >
                            {s.label ?? s.query ?? 'Saved search'}
                          </Text>
                          <Text style={{ fontFamily: typography.family.sans, fontSize: 12, color: theme.mute, marginTop: 2 }}>
                            {count > 0
                              ? `${count} new match${count === 1 ? '' : 'es'}`
                              : 'No new matches'}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDelete(s)}
                        hitSlop={HIT_SLOP_8}
                        testID={`saved-search-delete-${s.id}`}
                        style={({ pressed }) => ({
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: pressed ? 0.6 : 1,
                        })}
                      >
                        <Feather name="x" size={14} color={theme.mute} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
