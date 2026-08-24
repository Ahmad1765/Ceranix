import { memo, useCallback, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Share,
  Linking,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text } from '@/lib/rnText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, Href } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated from 'react-native-reanimated';
import { RequireAuth } from '@/components/RequireAuth';
import { usePrompt } from '@/components/PromptDialog';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUserListingsQuery,
  useLikedListingsQuery,
  useSavedListingsQuery,
  useSaveListsQuery,
  useListingsInListQuery,
  qk,
} from '@/lib/queries';
import {
  createSaveList,
  deleteSaveList,
  renameSaveList,
  type SaveList,
} from '@/lib/saves';
import { colors, radii } from '@/lib/theme';
import { useTabBarClearance, useGridDimensions, GRID_DRAW_DISTANCE, CONTENT_MAX_WIDTH } from '@/lib/responsive';


import { useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';
import { useToast } from '@/lib/toast';
import { Card, ListRow, EmptyState } from '@/components/ui';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { ListingCard } from '@/components/ListingCard';

import {
  LEVELS,
  computeLevel,
  computeBadges,
  type Badge,
} from '@/lib/levels';
import { BRAND, APP_URL } from '@/lib/brand';
import { errorMessage } from '@/lib/errors';
import { useSellSheet } from '@/components/sell/SellSheet';
import {
  ProfileBanner,
  InfoCard,
  CredentialList,
  sellerCredentials,
  formatCount,
} from '@/components/profile';

type ProfileTab = 'selling' | 'liked' | 'collections' | 'details';

type ShopItem = {
  icon: any;
  title: string;
  subtitle: string;
  badge?: string;
  action: 'shop' | 'ratings' | 'bundle' | 'vacation' | 'share';
};

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;

// Stable empty references so query fallbacks don't churn the useMemos below.
const EMPTY_LISTINGS: Listing[] = [];
const EMPTY_SAVE_LISTS: SaveList[] = [];

function ProfileScreenInner() {
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const profileId = profile?.id ?? null;
  const profileUsername = profile?.username ?? null;
  const toast = useToast();
  const { open: openSellSheet } = useSellSheet();
  const { prompt, element: promptElement } = usePrompt();
  const [activeTab, setActiveTab] = useState<ProfileTab>('selling');
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const heroFade = useFadeIn(0, 320);
  const tabClear = useTabBarClearance();

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });


  const userId = profile?.id ?? null;
  const queryClient = useQueryClient();
  const sellingQ = useUserListingsQuery(userId ?? '');
  const likedQ = useLikedListingsQuery(userId);
  const savedQ = useSavedListingsQuery(userId);
  const saveListsQ = useSaveListsQuery(userId);
  const listInListQ = useListingsInListQuery(activeListId);

  const selling = sellingQ.data ?? EMPTY_LISTINGS;
  const liked = likedQ.data ?? EMPTY_LISTINGS;
  const savedItems = savedQ.data ?? EMPTY_LISTINGS;
  const saveLists = saveListsQ.data ?? EMPTY_SAVE_LISTS;
  const listListings = listInListQ.data ?? EMPTY_LISTINGS;
  const loadingSelling = sellingQ.isLoading;
  const loadingLiked = likedQ.isLoading;
  const loadingSaved = savedQ.isLoading;
  const loadingListListings = listInListQ.isLoading;
  const refreshing =
    sellingQ.isRefetching || likedQ.isRefetching || savedQ.isRefetching;

  const visibleSavedListings = useMemo(
    () => (activeListId ? listListings : savedItems),
    [activeListId, listListings, savedItems],
  );

  const gridListings = useMemo<Listing[]>(() => {
    if (activeTab === 'selling') return loadingSelling ? EMPTY_LISTINGS : selling;
    if (activeTab === 'liked') return loadingLiked ? EMPTY_LISTINGS : liked;
    if (activeTab === 'collections') {
      const busy = activeListId ? loadingListListings : loadingSaved;
      return busy ? EMPTY_LISTINGS : visibleSavedListings;
    }
    return EMPTY_LISTINGS;
  }, [
    activeTab,
    selling,
    loadingSelling,
    liked,
    loadingLiked,
    activeListId,
    loadingListListings,
    loadingSaved,
    visibleSavedListings,
  ]);

  const gridRows = useMemo(() => {
    const out: Listing[][] = [];
    for (let i = 0; i < gridListings.length; i += columns) {
      out.push(gridListings.slice(i, i + columns));
    }
    return out;
  }, [gridListings, columns]);

  const renderRow = useCallback(
    ({ item }: { item: Listing[] }) => (
      <GridRow row={item} columns={columns} cardW={cardW} />
    ),
    [columns, cardW],
  );

  const rowKey = useCallback((row: Listing[]) => row[0]?.id ?? 'empty', []);

  const { isStale: sellingStale, refetch: sellingRefetch } = sellingQ;
  const { isStale: likedStale, refetch: likedRefetch } = likedQ;
  const { isStale: savedStale, refetch: savedRefetch } = savedQ;
  const { refetch: saveListsRefetch } = saveListsQ;

  const handleCreateList = useCallback(async () => {
    if (!userId) return;
    const name = await prompt({
      title: 'New list',
      message: 'Name your save list',
      placeholder: 'e.g. Summer outfits',
      submitLabel: 'Create',
    });
    if (!name) return;
    const created = await createSaveList(userId, name);
    if (created) {
      queryClient.setQueryData<SaveList[]>(qk.saveLists(userId), (prev) => [
        ...(prev ?? []),
        { ...created, item_count: 0 },
      ]);
      setActiveListId(created.id);
    } else {
      toast.show("Couldn't create list", { variant: 'info', icon: 'alert-circle' });
    }
  }, [userId, prompt, toast, queryClient]);

  const handleManageList = useCallback(
    (list: SaveList) => {
      if (list.is_default) {
        toast.show("Default list can't be edited", { variant: 'info', icon: 'info' });
        return;
      }
      Alert.alert(list.name, undefined, [
        {
          text: 'Rename',
          onPress: async () => {
            const next = await prompt({
              title: 'Rename list',
              defaultValue: list.name,
              submitLabel: 'Save',
            });
            if (!next) return;
            const ok = await renameSaveList(list.id, next);
            if (ok) {
              queryClient.setQueryData<SaveList[]>(qk.saveLists(userId), (prev) =>
                (prev ?? []).map((l) => (l.id === list.id ? { ...l, name: next } : l)),
              );
            }
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteSaveList(list.id);
            if (!ok) {
              toast.show("Couldn't delete list", { variant: 'info', icon: 'alert-circle' });
              return;
            }
            queryClient.setQueryData<SaveList[]>(qk.saveLists(userId), (prev) =>
              (prev ?? []).filter((l) => l.id !== list.id),
            );
            if (activeListId === list.id) setActiveListId(null);
            savedRefetch();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [activeListId, userId, prompt, toast, queryClient, savedRefetch],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (sellingStale) sellingRefetch();
      if (likedStale) likedRefetch();
      if (savedStale) savedRefetch();
      refreshProfile().catch(() => {});
    }, [
      userId,
      sellingStale,
      sellingRefetch,
      likedStale,
      likedRefetch,
      savedStale,
      savedRefetch,
      refreshProfile,
    ]),
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([
      sellingRefetch(),
      likedRefetch(),
      savedRefetch(),
      saveListsRefetch(),
    ]);
  }, [sellingRefetch, likedRefetch, savedRefetch, saveListsRefetch]);

  const handleShareProfile = useCallback(async () => {
    if (!profileId) return;
    const displayName = profileUsername ? `@${profileUsername}` : 'this seller';
    const url = `${APP_URL}/user/${profileId}`;
    const message = `Check out ${displayName} on ${BRAND}\n${url}`;

    let shared = false;
    let failure: unknown = null;
    try {
      const result = await Share.share({ message, url });
      shared = result.action === Share.sharedAction;
    } catch (e) {
      failure = e;
    }

    if (failure !== null) {
      toast.show(errorMessage(failure) || 'Could not share profile', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } else if (shared) {
      toast.show('Profile shared successfully!', { variant: 'success', icon: 'check-circle' });
    }
  }, [profileId, profileUsername, toast]);

  if (!profile) {
    return (
      <SafeContainer
        edges={['top']}
        backgroundColor={colors.background}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.purple} />
      </SafeContainer>
    );
  }


  const sellingCount = selling.length;
  const displayName = profile.full_name || profile.username;
  const initial = (displayName || 'U').trim().charAt(0).toUpperCase();
  const rating = Number(profile.rating ?? 0);
  const totalSales = Number(profile.total_sales ?? 0);

  const shopLikes = selling.reduce((sum, l) => sum + (l.likes ?? 0), 0);

  const sellerStats = {
    totalSales,
    rating,
    listingsCount: sellingCount,
    totalLikes: shopLikes,
    followers: profile.followers_count ?? 0,
  };
  const levelProgress = computeLevel(sellerStats);
  const badges = computeBadges(sellerStats, profile, true);
  const earnedBadges = badges.filter((b) => b.earned);
  const credentials = sellerCredentials(
    profile,
    { listingsCount: sellingCount, totalLikes: shopLikes },
    { viewer: 'owner' },
  );

  const websiteLink =
    (profile as any).website || (profile.username ? `${APP_URL}/user/${profile.id}` : null);

  return (
    <SafeContainer edges={['top', 'left', 'right']} backgroundColor={colors.background} style={{ flex: 1 }}>
      <FlashList
        data={gridRows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        drawDistance={GRID_DRAW_DISTANCE}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 12) + tabClear + 16,
        }}
        ListHeaderComponent={
          <>
            {/* Profile Header: Actions & Avatar */}
            <Animated.View style={heroFade}>
              <ProfileBanner
                avatarUrl={profile.avatar_url}
                initial={initial}
                verified={profile.is_verified}
                label="Your profile photo"
                onPress={() => router.push('/profile/edit')}
                actions={[
                  {
                    icon: 'share-outline',
                    label: 'Share profile',
                    onPress: handleShareProfile,
                  },
                  {
                    icon: 'create-outline',
                    label: 'Edit profile',
                    onPress: () => router.push('/profile/edit'),
                  },
                  {
                    icon: 'settings-outline',
                    label: 'Settings',
                    onPress: () => router.push('/settings'),
                  },
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
                  onPress={() => router.push('/profile/following' as Href)}
                  style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(profile.following_count ?? 0)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>
                    Following
                  </Text>
                </Pressable>

                <View style={{ width: 1, height: 16, backgroundColor: colors.hairline }} />

                <Pressable
                  onPress={() => router.push('/profile/followers' as Href)}
                  style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(profile.followers_count ?? 0)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>
                    Followers
                  </Text>
                </Pressable>

                <View style={{ width: 1, height: 16, backgroundColor: colors.hairline }} />

                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(shopLikes)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>Likes</Text>
                </View>
              </View>




              {/* Bio & Link Section */}
              <View style={{ alignItems: 'center', marginTop: 14, paddingHorizontal: 24 }}>
                {profile.bio?.trim() ? (
                  <Pressable
                    onPress={() => router.push('/profile/edit')}
                    style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                  >
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
                  </Pressable>
                ) : (
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
                    <Text style={{ fontSize: 13, color: colors.mute, fontWeight: '400' }}>
                      My hobbies are...
                    </Text>
                  </Pressable>
                )}

                {websiteLink ? (
                  <Pressable
                    onPress={() => {
                      const url = websiteLink.startsWith('http')
                        ? websiteLink
                        : `https://${websiteLink}`;
                      Linking.openURL(url).catch(() => {});
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 6,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Feather name="link" size={13} color={colors.ink} />
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontWeight: '700',
                        color: colors.ink,
                      }}
                      numberOfLines={1}
                    >
                      {websiteLink}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>

            {/* TikTok Icon Tab Bar with Active Underline Indicator */}
            <View
              style={{
                flexDirection: 'row',
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                marginTop: 18,
              }}
            >
              {/* Tab 1: Video Grid / Selling */}
              <Pressable
                onPress={() => setActiveTab('selling')}
                accessibilityRole="tab"
                accessibilityLabel="Selling"
                accessibilityState={{ selected: activeTab === 'selling' }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Ionicons
                    name="grid-outline"
                    size={20}
                    color={activeTab === 'selling' ? colors.ink : colors.mute}
                  />
                  <Ionicons
                    name="caret-down-outline"
                    size={10}
                    color={activeTab === 'selling' ? colors.ink : colors.mute}
                  />
                </View>
                {activeTab === 'selling' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 44,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>

              {/* Tab 2: Liked / Sparkle */}
              <Pressable
                onPress={() => setActiveTab('liked')}
                accessibilityRole="tab"
                accessibilityLabel="Liked"
                accessibilityState={{ selected: activeTab === 'liked' }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <Ionicons
                  name={activeTab === 'liked' ? 'heart' : 'heart-outline'}
                  size={21}
                  color={activeTab === 'liked' ? colors.ink : colors.mute}
                />
                {activeTab === 'liked' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 44,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>

              {/* Tab 3: Saved / Collections / Repost */}
              <Pressable
                onPress={() => setActiveTab('collections')}
                accessibilityRole="tab"
                accessibilityLabel="Collections"
                accessibilityState={{ selected: activeTab === 'collections' }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <Ionicons
                  name={activeTab === 'collections' ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={activeTab === 'collections' ? colors.ink : colors.mute}
                />
                {activeTab === 'collections' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 44,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>

              {/* Tab 4: Details / Credentials */}
              <Pressable
                onPress={() => setActiveTab('details')}
                accessibilityRole="tab"
                accessibilityLabel="Details"
                accessibilityState={{ selected: activeTab === 'details' }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <Ionicons
                  name={activeTab === 'details' ? 'person' : 'person-outline'}
                  size={20}
                  color={activeTab === 'details' ? colors.ink : colors.mute}
                />
                {activeTab === 'details' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 44,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>
            </View>

            {/* Playlist / Category Chips Strip */}
            {(activeTab === 'selling' || activeTab === 'collections') && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={() => setActiveListId(null)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: activeListId === null ? colors.purple : colors.surface,
                    borderWidth: 1,
                    borderColor: activeListId === null ? colors.purple : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons
                    name="play-circle-outline"
                    size={16}
                    color={activeListId === null ? '#FFFFFF' : colors.ink}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: activeListId === null ? '#FFFFFF' : colors.ink,
                    }}
                  >
                    All Items
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: activeListId === null ? 'rgba(255,255,255,0.85)' : colors.mute,
                      fontWeight: '600',
                    }}
                  >
                    {activeTab === 'collections' ? savedItems.length : sellingCount}
                  </Text>
                </Pressable>

                {activeTab === 'collections' && saveLists.map((list) => {
                  const isListActive = activeListId === list.id;
                  return (
                    <Pressable
                      key={list.id}
                      onPress={() => setActiveListId(list.id)}
                      onLongPress={() => handleManageList(list)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: isListActive ? colors.purple : colors.surface,
                        borderWidth: 1,
                        borderColor: isListActive ? colors.purple : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Ionicons
                        name="play-circle-outline"
                        size={16}
                        color={isListActive ? '#FFFFFF' : colors.ink}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          color: isListActive ? '#FFFFFF' : colors.ink,
                        }}
                      >
                        {list.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: isListActive ? 'rgba(255,255,255,0.85)' : colors.mute,
                          fontWeight: '600',
                        }}
                      >
                        {list.item_count ?? 0}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={handleCreateList}
                  style={({ pressed }) => ({
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Feather name="plus" size={16} color={colors.ink} />
                </Pressable>
              </ScrollView>
            )}

            {/* Details Tab Content */}
            {activeTab === 'details' && (
              <View style={{ marginTop: 12 }}>
                <InfoCard icon="user" title="About me">
                  <Text
                    style={{
                      fontSize: 14,
                      lineHeight: 20,
                      color: profile.bio?.trim() ? colors.ink : colors.muteSoft,
                    }}
                  >
                    {profile.bio?.trim()
                      ? profile.bio
                      : 'Add a short bio so buyers know who they’re dealing with.'}
                  </Text>
                </InfoCard>

                <InfoCard icon="award" title="Seller level">
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}
                    >
                      {levelProgress.current.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '800',
                        color: levelProgress.next ? colors.muteSoft : colors.purple,
                        letterSpacing: 0.4,
                      }}
                    >
                      {levelProgress.next
                        ? `LEVEL ${levelProgress.current.id} / ${LEVELS.length}`
                        : 'MAX LEVEL'}
                    </Text>
                  </View>
                  <ProgressBar fraction={levelProgress.progress} />
                  {levelProgress.nextRequirement ? (
                    <Text style={{ fontSize: 12.5, color: colors.mute, fontWeight: '600', marginTop: 8 }}>
                      {levelProgress.nextRequirement}
                    </Text>
                  ) : null}
                </InfoCard>

                {earnedBadges.length > 0 ? (
                  <InfoCard icon="star" title="Achievements">
                    <AchievementsStrip badges={earnedBadges} />
                  </InfoCard>
                ) : null}

                {credentials.length > 0 ? (
                  <InfoCard icon="shield" title="Seller credentials">
                    <CredentialList rows={credentials} />
                  </InfoCard>
                ) : null}

                <View style={{ paddingHorizontal: 16, alignItems: 'center' }}>
                  <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH }}>
                    <Card pad={0} variant="paper">
                      {(() => {
                        const bundlePct = profile.bundle_discount_pct ?? 0;
                        const vacationOn = !!profile.vacation_mode;
                        const items: ShopItem[] = [
                          {
                            icon: 'shopping-bag',
                            title: 'Purchases & sales',
                            subtitle: 'Your orders, invoices & payouts',
                            action: 'shop',
                          },
                          {
                            icon: 'star',
                            title: 'Ratings & reviews',
                            subtitle: 'How buyers have rated your sales',
                            badge: rating > 0 ? rating.toFixed(1) : undefined,
                            action: 'ratings',
                          },
                          {
                            icon: 'percent',
                            title: 'Bundle discount',
                            subtitle: 'Reward buyers who shop multiple items',
                            badge: bundlePct > 0 ? `${bundlePct}%` : 'Off',
                            action: 'bundle',
                          },
                          {
                            icon: 'pause-circle',
                            title: 'Vacation mode',
                            subtitle: 'Pause listings while away',
                            badge: vacationOn ? 'On' : 'Off',
                            action: 'vacation',
                          },
                          {
                            icon: 'share-2',
                            title: 'Share your profile',
                            subtitle: 'Send a link to your shop',
                            action: 'share',
                          },
                        ];
                        return items.map((item, i) => (
                          <View key={item.title}>
                            <ListRow
                              icon={item.icon}
                              iconBg={colors.purpleSoft}
                              iconColor={colors.purple}
                              title={item.title}
                              subtitle={item.subtitle}
                              badge={item.badge}
                              badgeTone="mute"
                              onPress={() => {
                                if (item.action === 'shop') {
                                  router.push('/orders' as any);
                                } else if (item.action === 'ratings') {
                                  router.push('/ratings' as any);
                                } else if (item.action === 'bundle') {
                                  router.push('/settings?open=bundle' as any);
                                } else if (item.action === 'share') {
                                  handleShareProfile();
                                } else {
                                  router.push('/settings' as any);
                                }
                              }}
                            />
                            {i < items.length - 1 && (
                              <View
                                style={{
                                  height: 1,
                                  backgroundColor: colors.hairline,
                                  marginLeft: 68,
                                }}
                              />
                            )}
                          </View>
                        ));
                      })()}
                    </Card>
                  </View>
                </View>
              </View>
            )}

            {/* Empty state for lists */}
            {activeTab !== 'details' && (
              (activeTab === 'selling'
                ? loadingSelling
                : activeTab === 'liked'
                  ? loadingLiked
                  : activeTab === 'collections'
                    ? (activeListId ? loadingListListings : loadingSaved)
                    : false) ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator color={colors.purple} />
                </View>
              ) : gridListings.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <EmptyState
                    icon={
                      activeTab === 'liked'
                        ? 'heart'
                        : activeTab === 'collections'
                          ? 'bookmark'
                          : 'shopping-bag'
                    }
                    title={
                      activeTab === 'liked'
                        ? 'No liked items'
                        : activeTab === 'collections'
                          ? 'No saved items'
                          : 'Your shop is empty'
                    }
                    description={
                      activeTab === 'selling'
                        ? 'Post your first item — takes less than a minute.'
                        : 'Items you interact with will show up here.'
                    }
                    cta={
                      activeTab === 'selling'
                        ? {
                            label: 'Post an item',
                            icon: 'plus',
                            onPress: () => openSellSheet(),
                          }
                        : undefined
                    }
                  />
                </View>
              ) : null
            )}
          </>
        }
      />
      {promptElement}
    </SafeContainer>
  );
}


function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      style={{
        height: 8,
        borderRadius: 99,
        backgroundColor: colors.purpleSoft,
        overflow: 'hidden',
      }}
    >
      <View
        style={{ width: `${pct}%`, height: '100%', borderRadius: 99, backgroundColor: colors.purple }}
      />
    </View>
  );
}

function AchievementsStrip({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  const shown = badges.slice(0, 4);
  const extra = badges.length - shown.length;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${badges.length} ${badges.length === 1 ? 'achievement' : 'achievements'} earned`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}
    >
      {shown.map((b) => (
        <View
          key={b.key}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radii.pill,
            backgroundColor: colors.purpleSoft,
          }}
        >
          <Feather name={b.icon as keyof typeof Feather.glyphMap} size={11} color={colors.purple} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.purple, letterSpacing: -0.1 }}>
            {b.label}
          </Text>
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radii.pill,
            backgroundColor: colors.panel,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.mute }}>+{extra}</Text>
        </View>
      ) : null}
    </View>
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


export default function ProfileScreen() {
  return (
    <RequireAuth>
      <ProfileScreenInner />
    </RequireAuth>
  );
}
