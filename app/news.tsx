import { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, radii } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { Tabs, EmptyState } from '@/components/ui';
import { safeBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import {
  deleteSavedSearch,
  fetchNewMatchesCount,
  listSavedSearches,
  type SavedSearch,
} from '@/lib/savedSearches';

type NewsTab = 'following' | 'foryou' | 'searches';

export default function NewsScreen() {
  const [activeTab, setActiveTab] = useState<NewsTab>('following');
  const { user } = useAuth();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
  const matchCountsRef = useRef<Record<string, number>>(matchCounts);
  useEffect(() => {
    matchCountsRef.current = matchCounts;
  }, [matchCounts]);
  // Distinguish "we haven't fetched yet" from "we fetched and found nothing".
  // Without this, the moment the user taps Saved we'd flash the empty state
  // before the request even fires, because activeTab flips before useEffect
  // runs and `loadingSearches` is still false.
  const [searchesFetched, setSearchesFetched] = useState(false);
  const [loadingSearches, setLoadingSearches] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Pull saved searches whenever the user lands on the Saved tab and is
  // signed in. We hydrate the "new matches" counts in parallel — the badge
  // is supplementary so a failure here just leaves the badge off.
  const refreshSearches = useCallback(async () => {
    if (!user?.id) {
      setSearches([]);
      setMatchCounts({});
      setSearchesFetched(true);
      return;
    }
    setLoadingSearches(true);
    try {
      const rows = await listSavedSearches(user.id);
      setSearches(rows);
      if (rows.length === 0) {
        setMatchCounts({});
        return;
      }
      const pairs = await Promise.all(
        rows.map(async (s) => {
          try {
            return [s.id, await fetchNewMatchesCount(s.id)] as const;
          } catch (err) {
            console.warn('[news] fetchNewMatchesCount failed for', s.id, err);
            // Clear the count on failure instead of preserving a stale badge
            return [s.id, 0] as const;
          }
        }),
      );
      setMatchCounts(Object.fromEntries(pairs));
    } catch (e) {
      console.warn('[news] refreshSearches failed', e);
    } finally {
      setLoadingSearches(false);
      setSearchesFetched(true);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab !== 'searches') return;
      refreshSearches();
    }, [activeTab, refreshSearches]),
  );

  // Pull-to-refresh. Saved searches is the only data-backed tab, so that's what
  // we re-pull; the spinner gives feedback on the other tabs regardless.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSearches();
    } finally {
      setRefreshing(false);
    }
  }, [refreshSearches]);

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
          onPress: async () => {
            const ok = await deleteSavedSearch(s.id);
            if (ok) {
              setSearches((prev) => prev.filter((row) => row.id !== s.id));
              setMatchCounts((prev) => {
                const next = { ...prev };
                delete next[s.id];
                return next;
              });
            }
          },
        },
      ]);
    },
    [],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>Activity</Text>
        <Pressable
          disabled={true}
          accessibilityRole="button"
          accessibilityLabel="Mark all activity as read"
          accessibilityState={{ disabled: true }}
          hitSlop={HIT_SLOP_8}
          style={() => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.25, // Disabled appearance
          })}
        >
          <Feather name="check-square" size={18} color={colors.ink} />
        </Pressable>
      </View>

      {/* Tabs */}
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
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
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
            ) : !searchesFetched || (loadingSearches && searches.length === 0) ? (
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
                            {count > 0 ? `${count} new match${count === 1 ? '' : 'es'}` : 'No new matches'}
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
    </SafeAreaView>
  );
}
