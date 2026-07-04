import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect, Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { ListingCard } from '@/components/ListingCard';
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
import { useGridDimensions, useTabBarClearance, HIT_SLOP_8 } from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';
import { useToast } from '@/lib/toast';
import { Button, Card, ListRow, EmptyState, Tabs } from '@/components/ui';
import { useWebPullToRefresh, WebPullIndicator } from '@/components/WebRefresh';
import {
  LEVELS,
  computeLevel,
  profileCompletion,
  computeBadges,
  type Badge,
  type ProfileCompletion,
} from '@/lib/levels';

const APP_URL = 'https://carrinex.vercel.app';

type ProfileTab = 'selling' | 'liked' | 'shop' | 'collections';

type ShopItem = {
  icon: any;
  title: string;
  subtitle: string;
  badge?: string;
  action: 'shop' | 'bundle' | 'vacation' | 'share';
};

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const AVATAR_SIZE = 88;

// Stable empty references so query fallbacks don't churn the useMemos below.
const EMPTY_LISTINGS: Listing[] = [];
const EMPTY_SAVE_LISTS: SaveList[] = [];

function ProfileScreenInner() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const { prompt, element: promptElement } = usePrompt();
  const [activeTab, setActiveTab] = useState<ProfileTab>('selling');
  // null = "All" — flat union of every list. A specific list id narrows
  // the grid to that bucket's items only.
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const heroFade = useFadeIn(0, 320);
  // Bottom padding that clears the floating tab bar overlaying the content.
  const tabClear = useTabBarClearance();

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  // Reuse the shared listing hooks; only the liked + save-list reads are
  // profile-specific. `profile` is the signed-in user (RequireAuth wraps this).
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

  // Stable refetch fns + isStale snapshots for the focus gate.
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
        // Default is protected from rename/delete to keep tap-to-save
        // pointing at a stable destination.
        toast.show('Default list can\'t be edited', { variant: 'info', icon: 'info' });
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
            // This list's items are gone — revalidate the flat saved union.
            savedRefetch();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [activeListId, userId, prompt, toast, queryClient, savedRefetch],
  );

  // Re-fetch silently when the tab regains focus (after a new upload, etc.),
  // but only stale grids. refreshProfile() pulls fresh follower/following
  // counts so a follow toggled on /user/[id] reflects here without a reload.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (sellingStale) sellingRefetch();
      if (likedStale) likedRefetch();
      if (savedStale) savedRefetch();
      refreshProfile().catch(() => {});
    }, [
      userId,
      sellingStale, sellingRefetch,
      likedStale, likedRefetch,
      savedStale, savedRefetch,
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

  // Web pull-to-refresh — RefreshControl is inert on react-native-web.
  const { scrollRef, pull, nodeTop, threshold, contentStyle } = useWebPullToRefresh({ refreshing, onRefresh });

const handleShareProfile = useCallback(async () => {
  if (!profile?.id) return;
  const displayName = profile.username ? `@${profile.username}` : 'this seller';
  const url = `${APP_URL}/user/${profile.id}`;
  try {
    const result = await Share.share({ message: `Check out ${displayName} on Carrinix\n${url}`, url });
    if (result.action === Share.sharedAction) {
      if (result.activityType) {
        // shared with activity type of result.activityType
      } else {
        // shared
      }
      toast.show('Profile shared successfully!', { variant: 'success', icon: 'check-circle' });
    } else if (result.action === Share.dismissedAction) {
      // dismissed
    }
  } catch (error: any) {
    toast.show(error.message || 'Could not share profile', { variant: 'default', icon: 'alert-triangle' });
  }
}, [profile?.id, profile?.username, toast]);

  if (!profile) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  const sellingCount = selling.length;
  const likedCount = liked.length;
  const savedCount = savedItems.length;
  const initial = (profile.full_name || profile.username || 'U').trim().charAt(0).toUpperCase();
  const rating = Number(profile.rating ?? 0);
  const totalSales = Number(profile.total_sales ?? 0);
  const memberSince = profile.created_at ? new Date(profile.created_at).getFullYear() : null;

  // Shop snapshot, derived from rows already loaded for the Selling tab.
  const activeCount = selling.filter((l) => !l.is_sold).length;
  const soldCount = selling.length - activeCount;
  const shopLikes = selling.reduce((sum, l) => sum + (l.likes ?? 0), 0);

  // ── Status & progression (Phase 1, computed from existing data) ──
  const sellerStats = {
    totalSales,
    rating,
    listingsCount: sellingCount,
    totalLikes: shopLikes,
    followers: profile.followers_count ?? 0,
  };
  const levelProgress = computeLevel(sellerStats);
  const completion = profileCompletion(profile, sellingCount);
  const badges = computeBadges(sellerStats, profile, completion.isComplete);
  const earnedBadges = badges.filter((b) => b.earned);
  const handleCompletionCta = () => {
    // Route to the highest-leverage next step. Listing-related steps go to the
    // upload flow; identity steps go to profile edit / settings.
    const next = completion.steps.find((s) => !s.done);
    if (!next) return;
    if (next.key === 'first_listing' || next.key === 'three_listings') {
      router.push('/(tabs)/upload');
    } else if (next.key === 'verify') {
      router.push('/settings' as any);
    } else {
      router.push('/profile/edit');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
        contentContainerStyle={[{ paddingBottom: tabClear }, contentStyle]}
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: 8,
          }}
        >
          <Text
            style={{ fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 }}
            numberOfLines={1}
          >
            @{profile.username}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Pressable onPress={() => router.push('/news' as any)} hitSlop={HIT_SLOP_8}>
              <Feather name="bell" size={22} color={colors.ink} />
            </Pressable>
            <Pressable onPress={() => router.push('/settings')} hitSlop={HIT_SLOP_8}>
              <Feather name="menu" size={24} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        {/* Hero — clean white card */}
        <Animated.View style={[{ paddingHorizontal: 16, paddingTop: 4 }, heroFade]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Avatar with thin purple ring */}
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
                {profile.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Text style={{ fontSize: 30, fontWeight: '900', color: colors.purple }}>
                    {initial}
                  </Text>
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

            {/* Stats — a contained panel strip with dividers instead of
                Instagram's floating numbers. */}
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
              <Stat value={String(sellingCount)} label="Items" />
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.hairline }} />
              <Stat
                value={String(profile.followers_count ?? 0)}
                label="Followers"
                onPress={() => router.push('/profile/followers' as Href)}
              />
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.hairline }} />
              <Stat
                value={String(profile.following_count ?? 0)}
                label="Following"
                onPress={() => router.push('/profile/following' as Href)}
              />
            </View>
          </View>

          {/* Seller level — the progression spine. Level name + a thin
              progress bar + the single next-step requirement. Computed from
              existing data; no network. */}
          <View style={{ marginTop: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="award" size={13} color={colors.purple} />
                <Text
                  style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}
                >
                  {levelProgress.current.name}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: levelProgress.next ? colors.muteSoft : colors.purple,
                  letterSpacing: 0.4,
                }}
              >
                {levelProgress.next ? `LEVEL ${levelProgress.current.id} / ${LEVELS.length}` : 'MAX LEVEL'}
              </Text>
            </View>
            <ProgressBar fraction={levelProgress.progress} />
            {levelProgress.nextRequirement ? (
              <Text style={{ fontSize: 12.5, color: colors.mute, fontWeight: '600', marginTop: 8 }}>
                {levelProgress.nextRequirement}
              </Text>
            ) : null}
          </View>

          {/* Name + bio */}
          <View style={{ marginTop: 14 }}>
            <Text
              style={{ fontSize: 16, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}
              numberOfLines={1}
            >
              {profile.full_name || profile.username}
            </Text>
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

            {/* Seller identity — the part Instagram has no answer to. Only
                segments backed by real data render; new accounts just show
                their member-since year. */}
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
                <Pressable onPress={() => router.push('/settings' as any)}>
                  <TrustBadge icon="pause-circle" label="On vacation" emphasized />
                </Pressable>
              ) : null}
            </View>

            {/* Earned achievements — purple-accent pills, set apart from the
                neutral trust facts above. Only earned badges render. */}
            <AchievementsStrip badges={earnedBadges} />
          </View>

          {/* CTA row — sharing your shop is the action that grows it, so it
              carries the accent; editing stays quiet. */}
          <View style={{ flexDirection: 'row', marginTop: 14, gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Edit profile"
                variant="ghost"
                full
                onPress={() => router.push('/profile/edit')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Share profile" variant="primary" full onPress={handleShareProfile} />
            </View>
          </View>

          {/* Activation meter — only while the shop is incomplete, so it
              vanishes once set up (no permanent clutter). Tapping routes to the
              next missing step. */}
          <CompletionMeter completion={completion} onPressNext={handleCompletionCta} />
        </Animated.View>

        {/* Tabs */}
        <View style={{ marginTop: 22 }}>
          <Tabs
            variant="underline"
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { value: 'selling', label: 'Selling', icon: 'grid', count: sellingCount },
              { value: 'liked', label: 'Liked', icon: 'heart', count: likedCount },
              { value: 'collections', label: 'Saved', icon: 'bookmark', count: savedCount },
              { value: 'shop', label: 'Shop', icon: 'shopping-bag' },
            ]}
          />
        </View>

        {/* Tab content */}
        <View style={{ marginTop: 12 }}>
          {activeTab === 'selling' && (
            <View>
              {/* Shop snapshot: one quiet line, only when there's a shop to
                  summarize. Derived locally — no extra fetch. */}
              {!loadingSelling && selling.length > 0 ? (
                <Text
                  style={{
                    paddingHorizontal: 16,
                    marginBottom: 10,
                    fontSize: 12.5,
                    color: colors.mute,
                    fontWeight: '600',
                  }}
                >
                  {activeCount} active · {soldCount} sold · {shopLikes}{' '}
                  {shopLikes === 1 ? 'like' : 'likes'} on your items
                </Text>
              ) : null}
              <ListingsGrid
                listings={selling}
                loading={loadingSelling}
                columns={columns}
                cardW={cardW}
                empty={{
                  icon: 'shopping-bag',
                  title: 'Your shop is empty',
                  description: 'Post your first item — takes less than a minute.',
                  cta: {
                    label: 'Post an item',
                    icon: 'plus',
                    onPress: () => router.push('/(tabs)/upload'),
                  },
                }}
              />
            </View>
          )}
          {activeTab === 'liked' && (
            <ListingsGrid
              listings={liked}
              loading={loadingLiked}
              columns={columns}
              cardW={cardW}
              empty={{
                icon: 'heart',
                title: 'Nothing liked yet',
                description: "Tap the heart on items you love — they'll land here.",
              }}
            />
          )}
          {activeTab === 'shop' && (
            <View style={{ paddingHorizontal: 16 }}>
              <Card pad={0} variant="paper">
                {(() => {
                  const bundlePct = profile.bundle_discount_pct ?? 0;
                  const vacationOn = !!profile.vacation_mode;
                  const items: ShopItem[] = [
                    {
                      icon: 'shopping-bag',
                      title: 'My shop',
                      subtitle: 'Purchases, sales & payouts',
                      action: 'shop',
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
                          if (item.action === 'bundle') {
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
          )}
          {activeTab === 'collections' && (
            <View>
              <SavedListsStrip
                lists={saveLists}
                activeListId={activeListId}
                onSelect={setActiveListId}
                onLongPress={handleManageList}
                onCreate={handleCreateList}
                totalCount={savedItems.length}
              />
              <ListingsGrid
                listings={visibleSavedListings}
                loading={activeListId ? loadingListListings : loadingSaved}
                columns={columns}
                cardW={cardW}
                empty={{
                  icon: 'bookmark',
                  title: activeListId ? 'This list is empty' : 'No saved items yet',
                  description: activeListId
                    ? 'Long-press the bookmark on any listing to add it here.'
                    : 'Tap the bookmark on any listing to save it.',
                  cta: activeListId
                    ? undefined
                    : {
                        label: 'Browse',
                        icon: 'compass',
                        onPress: () => router.push('/(tabs)/discover'),
                      },
                }}
              />
            </View>
          )}
        </View>
      </ScrollView>
      <WebPullIndicator pull={pull} refreshing={refreshing} nodeTop={nodeTop} threshold={threshold} />
      {promptElement}
    </SafeAreaView>
  );
}

function SavedListsStrip({
  lists,
  activeListId,
  totalCount,
  onSelect,
  onLongPress,
  onCreate,
}: {
  lists: SaveList[];
  activeListId: string | null;
  totalCount: number;
  onSelect: (id: string | null) => void;
  onLongPress: (list: SaveList) => void;
  onCreate: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 12,
        gap: 8,
      }}
    >
      <SavedListChip
        emoji=""
        label="All"
        count={totalCount}
        active={activeListId === null}
        onPress={() => onSelect(null)}
      />
      {lists.map((list) => (
        <SavedListChip
          key={list.id}
          emoji={list.emoji}
          label={list.name}
          count={list.item_count ?? 0}
          active={activeListId === list.id}
          onPress={() => onSelect(list.id)}
          onLongPress={() => onLongPress(list)}
        />
      ))}
      <Pressable
        onPress={onCreate}
        accessibilityRole="button"
        accessibilityLabel="Create new list"
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.hairline,
          backgroundColor: colors.white,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Feather name="plus" size={16} color={colors.ink} />
      </Pressable>
    </ScrollView>
  );
}

function SavedListChip({
  emoji,
  label,
  count,
  active,
  onPress,
  onLongPress,
}: {
  emoji?: string;
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? colors.purple : colors.hairline,
        backgroundColor: active ? colors.purple : colors.white,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {emoji ? (
        <Text style={{ fontSize: 13, marginRight: 6 }}>{emoji}</Text>
      ) : null}
      <Text
        style={{
          fontSize: 13,
          fontWeight: active ? '700' : '600',
          color: active ? 'white' : colors.ink,
          letterSpacing: -0.1,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: active ? 'rgba(255,255,255,0.8)' : colors.muteSoft,
          marginLeft: 6,
        }}
      >
        {count}
      </Text>
    </Pressable>
  );
}

// Thin progress bar — purple fill on a purple-soft track. Shared by the level
// block and the completion meter so progress reads identically everywhere.
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

// Earned-achievement pills. Caps at 4 visible + a "+N" overflow chip so the
// hero never turns into a wall of badges.
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

// Profile-completion meter. Renders only while incomplete; tapping advances the
// user to the next missing step.
function CompletionMeter({
  completion,
  onPressNext,
}: {
  completion: ProfileCompletion;
  onPressNext: () => void;
}) {
  if (completion.isComplete) return null;
  return (
    <Pressable
      onPress={onPressNext}
      accessibilityRole="button"
      accessibilityLabel={`Complete your shop, ${completion.pct} percent done. Next step: ${completion.nextLabel}`}
      accessibilityHint="Opens the next setup step"
      style={({ pressed }) => ({
        marginTop: 14,
        padding: 14,
        borderRadius: radii.lg,
        backgroundColor: colors.panel,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
          Complete your shop
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.purple }}>
          {completion.pct}%
        </Text>
      </View>
      <ProgressBar fraction={completion.pct / 100} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 10,
          gap: 12,
        }}
      >
        <Text
          style={{ fontSize: 12.5, color: colors.mute, fontWeight: '600', flex: 1 }}
          numberOfLines={1}
        >
          Next: {completion.nextLabel}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.purple }}>Continue</Text>
          <Feather name="arrow-right" size={13} color={colors.purple} />
        </View>
      </View>
    </Pressable>
  );
}

