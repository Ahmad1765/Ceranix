import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { fetchUserListings, fetchLikedListings } from '@/lib/listings';
import {
  createSaveList,
  deleteSaveList,
  ensureSaveLists,
  fetchListingsInList,
  fetchSavedListings,
  listSaveLists,
  renameSaveList,
  type SaveList,
} from '@/lib/saves';
import { colors, radii } from '@/lib/theme';
import { useGridDimensions, HIT_SLOP_8 } from '@/lib/responsive';
import { useStaggeredEntrance, useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';
import { useToast } from '@/lib/toast';
import { Button, Card, ListRow, EmptyState, Tabs } from '@/components/ui';

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

function ProfileScreenInner() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const { prompt, element: promptElement } = usePrompt();
  const [activeTab, setActiveTab] = useState<ProfileTab>('selling');
  const [selling, setSelling] = useState<Listing[]>([]);
  const [liked, setLiked] = useState<Listing[]>([]);
  const [savedItems, setSavedItems] = useState<Listing[]>([]);
  const [saveLists, setSaveLists] = useState<SaveList[]>([]);
  // null = "All" — flat union of every list. A specific list id narrows
  // the grid to that bucket's items only.
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [listListings, setListListings] = useState<Listing[]>([]);
  const [loadingListListings, setLoadingListListings] = useState(false);
  const [loadingSelling, setLoadingSelling] = useState(true);
  const [loadingLiked, setLoadingLiked] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const heroFade = useFadeIn(0, 320);

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const loadSelling = useCallback(async (opts?: { silent?: boolean }) => {
    if (!profile?.id) return;
    if (!opts?.silent) setLoadingSelling(true);
    const rows = await fetchUserListings(profile.id);
    setSelling(rows);
    if (!opts?.silent) setLoadingSelling(false);
  }, [profile?.id]);

  const loadLiked = useCallback(async (opts?: { silent?: boolean }) => {
    if (!profile?.id) return;
    if (!opts?.silent) setLoadingLiked(true);
    const rows = await fetchLikedListings(profile.id);
    setLiked(rows);
    if (!opts?.silent) setLoadingLiked(false);
  }, [profile?.id]);

  const loadSaved = useCallback(async (opts?: { silent?: boolean }) => {
    if (!profile?.id) return;
    if (!opts?.silent) setLoadingSaved(true);
    // Seed starter lists on first visit, then load the flat union of all
    // saved listings + the lists strip in parallel.
    await ensureSaveLists(profile.id);
    const [rows, lists] = await Promise.all([
      fetchSavedListings(profile.id),
      listSaveLists(profile.id),
    ]);
    setSavedItems(rows);
    setSaveLists(lists);
    if (!opts?.silent) setLoadingSaved(false);
  }, [profile?.id]);

  // When a specific list is active, pull just that list's items.
  useEffect(() => {
    if (!activeListId) {
      setListListings([]);
      return;
    }
    let cancelled = false;
    setLoadingListListings(true);
    fetchListingsInList(activeListId).then((rows) => {
      if (cancelled) return;
      setListListings(rows);
      setLoadingListListings(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeListId]);

  const visibleSavedListings = useMemo(
    () => (activeListId ? listListings : savedItems),
    [activeListId, listListings, savedItems],
  );

  const handleCreateList = useCallback(async () => {
    if (!profile?.id) return;
    const name = await prompt({
      title: 'New list',
      message: 'Name your save list',
      placeholder: 'e.g. Summer outfits',
      submitLabel: 'Create',
    });
    if (!name) return;
    const created = await createSaveList(profile.id, name);
    if (created) {
      setSaveLists((prev) => [...prev, { ...created, item_count: 0 }]);
      setActiveListId(created.id);
    } else {
      toast.show("Couldn't create list", { variant: 'info', icon: 'alert-circle' });
    }
  }, [profile?.id, prompt, toast]);

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
              setSaveLists((prev) =>
                prev.map((l) => (l.id === list.id ? { ...l, name: next } : l)),
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
            setSaveLists((prev) => prev.filter((l) => l.id !== list.id));
            if (activeListId === list.id) setActiveListId(null);
            // Re-pull the flat union since this list's items are gone.
            if (profile?.id) loadSaved({ silent: true });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [activeListId, loadSaved, profile?.id, prompt, toast],
  );

  // Initial load — explicitly tied to profile.id arrival.
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const [s, l, sv] = await Promise.all([
        fetchUserListings(profile.id),
        fetchLikedListings(profile.id),
        fetchSavedListings(profile.id),
      ]);
      if (cancelled) return;
      setSelling(s);
      setLiked(l);
      setSavedItems(sv);
      setLoadingSelling(false);
      setLoadingLiked(false);
      setLoadingSaved(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  // Re-fetch silently when tab regains focus (after a new upload, etc.).
  // refreshProfile() pulls fresh followers_count/following_count so toggling
  // a follow on /user/[id] is reflected here without a manual reload.
  useFocusEffect(
    useCallback(() => {
      if (!profile?.id) return;
      loadSelling({ silent: true }).catch(() => {});
      loadLiked({ silent: true }).catch(() => {});
      loadSaved({ silent: true }).catch(() => {});
      refreshProfile().catch(() => {});
    }, [profile?.id, loadSelling, loadLiked, loadSaved, refreshProfile]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadSelling({ silent: true }),
        loadLiked({ silent: true }),
        loadSaved({ silent: true }),
      ]);
    } catch {
      // swallow — RefreshControl feedback is sufficient
    } finally {
      setRefreshing(false);
    }
  }, [loadSelling, loadLiked, loadSaved]);



const handleShareProfile = useCallback(async () => {
  if (!profile?.id) return;
  const handle = profile.username ?? 'this seller';
  const url = `${APP_URL}/user/${profile.id}`;
  try {
    const result = await Share.share({ message: `Check out @${handle} on Carrinix\n${url}`, url });
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
        contentContainerStyle={{ paddingBottom: 96 }}
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

            {/* Stats inline */}
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                justifyContent: 'space-around',
                marginLeft: 16,
              }}
            >
              <Stat value={String(sellingCount)} label="Posts" />
              <Stat
                value={String(profile.followers_count ?? 0)}
                label="Followers"
                onPress={() => router.push('/profile/followers' as Href)}
              />
              <Stat
                value={String(profile.following_count ?? 0)}
                label="Following"
                onPress={() => router.push('/profile/following' as Href)}
              />
            </View>
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
          </View>

          {/* CTA row */}
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
              <Button label="Share profile" variant="ghost" full onPress={handleShareProfile} />
            </View>
          </View>
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
        borderColor: active ? 'transparent' : colors.hairline,
        backgroundColor: active ? 'rgba(15,15,15,0.08)' : colors.white,
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
          color: colors.ink,
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
          color: colors.muteSoft,
          marginLeft: 6,
        }}
      >
        {count}
      </Text>
    </Pressable>
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
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} hitSlop={HIT_SLOP_8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
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
  const style = useStaggeredEntrance(index, { delayStep: 22, offsetY: 6 });
  return <Animated.View style={[{ width }, style]}>{children}</Animated.View>;
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
