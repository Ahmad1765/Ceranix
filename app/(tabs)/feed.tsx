import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors, radii } from '@/lib/theme';
import {
  fetchPriceDrops,
  fetchNewFromFollowed,
  fetchSimilarToLiked,
  type PriceDropListing,
} from '@/lib/myFeed';
import { fetchListings } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { PriceDropCard } from '@/components/PriceDropCard';
import { useGridDimensions } from '@/lib/responsive';
import type { Listing } from '@/types';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const STRIP_CARD_WIDTH = 130;

export default function MyFeedScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const [priceDrops, setPriceDrops] = useState<PriceDropListing[]>([]);
  const [followedNew, setFollowedNew] = useState<Listing[]>([]);
  const [picked, setPicked] = useState<Listing[]>([]);
  const [pickedIsFallback, setPickedIsFallback] = useState(false);

  const [loadingDrops, setLoadingDrops] = useState(true);
  const [loadingFollowed, setLoadingFollowed] = useState(true);
  const [loadingPicked, setLoadingPicked] = useState(true);

  const { columns, cardWidth } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoadingDrops(true);
        setLoadingFollowed(true);
        setLoadingPicked(true);
      }

      // Run all three sections in parallel — each section commits its own
      // state independently so a slow loader doesn't block the others.
      const dropsP = user?.id
        ? fetchPriceDrops(user.id).then((r) => {
            if (r.ok) setPriceDrops(r.rows);
            setLoadingDrops(false);
          })
        : Promise.resolve(setLoadingDrops(false));

      const followedP = user?.id
        ? fetchNewFromFollowed(user.id).then((r) => {
            if (r.ok) setFollowedNew(r.rows);
            setLoadingFollowed(false);
          })
        : Promise.resolve(setLoadingFollowed(false));

      const pickedP = user?.id
        ? fetchSimilarToLiked(user.id).then(async (r) => {
            if (r.ok && r.rows.length > 0) {
              setPicked(r.rows);
              setPickedIsFallback(false);
            } else {
              const fallback = await fetchListings({ tab: 'popular', limit: 30 });
              setPicked(fallback);
              setPickedIsFallback(true);
            }
            setLoadingPicked(false);
          })
        : fetchListings({ tab: 'popular', limit: 30 }).then((rows) => {
            setPicked(rows);
            setPickedIsFallback(true);
            setLoadingPicked(false);
          });

      await Promise.all([dropsP, followedP, pickedP]);
    },
    [user?.id],
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useFocusEffect(
    useCallback(() => {
      loadAll({ silent: true });
    }, [loadAll]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll({ silent: true });
    setRefreshing(false);
  }, [loadAll]);

  const showColdStartBanner = !user;
  const showFollowCta =
    !!user && followedNew.length === 0 && priceDrops.length === 0 && pickedIsFallback;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {/* Title */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
            My Feed
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.muteSoft,
              marginTop: 2,
              letterSpacing: -0.1,
            }}
          >
            Curated from what you like
          </Text>
        </View>

        {showColdStartBanner ? (
          <Pressable
            onPress={() => router.push('/auth/login')}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.purpleSoft,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Feather name="user-plus" size={16} color={colors.purple} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontWeight: '600' }}>
              Sign in and like a few items to see this feed personalize itself.
            </Text>
          </Pressable>
        ) : null}

        {showFollowCta ? (
          <Pressable
            onPress={() => router.push('/(tabs)/discover')}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.purpleSoft,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Feather name="compass" size={16} color={colors.purple} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontWeight: '600' }}>
              Follow some sellers or like a few items to start personalizing your feed.
            </Text>
          </Pressable>
        ) : null}

        <PriceDropsSection rows={priceDrops} loading={loadingDrops} />
        <FollowedSection rows={followedNew} loading={loadingFollowed} />
        <PickedSection
          rows={picked}
          loading={loadingPicked}
          isFallback={pickedIsFallback}
          columns={columns}
          cardWidth={cardWidth}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({
  label,
  caption,
  rightAction,
}: {
  label: string;
  caption?: string;
  rightAction?: { text: string; onPress: () => void };
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.purple,
              marginRight: 8,
            }}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: colors.ink,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </Text>
        </View>
        {rightAction ? (
          <Pressable hitSlop={8} onPress={rightAction.onPress}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.purple }}>
              {rightAction.text}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {caption ? (
        <Text style={{ fontSize: 13, color: colors.muteSoft, marginTop: 4 }}>{caption}</Text>
      ) : null}
    </View>
  );
}

