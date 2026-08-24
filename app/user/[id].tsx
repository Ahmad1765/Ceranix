import { capture } from '@/lib/analytics';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Pressable,
  RefreshControl,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Text } from '@/lib/rnText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated from 'react-native-reanimated';
import {
  useProfileQuery,
  useUserListingsQuery,
  useFollowStateQuery,
  useToggleFollow,
} from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { colors } from '@/lib/theme';
import { computeLevel } from '@/lib/levels';
import { useGridDimensions, GRID_DRAW_DISTANCE } from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import { APP_URL, BRAND } from '@/lib/brand';
import type { Listing } from '@/types';
import { EmptyState } from '@/components/ui';
import { SafeContainer } from '@/components/ui/SafeContainer';
import {
  ProfileBanner,
  InfoCard,
  CredentialList,
  sellerCredentials,
  formatCount,
} from '@/components/profile';
import { ListingCard } from '@/components/ListingCard';


type SellerTab = 'shop' | 'details';

const EMPTY_LISTINGS: Listing[] = [];
const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = typeof id === 'string' ? id : '';
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuth();
  const toast = useToast();
  const [shopFilter, setShopFilter] = useState<'all' | 'available' | 'sold'>('all');
  const [activeTab, setActiveTab] = useState<SellerTab>('shop');

  const fade = useFadeIn(0, 320);

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });


  const listRef = useRef<FlashListRef<Listing[]>>(null);

  const profileQ = useProfileQuery(userId);
  const listingsQ = useUserListingsQuery(userId);
  const followQ = useFollowStateQuery(authUser?.id ?? null, userId);
  const toggleFollowM = useToggleFollow(authUser?.id ?? null, userId);

  const profile = profileQ.data ?? null;
  const listings = listingsQ.data ?? EMPTY_LISTINGS;
  const loading = profileQ.isLoading || listingsQ.isLoading;
  const refreshing = profileQ.isRefetching || listingsQ.isRefetching;
  const followed = followQ.data?.isFollowing ?? false;
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

  const handleShare = async () => {
    if (!profile) return;
    const url = `${APP_URL}/user/${profile.id}`;
    try {
      await Share.share({ message: `Check out @${profile.username} on ${BRAND}\n${url}`, url });
    } catch {
      // user dismissed the sheet
    }
  };

  const handleMore = () => {
    if (!profile) return;
    Alert.alert(`@${profile.username}`, undefined, [
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
    profileQ.refetch();
    listingsQ.refetch();
    if (authUser?.id) followQ.refetch();
  };

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
    return (
      <SafeContainer
        edges={['top', 'left', 'right']}
        backgroundColor={colors.background}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.purple} />
      </SafeContainer>
    );
  }

  if (!profile) {
    return (
      <SafeContainer edges={['top', 'left', 'right']} backgroundColor={colors.background} style={{ flex: 1 }}>
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => safeBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <EmptyState icon="user-x" title="User not found" description="This profile may have been removed." />
      </SafeContainer>
    );
  }

  const displayName = profile.full_name || profile.username;
  const initial = (displayName || 'U').trim().charAt(0).toUpperCase();
  const isSelf = authUser?.id === profile.id;
  const rating = Number(profile.rating ?? 0);
  const totalSales = Number(profile.total_sales ?? 0);
  const totalLikes = listings.reduce((sum, l) => sum + (l.likes ?? 0), 0);

  const sellerStats = {
    totalSales,
    rating,
    listingsCount: listings.length,
    totalLikes,
    followers: profile.followers_count ?? 0,
  };
  const sellerLevel = computeLevel(sellerStats).current;
  const availableCount = listings.filter((l) => !l.is_sold).length;
  const soldCount = listings.length - availableCount;

  useEffect(() => {
    if (shopFilter === 'sold' && soldCount === 0) {
      setShopFilter('all');
    } else if (shopFilter === 'available' && availableCount === 0) {
      setShopFilter('all');
    }
  }, [shopFilter, soldCount, availableCount]);

  const credentials = sellerCredentials(
    profile,
    { listingsCount: listings.length, totalLikes },
    { viewer: 'visitor' },
  );

  return (
    <SafeContainer edges={['top', 'left', 'right']} backgroundColor={colors.background} style={{ flex: 1 }}>
      <FlashList
        ref={listRef}
        data={gridRows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        drawDistance={GRID_DRAW_DISTANCE}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 12) + 60,
        }}
        ListHeaderComponent={
          <>
            <Animated.View style={fade}>
              <ProfileBanner
                avatarUrl={profile.avatar_url}
                initial={initial}
                verified={profile.is_verified}
                label={`${displayName}'s profile photo`}
                onBack={() => safeBack()}
                actions={[
                  {
                    icon: 'information-circle-outline',
                    label: 'Seller details',
                    onPress: () => setActiveTab('details'),
                    active: activeTab === 'details',
                  },
                  ...(isSelf
                    ? []
                    : [
                        {
                          icon: followed ? ('heart' as const) : ('heart-outline' as const),
                          label: followed ? `Unfollow @${profile.username}` : `Follow @${profile.username}`,
                          onPress: handleFollowToggle,
                          active: followed,
                        },
                        { icon: 'ellipsis-horizontal' as const, label: 'More options', onPress: handleMore },
                      ]),
                  { icon: 'share-outline', label: 'Share profile', onPress: handleShare },
                ]}
              />

              {/* Name & Handle */}
              <View style={{ alignItems: 'center', marginTop: 10 }}>
                <Text
                  style={{
                    fontSize: 21,
                    fontWeight: '800',
                    color: colors.ink,
                    letterSpacing: -0.3,
                  }}
                >
                  {displayName}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 3,
                  }}
                >
                  <Text style={{ fontSize: 13.5, color: colors.mute, fontWeight: '500' }}>
                    @{profile.username}
                  </Text>
                  {profile.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color="#20D5EC" />
                  )}
                </View>
              </View>

              {/* Stats Row (TikTok Style: Following, Followers, Likes) */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 20,
                  marginTop: 16,
                  paddingHorizontal: 20,
                }}
              >
                <Pressable
                  onPress={() =>
                    router.push(
                      `/profile/following?user=${userId}&username=${encodeURIComponent(profile?.username ?? '')}` as any,
                    )
                  }
                  style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(followingCount)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>
                    Following
                  </Text>
                </Pressable>

                <View style={{ width: 1, height: 16, backgroundColor: colors.hairline }} />

                <Pressable
                  onPress={() =>
                    router.push(
                      `/profile/followers?user=${userId}&username=${encodeURIComponent(profile?.username ?? '')}` as any,
                    )
                  }
                  style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(followersCount)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>
                    Followers
                  </Text>
                </Pressable>

                <View style={{ width: 1, height: 16, backgroundColor: colors.hairline }} />

                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(totalLikes)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>Likes</Text>
                </View>
              </View>

              {/* Action Buttons Row (TikTok Style: Follow/Message/More) */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 15,
                  paddingHorizontal: 20,
                  alignSelf: 'center',
                }}
              >
                {!isSelf ? (
                  <>
                    <Pressable
                      onPress={handleFollowToggle}
                      disabled={followBusy}
                      accessibilityRole="button"
                      accessibilityLabel={followed ? 'Unfollow' : 'Follow'}
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: 26,
                        borderRadius: 20,
                        backgroundColor: followed ? colors.surface : colors.purple,
                        borderWidth: followed ? 1 : 0,
                        borderColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed || followBusy ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 14.5,
                          fontWeight: '600',
                          color: followed ? colors.ink : '#FFFFFF',
                        }}
                      >
                        {followed ? 'Following' : 'Follow'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        router.push(`/conversation/new?user=${userId}` as any);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Message seller"
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: 22,
                        borderRadius: 20,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <Text style={{ fontSize: 14.5, fontWeight: '600', color: colors.ink }}>
                        Message
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleShare}
                      accessibilityRole="button"
                      accessibilityLabel="Share profile"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={({ pressed }) => ({
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      <Feather name="share-2" size={15} color={colors.ink} />
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => router.push('/profile/edit')}
                      accessibilityRole="button"
                      accessibilityLabel="Edit profile"
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: 20,
                        borderRadius: 20,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>
                        Edit profile
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleShare}
                      accessibilityRole="button"
                      accessibilityLabel="Share profile"
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: 20,
                        borderRadius: 20,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>
                        Share profile
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>

              {/* Bio & Location Section */}
              <View style={{ alignItems: 'center', marginTop: 14, paddingHorizontal: 24 }}>
                {profile.bio?.trim() ? (
                  <Text
                    style={{
                      fontSize: 14,
                      lineHeight: 20,
                      color: colors.ink,
                      textAlign: 'center',
                    }}
                    numberOfLines={3}
                  >
                    {profile.bio}
                  </Text>
                ) : isSelf ? (
                  <Pressable
                    onPress={() => router.push('/profile/edit')}
                    accessibilityRole="button"
                    accessibilityLabel="Add bio"
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.surface,
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: 9999,
                      gap: 6,
                      opacity: pressed ? 0.75 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                  >
                    <Feather name="plus" size={13} color={colors.ink} />
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.ink }}>
                      Add bio
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mute }}>·</Text>
                    <Ionicons name="heart-outline" size={14} color="#FE2C55" />
                    <Text style={{ fontSize: 13, color: '#73747B', fontWeight: '400' }}>
                      My hobbies are...
                    </Text>
                  </Pressable>
                ) : null}

                {profile.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="location-outline" size={13} color={colors.mute} />
                    <Text style={{ fontSize: 13, color: colors.mute, fontWeight: '500' }}>
                      {profile.location}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>

            {/* Tab Navigation Strip (Shop / Details) */}
            <View
              style={{
                flexDirection: 'row',
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                marginTop: 18,
                backgroundColor: colors.background,
              }}
            >
              {/* Tab 1: Shop / Grid */}
              <Pressable
                onPress={() => setActiveTab('shop')}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons
                    name={activeTab === 'shop' ? 'grid' : 'grid-outline'}
                    size={20}
                    color={activeTab === 'shop' ? colors.ink : colors.mute}
                  />
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: activeTab === 'shop' ? '700' : '500',
                      color: activeTab === 'shop' ? colors.ink : colors.mute,
                    }}
                  >
                    Shop ({listings.length})
                  </Text>
                </View>
                {activeTab === 'shop' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 48,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>

              {/* Tab 2: Details */}
              <Pressable
                onPress={() => setActiveTab('details')}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons
                    name={activeTab === 'details' ? 'person' : 'person-outline'}
                    size={20}
                    color={activeTab === 'details' ? colors.ink : colors.mute}
                  />
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: activeTab === 'details' ? '700' : '500',
                      color: activeTab === 'details' ? colors.ink : colors.mute,
                    }}
                  >
                    Details
                  </Text>
                </View>
                {activeTab === 'details' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 48,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>
            </View>

            {/* Details Content */}
            {activeTab === 'details' && (
              <View style={{ paddingVertical: 14 }}>
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

                {sellerLevel.id >= 2 ? (
                  <InfoCard icon="award" title="Seller Level">
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.purple }}>
                      {sellerLevel.name}
                    </Text>
                  </InfoCard>
                ) : null}

                {credentials.length > 0 ? (
                  <InfoCard icon="shield" title="Seller credentials">
                    <CredentialList rows={credentials} />
                  </InfoCard>
                ) : null}
              </View>
            )}

            {/* Available / Sold Filter Chips */}
            {activeTab === 'shop' && soldCount > 0 && availableCount > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
                {(
                  [
                    { id: 'all', label: `All (${listings.length})` },
                    { id: 'available', label: `Available (${availableCount})` },
                    { id: 'sold', label: `Sold (${soldCount})` },
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
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: active ? colors.purple : colors.surface,
                        borderWidth: 1,
                        borderColor: active ? colors.purple : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: active ? '700' : '600',
                          color: active ? '#FFFFFF' : colors.ink,
                        }}
                      >
                        {f.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Empty States */}
            {activeTab === 'shop' && gridRows.length === 0 && (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <EmptyState
                  icon="shopping-bag"
                  title={shopFilter === 'sold' ? 'Nothing sold yet' : 'No items right now'}
                  description={
                    shopFilter === 'sold'
                      ? 'Sold items will show up here.'
                      : `${displayName} has no active items right now.`
                  }
                />
              </View>
            )}
          </>
        }
      />
    </SafeContainer>
  );
}

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

