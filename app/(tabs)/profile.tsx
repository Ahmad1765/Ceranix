import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect, Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { ListingCard } from '@/components/ListingCard';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { fetchUserListings, fetchLikedListings } from '@/lib/listings';
import { colors, radii } from '@/lib/theme';
import { useGridDimensions, HIT_SLOP_8 } from '@/lib/responsive';
import { useStaggeredEntrance, useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';
import { Button, Card, ListRow, EmptyState, Tabs } from '@/components/ui';

type ProfileTab = 'selling' | 'liked' | 'shop' | 'collections';

const SHOP_ITEMS: {
  icon: any;
  title: string;
  subtitle: string;
  badge?: string;
}[] = [
  { icon: 'shopping-bag', title: 'My shop', subtitle: 'Purchases, sales & payouts' },
  {
    icon: 'percent',
    title: 'Bundle discount',
    subtitle: 'Reward buyers who shop multiple items',
    badge: 'Off',
  },
  {
    icon: 'pause-circle',
    title: 'Vacation mode',
    subtitle: 'Pause listings while away',
    badge: 'Off',
  },
  { icon: 'share-2', title: 'Share your profile', subtitle: 'Send a link to your shop' },
];

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const AVATAR_SIZE = 88;

function ProfileScreenInner() {
  const { profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('selling');
  const [selling, setSelling] = useState<Listing[]>([]);
  const [liked, setLiked] = useState<Listing[]>([]);
  const [loadingSelling, setLoadingSelling] = useState(true);
  const [loadingLiked, setLoadingLiked] = useState(true);
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

  // Initial load — explicitly tied to profile.id arrival.
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const [s, l] = await Promise.all([
        fetchUserListings(profile.id),
        fetchLikedListings(profile.id),
      ]);
      if (cancelled) return;
      setSelling(s);
      setLiked(l);
      setLoadingSelling(false);
      setLoadingLiked(false);
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
      refreshProfile().catch(() => {});
    }, [profile?.id, loadSelling, loadLiked, refreshProfile]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadSelling({ silent: true }), loadLiked({ silent: true })]);
    } catch {
      // swallow — RefreshControl feedback is sufficient
    } finally {
      setRefreshing(false);
    }
  }, [loadSelling, loadLiked]);

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
              <Button label="Share profile" variant="ghost" full onPress={() => {}} />
            </View>
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={HIT_SLOP_8}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.hairline,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="user-plus" size={16} color={colors.ink} />
            </Pressable>
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
              { value: 'shop', label: 'Shop', icon: 'shopping-bag' },
              { value: 'collections', label: 'Saved', icon: 'bookmark' },
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
                {SHOP_ITEMS.map((item, i) => (
                  <View key={item.title}>
                    <ListRow
                      icon={item.icon}
                      iconBg={colors.purpleSoft}
                      iconColor={colors.purple}
                      title={item.title}
                      subtitle={item.subtitle}
                      badge={item.badge}
                      badgeTone="mute"
                      onPress={() => router.push('/settings' as any)}
                    />
                    {i < SHOP_ITEMS.length - 1 && (
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.hairline,
                          marginLeft: 68,
                        }}
                      />
                    )}
                  </View>
                ))}
              </Card>
            </View>
          )}
          {activeTab === 'collections' && (
            <EmptyState
              icon="bookmark"
              title="No saved boards yet"
              description="Group your favorite items into themed boards. Coming soon."
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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
