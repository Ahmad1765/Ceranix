import { capture } from '@/lib/analytics';
import { memo, useCallback, useMemo, useState } from 'react';
import { View, Pressable, RefreshControl, Alert, Share, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import Feather from '@expo/vector-icons/Feather';
import Animated from 'react-native-reanimated';
import {
  useProfileQuery,
  useUserListingsQuery,
  useFollowStateQuery,
  useToggleFollow,
} from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { ListingCard } from '@/components/ListingCard';
import { colors, radii } from '@/lib/theme';
import { computeLevel } from '@/lib/levels';
import {
  useGridDimensions,
  HIT_SLOP_8,
  GRID_DRAW_DISTANCE,
  CONTENT_MAX_WIDTH,
} from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';
import { Button, EmptyState, Tabs } from '@/components/ui';
import {
  ProfileBanner,
  ProfileIdentity,
  StatsBar,
  InfoCard,
  CredentialList,
  sellerCredentials,
  bannerHeightFor,
  AVATAR_SIZE,
} from '@/components/profile';

type SellerTab = 'shop' | 'details';

// Module-level so the identity never changes across renders.
const EMPTY_LISTINGS: Listing[] = [];

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = typeof id === 'string' ? id : '';
  const { user: authUser } = useAuth();
  const toast = useToast();
  // 'all' shows everything; sold rows already sort after available ones.
  const [shopFilter, setShopFilter] = useState<'all' | 'available' | 'sold'>('all');
  const [activeTab, setActiveTab] = useState<SellerTab>('shop');

  const fade = useFadeIn(0, 320);
  const { width: viewportWidth } = useWindowDimensions();

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  // React Query owns fetching/caching/retries now. Profile + listings + follow
  // state are three independent queries that dedupe and refetch on their own.
  const profileQ = useProfileQuery(userId);
  const listingsQ = useUserListingsQuery(userId);
  const followQ = useFollowStateQuery(authUser?.id ?? null, userId);
  const toggleFollowM = useToggleFollow(authUser?.id ?? null, userId);

  const profile = profileQ.data ?? null;
  // Stable empty reference — a fresh `[]` per render would make the
  // visibleListings/gridRows memos below recompute on every single render.
  const listings = listingsQ.data ?? EMPTY_LISTINGS;
  // First-load skeleton: only while the primary reads have no data yet.
  const loading = profileQ.isLoading || listingsQ.isLoading;
  // Pull-to-refresh spinner: a refetch while data is already on screen.
  const refreshing = profileQ.isRefetching || listingsQ.isRefetching;
  const followed = followQ.data?.isFollowing ?? false;
  // followQ only runs for a signed-in viewer (get_follow_state requires auth).
  // Signed-out visitors still see real counts via the public profile row.
  const followersCount = followQ.data?.followersCount ?? profile?.followers_count ?? 0;
  const followingCount = followQ.data?.followingCount ?? profile?.following_count ?? 0;
  const followBusy = toggleFollowM.isPending;

  const handleFollowToggle = () => {
    if (!authUser) {
      toast.show('Sign in to follow', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }
    if (!userId || authUser.id === userId || followBusy) return;
    // The mutation handles the optimistic flip + rollback internally.
    toggleFollowM.mutate(
      { currentlyFollowing: followed },
      {
        onSuccess: (next) => {
          if (next.isFollowing) capture('seller_followed', { seller_id: userId });
        },
        onError: (e: any) =>
          toast.show(e?.message ?? 'Could not update follow', {
            variant: 'default',
            icon: 'alert-triangle',
          }),
      },
    );
  };

  const handleMore = () => {
    if (!profile) return;
    const url = `https://carrinex.vercel.app/user/${profile.id}`;
    Alert.alert(`@${profile.username}`, undefined, [
      {
        text: 'Share profile',
        onPress: async () => {
          try {
            await Share.share({ message: `Check out @${profile.username} on Carrinex\n${url}`, url });
          } catch {
            // user dismissed the sheet — nothing to report
          }
        },
      },
      {
        text: 'Report user',
        style: 'destructive',
        onPress: () =>
          toast.show('Thanks — our team will take a look', { variant: 'success', icon: 'flag' }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onRefresh = () => {
    if (!userId) return;
    // Force all reads to revalidate, bypassing staleTime. followQ.refetch()
    // ignores its own `enabled` gate, so only call it for a signed-in viewer —
    // otherwise it 403s against get_follow_state on every pull-to-refresh.
    profileQ.refetch();
    listingsQ.refetch();
    if (authUser?.id) followQ.refetch();
  };

  // ── Virtualized grid ──────────────────────────────────────────────────────
  // The seller's listing grid is the last element on the page, so the existing
  // tree stays intact as the FlashList header and only the rows move into
  // `data` — landing exactly where the inline grid used to be. Empty states are
  // still owned by the header, which is why they aren't re-checked here.
  //
  // These hooks MUST sit above the `loading` / `!profile` early returns below,
  // or the hook order changes between renders.
  const visibleListings = useMemo(
    () =>
      shopFilter === 'available'
        ? listings.filter((l) => !l.is_sold)
        : shopFilter === 'sold'
          ? listings.filter((l) => l.is_sold)
          : listings,
    [listings, shopFilter],
  );

  // The Details panel is part of the header, so the grid must go empty while
  // it's showing — otherwise listing rows would render underneath it.
  const gridRows = useMemo(() => {
    if (activeTab !== 'shop') return [] as Listing[][];
    const out: Listing[][] = [];
    for (let i = 0; i < visibleListings.length; i += columns) {
      out.push(visibleListings.slice(i, i + columns));
    }
    return out;
  }, [activeTab, visibleListings, columns]);

  const renderRow = useCallback(
    ({ item }: { item: Listing[] }) => <GridRow row={item} columns={columns} cardW={cardW} />,
    [columns, cardW],
  );

  const rowKey = useCallback((row: Listing[]) => row[0]?.id ?? 'empty', []);

  if (loading) {
    // Skeleton mirroring the real layout (banner + overlapping avatar + name +
    // stats + grid) instead of a centered spinner, so loading doesn't cause a
    // layout jump when the real content lands.
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ padding: 14 }}>
          <Pressable onPress={() => safeBack()} hitSlop={HIT_SLOP_8}>
            <Feather name="chevron-left" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ height: bannerHeightFor(viewportWidth), backgroundColor: colors.divider }} />
        <View style={{ alignItems: 'center', marginTop: -(AVATAR_SIZE + 8) / 2 }}>
          <View
            style={{
              width: AVATAR_SIZE + 8,
              height: AVATAR_SIZE + 8,
              borderRadius: (AVATAR_SIZE + 8) / 2,
              backgroundColor: colors.divider,
              borderWidth: 4,
              borderColor: colors.white,
            }}
          />
          <View
            style={{
              width: 172,
              height: 20,
              borderRadius: 6,
              backgroundColor: colors.divider,
              marginTop: 14,
            }}
          />
          <View
            style={{
              width: 108,
              height: 12,
              borderRadius: 6,
              backgroundColor: colors.divider,
              marginTop: 8,
            }}
          />
        </View>
        <View
          style={{
            height: 74,
            marginHorizontal: 16,
            marginTop: 20,
            borderRadius: radii.xl,
            backgroundColor: colors.divider,
          }}
        />
        <View
          style={{
            flexDirection: 'row',
            gap: GRID_GAP,
            paddingHorizontal: HORIZONTAL_PAD,
            marginTop: 28,
          }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <View
              key={i}
              style={{
                width: cardW,
                aspectRatio: 1,
                borderRadius: radii.md,
                backgroundColor: colors.divider,
              }}
            />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => safeBack()} hitSlop={HIT_SLOP_8}>
            <Feather name="chevron-left" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <EmptyState icon="user-x" title="User not found" description="This profile may have been removed." />
      </SafeAreaView>
    );
  }

  const displayName = profile.full_name || profile.username;
  const initial = (displayName || 'U').trim().charAt(0).toUpperCase();
  const isSelf = authUser?.id === profile.id;
  const rating = Number(profile.rating ?? 0);
  const totalSales = Number(profile.total_sales ?? 0);
  const memberSince = profile.created_at ? new Date(profile.created_at).getFullYear() : null;
  const totalLikes = listings.reduce((sum, l) => sum + (l.likes ?? 0), 0);
  // Read-only seller level for social proof. Hidden for Newcomers (id 1) so a
  // brand-new account isn't labelled — status should be earned to be shown.
  const sellerLevel = computeLevel({
    totalSales,
    rating,
    listingsCount: listings.length,
    totalLikes,
    followers: profile.followers_count ?? 0,
  }).current;
  const availableCount = listings.filter((l) => !l.is_sold).length;
  const soldCount = listings.length - availableCount;
  // 'visitor' gets the complete list: a buyer can't act on any of it, which is
  // exactly why level, bundle discount and vacation mode are worth stating.
  const credentials = sellerCredentials(
    profile,
    { listingsCount: listings.length, totalLikes },
    { viewer: 'visitor' },
  );

  // The line under the handle, where the reference layout puts a job title. A
  // marketplace's equivalent is the seller's track record, so it states that
  // and falls back to tenure for an account with no sales yet.
  const identityLine =
    rating > 0 && totalSales > 0
      ? `${rating.toFixed(1)} rating · ${totalSales} ${totalSales === 1 ? 'sale' : 'sales'}`
      : memberSince
        ? `Member since ${memberSince}`
        : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <FlashList
        data={gridRows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        // Default is 250 — shorter than one grid row, so a flick outruns the
        // buffer. See GRID_DRAW_DISTANCE in lib/responsive.ts for the geometry.
        drawDistance={GRID_DRAW_DISTANCE}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
        contentContainerStyle={{ paddingBottom: 80 }}
        // An ELEMENT, never an inline `() => ...` component — an inline function
        // is a new component type each render and would remount the whole header.
        ListHeaderComponent={
      <>
        {/* Top bar. Kept above the banner rather than floating on top of it:
            these are real navigation controls, and a photo can't guarantee the
            contrast they need. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingTop: 6,
            paddingBottom: 8,
          }}
        >
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="chevron-left" size={24} color={colors.ink} />
          </Pressable>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            @{profile.username}
          </Text>
          <Pressable
            onPress={handleMore}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="More options"
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="more-horizontal" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <Animated.View style={fade}>
          <ProfileBanner
            bannerUrl={profile.banner_url}
            avatarUrl={profile.avatar_url}
            initial={initial}
            verified={profile.is_verified}
            label={`${displayName}'s profile photo`}
          />

          <ProfileIdentity
            name={displayName}
            username={profile.username}
            subtitle={identityLine}
            levelName={sellerLevel.id >= 2 ? sellerLevel.name : null}
          >
            {!isSelf ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={followed ? 'Following' : 'Follow'}
                    icon={followed ? 'check' : 'user-plus'}
                    variant={followed ? 'ghost' : 'primary'}
                    full
                    loading={followBusy}
                    onPress={handleFollowToggle}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Message"
                    icon="message-circle"
                    variant="ghost"
                    full
                    onPress={() => {
                      if (listings.length > 0) {
                        router.push(`/conversation/new?listing=${listings[0].id}`);
                      } else {
                        Alert.alert('No listings', 'This user has no active listings to inquire about.');
                      }
                    }}
                  />
                </View>
              </View>
            ) : null}
          </ProfileIdentity>

          <StatsBar
            items={[
              { key: 'items', value: listings.length, label: 'Items' },
              { key: 'sold', value: soldCount, label: 'Sold' },
              {
                key: 'followers',
                value: followersCount,
                label: 'Followers',
                onPress: () =>
                  router.push(
                    `/profile/followers?user=${userId}&username=${encodeURIComponent(profile?.username ?? '')}` as any,
                  ),
              },
              {
                key: 'following',
                value: followingCount,
                label: 'Following',
                onPress: () =>
                  router.push(
                    `/profile/following?user=${userId}&username=${encodeURIComponent(profile?.username ?? '')}` as any,
                  ),
              },
            ]}
          />
        </Animated.View>

        {/* Tabs — clamped to the same column as the cards above, so the labels
            don't drift apart on a wide viewport. */}
        <View style={{ marginTop: 22, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH }}>
            <Tabs
              variant="underline"
              accent="primary"
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                { value: 'shop', label: 'Shop', count: listings.length },
                { value: 'details', label: 'Details' },
              ]}
            />
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          {activeTab === 'details' ? (
            <>
              <InfoCard icon="user" title="About me">
                <Text
                  style={{
                    fontSize: 14,
                    lineHeight: 20,
                    color: profile.bio ? colors.ink : colors.muteSoft,
                  }}
                >
                  {profile.bio?.trim()
                    ? profile.bio
                    : `${displayName} hasn't written a bio yet.`}
                </Text>
              </InfoCard>

              {credentials.length > 0 ? (
                <InfoCard icon="briefcase" title="Seller credentials">
                  <CredentialList rows={credentials} />
                </InfoCard>
              ) : null}
            </>
          ) : (
            <>
              {/* Available / Sold filter — only worth showing once the shop has
                  both kinds; a shop that's all-available needs no controls. */}
              {soldCount > 0 && availableCount > 0 ? (
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 14 }}>
                  {(
                    [
                      { id: 'all', label: `All ${listings.length}` },
                      { id: 'available', label: `Available ${availableCount}` },
                      { id: 'sold', label: `Sold ${soldCount}` },
                    ] as const
                  ).map((f) => {
                    const active = shopFilter === f.id;
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => setShopFilter(f.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => ({
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderRadius: radii.pill,
                          borderWidth: 1,
                          borderColor: active ? colors.purple : colors.hairline,
                          backgroundColor: active ? colors.purple : colors.white,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontWeight: active ? '700' : '600',
                            color: active ? colors.white : colors.ink,
                          }}
                        >
                          {f.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {listings.length === 0 ? (
                <EmptyState
                  icon="package"
                  title="No listings yet"
                  description={`${displayName} hasn't posted anything yet.`}
                />
              ) : visibleListings.length === 0 ? (
                <EmptyState
                  icon="package"
                  title={shopFilter === 'sold' ? 'Nothing sold yet' : 'Nothing available right now'}
                  description={
                    shopFilter === 'sold'
                      ? 'Sold items will show up here.'
                      : 'Everything is sold — follow to catch the next drop.'
                  }
                />
              ) : null /* rows render below the header via FlashList `data` */}
            </>
          )}
        </View>
      </>
        }
      />
    </SafeAreaView>
  );
}

// One row of the virtualized grid. Same layout the old <GridSection> emitted per
// row: its wrapper's paddingHorizontal moved onto the row, and the wrapper's
// vertical `gap` became a marginBottom, so row spacing is unchanged.
const GridRow = memo(function GridRow({
  row,
  columns,
  cardW,
}: {
  row: Listing[];
  columns: number;
  cardW: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: GRID_GAP,
        paddingHorizontal: HORIZONTAL_PAD,
        marginBottom: GRID_GAP,
      }}
    >
      {row.map((listing) => (
        <View key={listing.id} style={{ width: cardW }}>
          <ListingCard listing={listing} width={cardW} />
        </View>
      ))}
      {row.length < columns &&
        Array.from({ length: columns - row.length }).map((_, i) => (
          <View key={`pad-${i}`} style={{ width: cardW }} />
        ))}
    </View>
  );
});
