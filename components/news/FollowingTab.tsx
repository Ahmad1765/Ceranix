import { useCallback, useMemo } from 'react';
import { View, FlatList, RefreshControl, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useNewFromFollowedQuery } from '@/lib/queries';
import { useOpenedNewsIds } from '@/lib/newsStorage';
import { NewsSkeletonList } from './NewsRowSkeleton';
import { NewsActivityRow, type ActivityItem } from './NewsActivityRow';
import type { Listing } from '@/types';

function RowSeparator() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border, width: '100%' }} />;
}

export function FollowingTab({ bottomInset = 24 }: { bottomInset?: number }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { openedIds } = useOpenedNewsIds();
  const userId = user?.id ?? null;

  // News notifications strictly from followed accounts only
  const followedQ = useNewFromFollowedQuery(userId);

  const isLoading = userId ? followedQ.isLoading : false;
  const refreshing = followedQ.isRefetching;

  const onRefresh = useCallback(async () => {
    await followedQ.refetch();
  }, [followedQ]);

  const activities = useMemo<ActivityItem[]>(() => {
    const followedListings = followedQ.data ?? [];

    return followedListings.map((listing: Listing) => {
      const seller = listing.seller;
      return {
        id: `listing-${listing.id}`,
        kind: 'listing_created' as const,
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
  }, [followedQ.data]);

  const renderItem = useCallback(
    ({ item }: { item: ActivityItem }) => (
      <NewsActivityRow item={item} isRead={openedIds.has(item.id)} />
    ),
    [openedIds],
  );

  if (isLoading && activities.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <NewsSkeletonList count={5} />
      </View>
    );
  }

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
