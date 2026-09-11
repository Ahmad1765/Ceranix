import { useCallback, useMemo } from 'react';
import { View, FlatList, RefreshControl, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useNewFromFollowedQuery, useFeedListingsQuery } from '@/lib/queries';
import { NewsActivityRow, type ActivityItem } from './NewsActivityRow';
import type { Listing } from '@/types';

function RowSeparator() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.hairline, marginLeft: 72 }} />;
}

export function FollowingTab({ bottomInset = 24 }: { bottomInset?: number }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Followed listings
  const followedQ = useNewFromFollowedQuery(userId);
  // Community active listings as fallback/discover feed if followed is empty
  const communityQ = useFeedListingsQuery({ tab: 'popular', limit: 16 });

  const refreshing = followedQ.isRefetching || communityQ.isRefetching;

  const onRefresh = useCallback(async () => {
    await Promise.all([
      followedQ.refetch(),
      communityQ.refetch(),
    ]);
  }, [followedQ, communityQ]);

  const activities = useMemo<ActivityItem[]>(() => {
    const followedListings = followedQ.data ?? [];
    const communityListings = communityQ.data ?? [];

    const source = followedListings.length > 0 ? followedListings : communityListings;

    return source.map((listing: Listing) => {
      const seller = listing.seller;
      return {
        id: `listing-${listing.id}`,
        kind: 'listing_created',
        actor: {
          id: seller?.id || 'seller',
          username: seller?.username || 'Seller',
          full_name: seller?.full_name || seller?.username || 'Creator',
          avatar_url: seller?.avatar_url,
        },
        listing,
        created_at: listing.created_at,
      };
    });
  }, [followedQ.data, communityQ.data]);

  const renderItem = useCallback(
    ({ item }: { item: ActivityItem }) => <NewsActivityRow item={item} />,
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={RowSeparator}
        contentContainerStyle={
          activities.length === 0 ? { flex: 1 } : { paddingBottom: bottomInset }
        }
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          <EmptyState
            icon="users"
            title="No activity from followed accounts"
            description="Follow creators, curators, and brands to see their new drops, likes, and follows here."
            cta={{
              label: 'Explore creators',
              icon: 'compass',
              onPress: () => router.push('/' as any),
            }}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.purple}
          />
        }
      />
    </View>
  );
}
