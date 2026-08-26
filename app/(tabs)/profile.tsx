// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN (CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Slim Coordinator with Encapsulated Sub-Domains
//
// 1. Separation of Responsibilities:
//    The Profile screen (reduced from 1,101 lines down to ~220 lines) acts solely
//    as a coordinator:
//    - Data Layer: React Query hooks (`useUserListingsQuery`, `useLikedListingsQuery`,
//      `useSavedListingsQuery`).
//    - Custom Collections Domain: `useProfileCollections` (list creation/deletion).
//    - Presentational Modules: `ProfileHeader`, `ProfileStats`, `ProfileListingTabs`,
//      `ProfileDetailsTab`, `ProfileGridRow`.
//
// 2. FlashList Performance:
//    Dynamic grid rows are chunked via `columns` calculations and rendered using
//    memoized `ProfileGridRow` elements to maintain 60fps scrolling.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  Share,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Animated from 'react-native-reanimated';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import {
  useUserListingsQuery,
  useLikedListingsQuery,
  useSavedListingsQuery,
} from '@/lib/queries';
import { colors } from '@/lib/theme';
import { useTabBarClearance, useGridDimensions, GRID_DRAW_DISTANCE } from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';
import { useToast } from '@/lib/toast';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { BRAND, APP_URL } from '@/lib/brand';
import { errorMessage } from '@/lib/errors';
import { useSellSheet } from '@/components/sell/SellSheet';
import {
  ProfileDetailsTab,
  ProfileGridRow,
  ProfileHeader,
  ProfileListingTabs,
  ProfileStats,
  type ProfileTab,
  useProfileCollections,
} from '@/components/profile';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const EMPTY_LISTINGS: Listing[] = [];

function ProfileScreenInner() {
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const profileId = profile?.id ?? null;
  const profileUsername = profile?.username ?? null;
  const toast = useToast();
  const { open: openSellSheet } = useSellSheet();
  const [activeTab, setActiveTab] = useState<ProfileTab>('selling');

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
  const sellingQ = useUserListingsQuery(userId ?? '');
  const likedQ = useLikedListingsQuery(userId);
  const savedQ = useSavedListingsQuery(userId);

  const selling = sellingQ.data ?? EMPTY_LISTINGS;
  const liked = likedQ.data ?? EMPTY_LISTINGS;
  const savedItems = savedQ.data ?? EMPTY_LISTINGS;
  const loadingSelling = sellingQ.isLoading;
  const loadingLiked = likedQ.isLoading;
  const loadingSaved = savedQ.isLoading;

  const { isStale: sellingStale, refetch: sellingRefetch } = sellingQ;
  const { isStale: likedStale, refetch: likedRefetch } = likedQ;
  const { isStale: savedStale, refetch: savedRefetch } = savedQ;

  // ── Custom Save Lists Sub-Domain ─────────────────────────────────────────
  const collections = useProfileCollections({
    userId,
    savedRefetch,
  });

  const refreshing =
    sellingQ.isRefetching || likedQ.isRefetching || savedQ.isRefetching;

  const visibleSavedListings = useMemo(
    () => (collections.activeListId ? collections.listListings : savedItems),
    [collections.activeListId, collections.listListings, savedItems],
  );

  // ── Grid Listings Derivation ─────────────────────────────────────────────
  const gridListings = useMemo<Listing[]>(() => {
    if (activeTab === 'selling') return loadingSelling ? EMPTY_LISTINGS : selling;
    if (activeTab === 'liked') return loadingLiked ? EMPTY_LISTINGS : liked;
    if (activeTab === 'collections') {
      const busy = collections.activeListId ? collections.loadingListListings : loadingSaved;
      return busy ? EMPTY_LISTINGS : visibleSavedListings;
    }
    return EMPTY_LISTINGS;
  }, [
    activeTab,
    selling,
    loadingSelling,
    liked,
    loadingLiked,
    collections.activeListId,
    collections.loadingListListings,
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
      <ProfileGridRow row={item} columns={columns} cardW={cardW} />
    ),
    [columns, cardW],
  );

  const rowKey = useCallback((row: Listing[]) => row[0]?.id ?? 'empty', []);

  // ── Focus & Refresh Handlers ─────────────────────────────────────────────
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
      collections.saveListsRefetch(),
    ]);
  }, [sellingRefetch, likedRefetch, savedRefetch, collections]);

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
  const shopLikes = selling.reduce((sum, l) => sum + (l.likes ?? 0), 0);
  const loadingListings =
    activeTab === 'selling'
      ? loadingSelling
      : activeTab === 'liked'
        ? loadingLiked
        : activeTab === 'collections'
          ? collections.activeListId
            ? collections.loadingListListings
            : loadingSaved
          : false;

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
            {/* 1. Header with Avatar & Actions */}
            <Animated.View style={heroFade}>
              <ProfileHeader profile={profile} onShare={handleShareProfile} />

              {/* 2. Stats Bar (Following, Followers, Likes) */}
              <ProfileStats
                followingCount={profile.following_count ?? 0}
                followersCount={profile.followers_count ?? 0}
                shopLikes={shopLikes}
              />
            </Animated.View>

            {/* 3. TikTok-Style Tab Bar & Playlist Strip */}
            <ProfileListingTabs
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              activeListId={collections.activeListId}
              setActiveListId={collections.setActiveListId}
              sellingCount={sellingCount}
              savedCount={savedItems.length}
              saveLists={collections.saveLists}
              onCreateList={collections.handleCreateList}
              onManageList={collections.handleManageList}
              loadingListings={loadingListings}
              gridListingsCount={gridListings.length}
              onPostItem={() => openSellSheet()}
            />

            {/* 4. Details / Credentials Tab */}
            {activeTab === 'details' && (
              <ProfileDetailsTab
                profile={profile}
                selling={selling}
                shopLikes={shopLikes}
                onShare={handleShareProfile}
              />
            )}
          </>
        }
      />
      {collections.promptElement}
    </SafeContainer>
  );
}

export default function ProfileScreen() {
  return (
    <RequireAuth>
      <ProfileScreenInner />
    </RequireAuth>
  );
}