function HorizontalSkeleton({ width = STRIP_CARD_WIDTH }: { width?: number }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width }}>
          <View
            style={{
              width,
              aspectRatio: 1,
              borderRadius: 12,
              backgroundColor: 'rgba(15,15,15,0.06)',
            }}
          />
          <View
            style={{
              marginTop: 6,
              height: 10,
              width: width * 0.7,
              backgroundColor: 'rgba(15,15,15,0.06)',
              borderRadius: 4,
            }}
          />
          <View
            style={{
              marginTop: 4,
              height: 10,
              width: width * 0.4,
              backgroundColor: 'rgba(15,15,15,0.06)',
              borderRadius: 4,
            }}
          />
        </View>
      ))}
    </View>
  );
}

function PriceDropsSection({
  rows,
  loading,
}: {
  rows: PriceDropListing[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <>
        <SectionHeader label="Price drops" />
        <HorizontalSkeleton />
      </>
    );
  }
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeader
        label="Price drops"
        caption={`${rows.length} ${rows.length === 1 ? 'item' : 'items'} you liked got cheaper`}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      >
        {rows.map((l) => (
          <PriceDropCard key={l.id} listing={l} />
        ))}
      </ScrollView>
    </>
  );
}

function FollowedSection({
  rows,
  loading,
}: {
  rows: Listing[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <>
        <SectionHeader label="New from sellers you follow" />
        <HorizontalSkeleton />
      </>
    );
  }
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeader
        label="New from sellers you follow"
        rightAction={{ text: 'See all', onPress: () => router.push('/' as any) }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      >
        {rows.map((l) => (
          <View key={l.id} style={{ width: STRIP_CARD_WIDTH }}>
            <ListingCard listing={l} />
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function PickedSection({
  rows,
  loading,
  isFallback,
  columns,
  cardWidth,
}: {
  rows: Listing[];
  loading: boolean;
  isFallback: boolean;
  columns: number;
  cardWidth: number;
}) {
  if (loading) {
    return (
      <>
        <SectionHeader label="Picked for you" />
        <View style={{ paddingHorizontal: HORIZONTAL_PAD, flexDirection: 'row', gap: GRID_GAP }}>
          {Array.from({ length: columns }).map((_, i) => (
            <View
              key={i}
              style={{
                width: cardWidth,
                aspectRatio: 1,
                borderRadius: 12,
                backgroundColor: 'rgba(15,15,15,0.06)',
              }}
            />
          ))}
        </View>
      </>
    );
  }
  if (rows.length === 0) return null;
  const label = isFallback ? 'Popular right now' : 'Picked for you';
  const caption = isFallback ? undefined : "Based on what you've liked";
  const grid: Listing[][] = [];
  for (let i = 0; i < rows.length; i += columns) grid.push(rows.slice(i, i + columns));
  return (
    <>
      <SectionHeader label={label} caption={caption} />
      <View style={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}>
        {grid.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: GRID_GAP }}>
            {row.map((listing) => (
              <View key={listing.id} style={{ width: cardWidth }}>
                <ListingCard listing={listing} />
              </View>
            ))}
            {row.length < columns &&
              Array.from({ length: columns - row.length }).map((_, i) => (
                <View key={`pad-${i}`} style={{ width: cardWidth }} />
              ))}
          </View>
        ))}
      </View>
    </>
  );
}
