import { capture } from '@/lib/analytics';
import { memo, useCallback, useMemo, useState } from 'react';
import { View, Pressable, RefreshControl, Alert, Share } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
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
import { getOptimizedImageUrl } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { ListingCard } from '@/components/ListingCard';
import { colors, radii } from '@/lib/theme';
import { computeLevel } from '@/lib/levels';
import { useGridDimensions, HIT_SLOP_8 } from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';
import { Button, EmptyState, SectionHeader } from '@/components/ui';

// Module-level so the identity never changes across renders.
const EMPTY_LISTINGS: Listing[] = [];

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const AVATAR_SIZE = 88;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = typeof id === 'string' ? id : '';
  const { user: authUser } = useAuth();
  const toast = useToast();
  // 'all' shows everything; sold rows already sort after available ones.
  const [shopFilter, setShopFilter] = useState<'all' | 'available' | 'sold'>('all');

  const fade = useFadeIn(0, 320);

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

  const gridRows = useMemo(() => {
    const out: Listing[][] = [];
    for (let i = 0; i < visibleListings.length; i += columns) {
      out.push(visibleListings.slice(i, i + columns));
    }
    return out;
  }, [visibleListings, columns]);

  const renderRow = useCallback(
    ({ item }: { item: Listing[] }) => <GridRow row={item} columns={columns} cardW={cardW} />,
    [columns, cardW],
  );

  const rowKey = useCallback((row: Listing[]) => row[0]?.id ?? 'empty', []);

  if (loading) {
    // Skeleton mirroring the real layout (avatar + stats + lines + grid)
    // instead of a centered spinner, so loading doesn't cause a layout jump.
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ padding: 14 }}>
          <Pressable onPress={() => safeBack()} hitSlop={HIT_SLOP_8}>
            <Feather name="chevron-left" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              backgroundColor: colors.divider,
            }}
          />
          <View
            style={{
              flex: 1,
              height: 58,
              marginLeft: 16,
              borderRadius: radii.md,
              backgroundColor: colors.divider,
            }}
          />
        </View>
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 8 }}>
          <View style={{ width: 160, height: 16, borderRadius: 6, backgroundColor: colors.divider }} />
          <View style={{ width: 240, height: 12, borderRadius: 6, backgroundColor: colors.divider }} />
        </View>
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

  const avatar = profile.avatar_url ? getOptimizedImageUrl(profile.avatar_url, { width: 240 }) : null;
  const initial = (profile.full_name || profile.username || 'U').trim().charAt(0).toUpperCase();
  const isSelf = authUser?.id === profile.id;
  const rating = Number(profile.rating ?? 0);
  const totalSales = Number(profile.total_sales ?? 0);
  const memberSince = profile.created_at ? new Date(profile.created_at).getFullYear() : null;
  // Read-only seller level for social proof. Hidden for Newcomers (id 1) so a
  // brand-new account isn't labelled — status should be earned to be shown.
  const sellerLevel = computeLevel({
    totalSales,
    rating,
    listingsCount: listings.length,
    totalLikes: listings.reduce((sum, l) => sum + (l.likes ?? 0), 0),
    followers: profile.followers_count ?? 0,
  }).current;
  const availableCount = listings.filter((l) => !l.is_sold).length;
  const soldCount = listings.length - availableCount;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <FlashList
        data={gridRows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
        contentContainerStyle={{ paddingBottom: 80 }}
        // An ELEMENT, never an inline `() => ...` component — an inline function
        // is a new component type each render and would remount the whole header.
        ListHeaderComponent={
      <>
        {/* Top bar */}
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

        {/* Hero */}
        <Animated.View style={[{ paddingHorizontal: 16, paddingTop: 4 }, fade]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                borderRadius: AVATAR_SIZE / 2,
                borderWidth: 2,
                borderColor: colors.purple,
                padding: 3,
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: (AVATAR_SIZE - 10) / 2,
                  overflow: 'hidden',
                  backgroundColor: colors.purpleSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Text style={{ fontSize: 30, fontWeight: '900', color: colors.purple }}>{initial}</Text>
                )}
              </View>
              {profile.is_verified && (
                <View
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: colors.purple,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: 'white',
                  }}
                >
                  <Feather name="check" size={11} color="white" />
                </View>
              )}
            </View>

            {/* Stats — same contained panel strip as the own-profile page so
                the two screens share one visual vocabulary. */}
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                marginLeft: 16,
                backgroundColor: colors.panel,
                borderRadius: radii.md,
                paddingVertical: 10,
              }}
            >
              <Stat value={formatCount(listings.length)} label="Items" />
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.hairline }} />
              <Stat
                value={formatCount(followersCount)}
                label="Followers"
                onPress={() =>
                  router.push(
                    `/profile/followers?user=${userId}&username=${encodeURIComponent(profile?.username ?? '')}` as any,
                  )
                }
              />
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.hairline }} />
              <Stat
                value={formatCount(followingCount)}
                label="Following"
                onPress={() =>
                  router.push(
                    `/profile/following?user=${userId}&username=${encodeURIComponent(profile?.username ?? '')}` as any,
                  )
                }
              />
            </View>
          </View>

          {/* Name + bio */}
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                style={{ fontSize: 16, fontWeight: '800', color: colors.ink, letterSpacing: -0.2, flexShrink: 1 }}
                numberOfLines={1}
              >
                {profile.full_name || profile.username}
              </Text>
              {sellerLevel.id >= 2 ? (
                <View
                  accessibilityRole="text"
                  accessibilityLabel={`Seller level: ${sellerLevel.name}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: radii.pill,
                    backgroundColor: colors.purpleSoft,
                  }}
                >
                  <Feather name="award" size={10} color={colors.purple} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.purple, letterSpacing: -0.1 }}>
                    {sellerLevel.name}
                  </Text>
                </View>
              ) : null}
            </View>
            {profile.bio && (
              <Text style={{ fontSize: 14, color: colors.ink, marginTop: 4, lineHeight: 19 }}>
                {profile.bio}
              </Text>
            )}
            {profile.location && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
                <Feather name="map-pin" size={12} color={colors.mute} />
                <Text style={{ fontSize: 12, color: colors.mute }}>{profile.location}</Text>
              </View>
            )}

            {/* Seller trust — this screen is where a buyer decides whether a
                stranger is safe to deal with, so the badges earn their spot
                here even more than on the own-profile page. Data-backed
                segments only; vacation mode warns buyers not to expect
                instant replies. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: 10,
                gap: 6,
              }}
            >
              {rating > 0 ? (
                <TrustBadge icon="star" label={`${rating.toFixed(1)} rating`} />
              ) : null}
              {totalSales > 0 ? (
                <TrustBadge icon="check-circle" label={`${totalSales} ${totalSales === 1 ? 'sale' : 'sales'}`} />
              ) : null}
              {memberSince ? (
                <TrustBadge icon="clock" label={`Joined ${memberSince}`} />
              ) : null}
              {profile.vacation_mode ? (
                <TrustBadge icon="pause-circle" label="On vacation" emphasized />
              ) : null}
            </View>
          </View>

          {/* CTA row */}
          {!isSelf && (
            <View style={{ flexDirection: 'row', marginTop: 14, gap: 8 }}>
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
          )}
        </Animated.View>

        {/* Listings */}
        <View style={{ marginTop: 26 }}>
          <SectionHeader
            title="Shop"
            count={visibleListings.length}
            rightText={visibleListings.length === 1 ? 'item' : 'items'}
          />

          {/* Available / Sold filter — only worth showing once the shop has
              both kinds; a shop that's all-available needs no controls. */}
          {soldCount > 0 && availableCount > 0 ? (
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
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
                        color: active ? 'white' : colors.ink,
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
              description={`${profile.full_name || profile.username} hasn't posted anything yet.`}
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
        </View>
      </>
        }
      />
    </SafeAreaView>
  );
}

function formatCount(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 10_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (n < 1_000_000) return Math.round(n / 1_000) + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

function Stat({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  const body = (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, color: colors.mute, marginTop: 2 }}>{label}</Text>
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP_8}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}
    >
      {body}
    </Pressable>
  );
}

// Mirrors the TrustBadge on the own-profile page: a quiet pill stating a
// seller-trust fact; `emphasized` = purple-soft fill for attention states.
function TrustBadge({
  icon,
  label,
  emphasized = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  emphasized?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radii.pill,
        backgroundColor: emphasized ? colors.purpleSoft : colors.panel,
      }}
    >
      <Feather name={icon} size={11} color={emphasized ? colors.purple : colors.mute} />
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: emphasized ? colors.purple : colors.ink,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
    </View>
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
