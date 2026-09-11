import { useCallback, useMemo } from 'react';
import { View, FlatList, RefreshControl, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { usePriceDropsQuery, useMyFeedListingsQuery } from '@/lib/queries';
import { BRAND } from '@/lib/brand';
import { NewsActivityRow, type ActivityItem } from './NewsActivityRow';
import type { Listing } from '@/types';

function RowSeparator() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.hairline, marginLeft: 72 }} />;
}

export function ForYouTab({ bottomInset = 24 }: { bottomInset?: number }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const priceDropsQ = usePriceDropsQuery(userId);
  const myFeedQ = useMyFeedListingsQuery(userId);

  const refreshing = priceDropsQ.isRefetching || myFeedQ.isRefetching;

  const onRefresh = useCallback(async () => {
    await Promise.all([
      priceDropsQ.refetch(),
      myFeedQ.refetch(),
    ]);
  }, [priceDropsQ, myFeedQ]);

  const activities = useMemo<ActivityItem[]>(() => {
    const list: ActivityItem[] = [];

    // 1. Price drops on liked items
    const drops = priceDropsQ.data ?? [];
    drops.forEach((d) => {
      list.push({
        id: `drop-${d.id}-${d.changed_at}`,
        kind: 'price_drop',
        listing: d as any,
        created_at: d.changed_at || d.created_at,
      });
    });

    // 2. Personalized recommendations
    const feed = myFeedQ.data ?? [];
    feed.slice(0, 16).forEach((listing: Listing) => {
      const seller = listing.seller;
      list.push({
        id: `foryou-${listing.id}`,
        kind: 'listing_created',
        actor: {
          id: seller?.id || 'curator',
          username: seller?.username || BRAND,
          full_name: seller?.full_name || 'Recommended for you',
          avatar_url: seller?.avatar_url,
        },
        listing,
        created_at: listing.created_at,
      });
    });

    return list;
  }, [priceDropsQ.data, myFeedQ.data]);

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
            icon="heart"
            title="No personalized updates yet"
            description="Like items and save searches to receive real-time price drop notifications and curated drop alerts."
            cta={{
              label: 'Discover items',
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
