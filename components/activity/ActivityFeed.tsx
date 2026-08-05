import { useCallback, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Text } from '@/lib/rnText';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { Tabs, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  useDeleteSavedSearch,
  useSavedSearchMatchesQuery,
  useSavedSearchesQuery,
} from '@/lib/queries';
import { type SavedSearch } from '@/lib/savedSearches';

type ActivityTab = 'following' | 'foryou' | 'searches';

// Stable references so the query fallbacks below don't churn on every render.
const EMPTY_SEARCHES: SavedSearch[] = [];
const EMPTY_COUNTS: Record<string, number> = {};

type Props = {
  /**
   * Padding under the last row. The standalone /news route sits above nothing
   * and passes the default; the Inbox's Activity page passes the floating tab
   * dock's clearance so the final saved search isn't parked behind it.
   */
  bottomInset?: number;
};

/**
 * The Activity body: pill tabs over "Following", "For you" and saved searches.
 *
 * Lives apart from any one screen because it has two mounts — the standalone
 * /news route (still linked from Discover's save-search flow) and the Activity
 * page of the Inbox pager, which is how you actually reach it now that the
 * profile's bell is gone.
 *
 * Both the rows and their "N new" counts come from shared React Query caches,
 * which is also what the Inbox's Activity badge sums — so the badge and this
 * list always read the same numbers.
 */
export function ActivityFeed({ bottomInset = 24 }: Props) {
  const [activeTab, setActiveTab] = useState<ActivityTab>('following');
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const searchesQ = useSavedSearchesQuery(userId);
  const searches = searchesQ.data ?? EMPTY_SEARCHES;
  const matchesQ = useSavedSearchMatchesQuery(userId, searches);
  const matchCounts = matchesQ.data?.counts ?? EMPTY_COUNTS;
  const deleteSearch = useDeleteSavedSearch(userId);

  const { refetch: searchesRefetch, isStale: searchesStale } = searchesQ;
  const { refetch: matchesRefetch, isStale: matchesStale } = matchesQ;

  // Revalidate on focus, but only what's actually stale — returning from a
  // saved search that was just marked seen should drop its count, while idly
  // re-focusing the Inbox shouldn't re-run N match RPCs.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (searchesStale) searchesRefetch();
      if (matchesStale) matchesRefetch();
    }, [userId, searchesStale, searchesRefetch, matchesStale, matchesRefetch]),
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([searchesRefetch(), matchesRefetch()]);
  }, [searchesRefetch, matchesRefetch]);

  const applySearch = useCallback((s: SavedSearch) => {
    const params = new URLSearchParams();
    if (s.query) params.set('q', s.query);
    if (s.category) params.set('category', s.category);
    params.set('savedId', s.id);
    router.push(`/discover?${params.toString()}` as any);
  }, []);

  const confirmDelete = useCallback(
    (s: SavedSearch) => {
      // Alert.alert works on both native and web (shim installed in _layout).
      Alert.alert('Delete saved search?', s.label ?? '', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          // The mutation drops the row from cache optimistically and rolls
          // back if the server rejects.
          onPress: () => deleteSearch.mutate(s.id),
        },
      ]);
    },
    [deleteSearch],
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Tabs — pills, deliberately a different shape from the Inbox's
          underline tabs above them so the two rows don't read as rival tab
          bars when this is embedded there. */}
      <View style={{ marginTop: 12 }}>
        <Tabs
          variant="pill"
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: 'following', label: 'Following', icon: 'users' },
            { value: 'foryou', label: 'For you', icon: 'compass' },
            { value: 'searches', label: 'Saved', icon: 'bookmark', count: searches.length },
          ]}
        />
      </View>

      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={searchesQ.isRefetching || matchesQ.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.purple}
          />
        }
      >
        {activeTab === 'following' && (
          <EmptyState
            icon="users"
            title="Quiet on this side"
            description="Once people you follow post or sell, you'll see it here."
          />
        )}
        {activeTab === 'foryou' && (
          <EmptyState
            icon="bell"
            title="Nothing for you yet"
            description="We'll surface listings you'll love based on what you save and search."
          />
        )}
        {activeTab === 'searches' && (
          <View>
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
                <ActivityIndicator color={colors.purple} />
              </View>
            ) : searches.length === 0 ? (
              <EmptyState
                icon="bookmark"
                title="No saved searches"
                description="Save a search and we'll alert you when something matches."
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
                        backgroundColor: colors.white,
                        borderWidth: 1,
                        borderColor: colors.hairline,
                        borderRadius: radii.xl,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
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
                            backgroundColor: colors.purpleSoft,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Feather name="search" size={16} color={colors.purple} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '800',
                              color: colors.ink,
                            }}
                            numberOfLines={1}
                          >
                            {s.label ?? s.query ?? 'Saved search'}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.mute, marginTop: 2 }}>
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
                        <Feather name="x" size={14} color={colors.mute} />
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
