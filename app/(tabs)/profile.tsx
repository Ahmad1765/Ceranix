import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { ListingCard } from '@/components/ListingCard';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { fetchUserListings, fetchLikedListings } from '@/lib/listings';
import { colors, radii, shadow, eyebrow } from '@/lib/theme';
import { useGridDimensions, HIT_SLOP_8 } from '@/lib/responsive';
import { useStaggeredEntrance, useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';

type ProfileTab = 'Selling' | 'Liked' | 'Shop' | 'Collections';
const TABS: ProfileTab[] = ['Selling', 'Liked', 'Shop', 'Collections'];

const SHOP_ITEMS = [
  { icon: 'tag' as const, title: 'My shop', subtitle: 'Purchases, sales & payouts' },
  { icon: 'percent' as const, title: 'Bundle discount', subtitle: 'Reward buyers who shop multiple items', badge: 'Off' },
  { icon: 'pause-circle' as const, title: 'Vacation mode', subtitle: 'Pause listings while away', badge: 'Off' },
  { icon: 'share-2' as const, title: 'Share your profile', subtitle: 'Send a link to your shop' },
];

const HORIZONTAL_PAD = 16;
const GRID_GAP = 10;

function ProfileScreenInner() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('Selling');
  const [selling, setSelling] = useState<Listing[]>([]);
  const [liked, setLiked] = useState<Listing[]>([]);
  const [loadingSelling, setLoadingSelling] = useState(true);
  const [loadingLiked, setLoadingLiked] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const heroFade = useFadeIn(0, 320);

  // Compute responsive grid: 2 cols on phones, 3 on big phones, 4 on tablets.
  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [420, 768, 1024],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const loadSelling = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingSelling(true);
    const rows = await fetchUserListings(profile.id);
    setSelling(rows);
    setLoadingSelling(false);
  }, [profile?.id]);

  const loadLiked = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingLiked(true);
    const rows = await fetchLikedListings(profile.id);
    setLiked(rows);
    setLoadingLiked(false);
  }, [profile?.id]);

  useEffect(() => {
    loadSelling();
    loadLiked();
  }, [loadSelling, loadLiked]);

  useFocusEffect(
    useCallback(() => {
      loadSelling();
      loadLiked();
    }, [loadSelling, loadLiked]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSelling(), loadLiked()]);
    setRefreshing(false);
  }, [loadSelling, loadLiked]);

  if (!profile) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ink} />
      </SafeAreaView>
    );
  }

  const sellingCount = selling.length;
  const likedCount = liked.length;
  const initial = (profile.full_name || profile.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.soft }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
        contentContainerStyle={{ paddingBottom: 56 }}
      >
        {/* Top action bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 }}>
          <Text style={eyebrow}>My profile</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => router.push('/profile/edit')}
              hitSlop={HIT_SLOP_8}
              style={({ pressed }) => ({
                width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: colors.hair,
                opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Feather name="edit-2" size={16} color={colors.ink} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={HIT_SLOP_8}
              style={({ pressed }) => ({
                width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: colors.hair,
                opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Feather name="settings" size={16} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        {/* Hero identity card */}
        <Animated.View style={[{ paddingHorizontal: 20, marginTop: 6 }, heroFade]}>
          <View style={{
            backgroundColor: colors.ink,
            borderRadius: radii['3xl'],
            padding: 18,
            ...shadow.md,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32, backgroundColor: colors.lime,
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 14,
              }}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: 64, height: 64 }} contentFit="cover" />
                ) : (
                  <Text style={{ fontSize: 26, fontWeight: '900', color: colors.ink }}>{initial}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.4 }} numberOfLines={1}>
                    {profile.full_name || profile.username}
                  </Text>
                  {profile.is_verified && (
                    <View style={{ marginLeft: 6 }}>
                      <Feather name="check-circle" size={14} color={colors.lime} />
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 }} numberOfLines={1}>
                  @{profile.username}
                </Text>
                {profile.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <Feather name="map-pin" size={11} color="rgba(255,255,255,0.55)" />
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginLeft: 4 }} numberOfLines={1}>
                      {profile.location}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Stats strip */}
            <View style={{ flexDirection: 'row', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radii.lg, padding: 12 }}>
              <Stat value={Number(profile.rating ?? 0).toFixed(1)} label="Rating" />
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 8 }} />
              <Stat value={String(profile.total_sales ?? 0)} label="Sales" />
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 8 }} />
              <Stat value={String(sellingCount)} label="Listings" />
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 8 }} />
              <Stat value={String(likedCount)} label="Liked" />
            </View>
          </View>
        </Animated.View>

        {/* Promote banner */}
        <Pressable
          onPress={() => router.push('/settings')}
          style={({ pressed }) => ({
            marginHorizontal: 20, marginTop: 14,
            backgroundColor: colors.lime, borderRadius: radii['2xl'],
            paddingVertical: 12, paddingHorizontal: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }],
          })}
        >
          <MaterialCommunityIcons name="rocket-launch-outline" size={18} color={colors.ink} style={{ marginRight: 8 }} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 }}>
            Promote your profile
          </Text>
        </Pressable>

        {/* Tab pills */}
        <View style={{ marginTop: 18 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {TABS.map((tab) => {
              const active = activeTab === tab;
              const count =
                tab === 'Selling' ? sellingCount :
                tab === 'Liked' ? likedCount :
                tab === 'Collections' ? 0 : null;
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 16, paddingVertical: 9,
                    borderRadius: radii.pill,
                    backgroundColor: active ? colors.ink : colors.white,
                    borderWidth: 1.5, borderColor: active ? colors.ink : colors.hair,
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: active ? colors.white : colors.ink }}>
                    {tab}
                  </Text>
                  {count !== null && (
                    <View style={{
                      paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
                      backgroundColor: active ? colors.lime : colors.soft,
                      minWidth: 18, alignItems: 'center',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: colors.ink }}>{count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Tab content */}
        <View style={{ marginTop: 18 }}>
          {activeTab === 'Selling' && (
            <ListingsGrid
              listings={selling}
              loading={loadingSelling}
              columns={columns}
              cardW={cardW}
              emptyTitle={'Your shop is\nempty.'}
              emptyDescription="Tap Upload to list your first item — it takes under a minute."
              emptyCta={{ label: 'Upload an item', onPress: () => router.push('/(tabs)/upload') }}
            />
          )}
          {activeTab === 'Liked' && (
            <ListingsGrid
              listings={liked}
              loading={loadingLiked}
              columns={columns}
              cardW={cardW}
              emptyTitle={'Nothing\nliked yet.'}
              emptyDescription="Tap the heart on items you love — they'll all live here."
            />
          )}
          {activeTab === 'Shop' && (
            <View style={{ paddingHorizontal: 20 }}>
              <View style={{ backgroundColor: colors.white, borderRadius: radii['2xl'], borderWidth: 1, borderColor: colors.hair, overflow: 'hidden' }}>
                {SHOP_ITEMS.map((item, i) => (
                  <Pressable
                    key={item.title}
                    onPress={() => router.push('/settings' as any)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderBottomWidth: i < SHOP_ITEMS.length - 1 ? 1 : 0,
                      borderBottomColor: colors.hair,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: radii.md,
                      backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', marginRight: 14,
                    }}>
                      <Feather name={item.icon} size={16} color={colors.ink} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{item.title}</Text>
                        {item.badge && (
                          <View style={{
                            marginLeft: 8, paddingHorizontal: 6, paddingVertical: 1,
                            borderRadius: 999, backgroundColor: colors.soft,
                          }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.mute, letterSpacing: 0.4 }}>
                              {item.badge.toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.mute, marginTop: 2 }} numberOfLines={2}>{item.subtitle}</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mute} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {activeTab === 'Collections' && (
            <EmptyState
              title={'No collections\nyet.'}
              description="Group your favorite items into themed boards. Coming soon."
              icon="grid"
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '900', color: colors.white, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 3, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}

function ListingsGrid({
  listings,
  loading,
  columns,
  cardW,
  emptyTitle,
  emptyDescription,
  emptyCta,
}: {
  listings: Listing[];
  loading: boolean;
  columns: number;
  cardW: number;
  emptyTitle: string;
  emptyDescription: string;
  emptyCta?: { label: string; onPress: () => void };
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
    return <EmptyState title={emptyTitle} description={emptyDescription} cta={emptyCta} />;
  }

  // Group into rows of `columns` so we get equal gaps + clean alignment.
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
          {/* Pad incomplete trailing row so cards don't stretch */}
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
  const style = useStaggeredEntrance(index, { delayStep: 28, offsetY: 6 });
  return (
    <Animated.View style={[{ width }, style]}>{children}</Animated.View>
  );
}

function SkeletonTile({ width }: { width: number }) {
  return (
    <View style={{ width }}>
      <View style={{
        width: '100%', aspectRatio: 1 / 1.33, borderRadius: radii.sm,
        backgroundColor: colors.divider,
      }} />
      <View style={{ height: 12, borderRadius: 4, backgroundColor: colors.divider, marginTop: 8, width: '80%' }} />
      <View style={{ height: 12, borderRadius: 4, backgroundColor: colors.divider, marginTop: 4, width: '40%' }} />
    </View>
  );
}

function EmptyState({
  title,
  description,
  icon = 'package',
  cta,
}: {
  title: string;
  description: string;
  icon?: keyof typeof Feather.glyphMap;
  cta?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
      <View style={{
        width: 56, height: 56, borderRadius: 28, backgroundColor: colors.white,
        borderWidth: 1, borderColor: colors.hair,
        alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      }}>
        <Feather name={icon} size={22} color={colors.ink} />
      </View>
      <Text style={{ fontSize: 32, fontWeight: '900', color: colors.ink, lineHeight: 34, letterSpacing: -1 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 13, color: colors.mute, marginTop: 10, lineHeight: 19, maxWidth: 280 }}>
        {description}
      </Text>
      {cta && (
        <Pressable
          onPress={cta.onPress}
          style={({ pressed }) => ({
            marginTop: 18, alignSelf: 'flex-start',
            backgroundColor: colors.ink, borderRadius: radii.xl,
            paddingHorizontal: 18, paddingVertical: 12,
            flexDirection: 'row', alignItems: 'center', gap: 6,
            opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Feather name="plus" size={14} color={colors.lime} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.white }}>{cta.label}</Text>
        </Pressable>
      )}
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