// Small pill stating a seller-trust fact (rating, sales, tenure). Quiet by
// default; `emphasized` switches to the purple-soft fill for states that
// deserve attention (vacation mode).
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

function Stat({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  const body = (
    <View style={{ alignItems: 'center' }}>
      <Text
        style={{ fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}
      >
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

function ListingsGrid({
  listings,
  loading,
  columns,
  cardW,
  empty,
}: {
  listings: Listing[];
  loading: boolean;
  columns: number;
  cardW: number;
  empty: {
    title: string;
    description: string;
    icon?: any;
    cta?: { label: string; icon?: any; onPress: () => void };
  };
}) {
  if (loading) {
    return (
      <View style={{ paddingHorizontal: HORIZONTAL_PAD, flexDirection: 'row', gap: GRID_GAP }}>
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonTile key={i} width={cardW} />
        ))}
      </View>
    );
  }

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        cta={empty.cta}
      />
    );
  }

  const rows: Listing[][] = [];
  for (let i = 0; i < listings.length; i += columns) {
    rows.push(listings.slice(i, i + columns));
  }

  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: GRID_GAP }}>
          {row.map((listing, ci) => (
            <GridCard key={listing.id} index={ri * columns + ci} width={cardW}>
              <ListingCard listing={listing} />
            </GridCard>
          ))}
          {row.length < columns &&
            Array.from({ length: columns - row.length }).map((_, i) => (
              <View key={`pad-${i}`} style={{ width: cardW }} />
            ))}
        </View>
      ))}
    </View>
  );
}

function GridCard({ index, width, children }: { index: number; width: number; children: React.ReactNode }) {
  return <View style={{ width }}>{children}</View>;
}

function SkeletonTile({ width }: { width: number }) {
  return (
    <View style={{ width }}>
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: radii.md,
          backgroundColor: colors.divider,
        }}
      />
    </View>
  );
}

export default function ProfileScreen() {
  return (
    <RequireAuth>
      <ProfileScreenInner />
    </RequireAuth>
  );
}
