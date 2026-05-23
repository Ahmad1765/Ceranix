import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { fetchUserListings } from '@/lib/listings';
import { getOptimizedImageUrl } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { ListingCard } from '@/components/ListingCard';
import { colors, radii, shadow, eyebrow } from '@/lib/theme';
import { useGridDimensions, HIT_SLOP_8 } from '@/lib/responsive';
import { useFadeIn, useStaggeredEntrance } from '@/lib/motion';
import type { User as Profile, Listing } from '@/types';

const HORIZONTAL_PAD = 16;
const GRID_GAP = 10;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = typeof id === 'string' ? id : '';
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followed, setFollowed] = useState(false);

  const heroFade = useFadeIn(0, 320);

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [420, 768, 1024],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const load = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const [p, l] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      fetchUserListings(userId),
    ]);
    setProfile((p.data as Profile | null) ?? null);
    setListings(l);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ink} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.soft }}>
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} hitSlop={HIT_SLOP_8}>
            <Feather name="arrow-left" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>User not found</Text>
          <Text style={{ fontSize: 13, color: colors.mute, marginTop: 6, textAlign: 'center' }}>
            This profile may have been removed.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const avatar = profile.avatar_url ? getOptimizedImageUrl(profile.avatar_url, { width: 200 }) : null;
  const initial = (profile.full_name || profile.username || 'U').trim().charAt(0).toUpperCase();
  const isSelf = authUser?.id === profile.id;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.soft }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
        contentContainerStyle={{ paddingBottom: 56 }}
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 6,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={HIT_SLOP_8}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.white,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.hair,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="arrow-left" size={18} color={colors.ink} />
          </Pressable>
          <Text style={eyebrow}>Profile</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Identity card */}
        <Animated.View style={[{ paddingHorizontal: 20, marginTop: 6 }, heroFade]}>
          <View
            style={{
              backgroundColor: colors.ink,
              borderRadius: radii['3xl'],
              padding: 18,
              ...shadow.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.lime,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  marginRight: 14,
                }}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={{ width: 64, height: 64 }} contentFit="cover" />
                ) : (
                  <Text style={{ fontSize: 26, fontWeight: '900', color: colors.ink }}>{initial}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text
                    style={{ fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.4 }}
                    numberOfLines={1}
                  >
                    {profile.full_name || profile.username}
                  </Text>
                  {profile.is_verified && (
                    <View style={{ marginLeft: 6 }}>
                      <Feather name="check-circle" size={14} color={colors.lime} />
                    </View>
                  )}
                </View>
                <Text
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}
                  numberOfLines={1}
                >
                  @{profile.username}
                </Text>
                {profile.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <Feather name="map-pin" size={11} color="rgba(255,255,255,0.55)" />
                    <Text
                      style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginLeft: 4 }}
                      numberOfLines={1}
                    >
                      {profile.location}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {profile.bio && (
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 14, lineHeight: 19 }}>
                {profile.bio}
              </Text>
            )}

            {/* Stats strip */}
            <View
              style={{
                flexDirection: 'row',
                marginTop: 14,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderRadius: radii.lg,
                padding: 12,
              }}
            >
              <Stat value={Number(profile.rating ?? 0).toFixed(1)} label="Rating" />
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 8 }} />
              <Stat value={String(profile.total_sales ?? 0)} label="Sales" />
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 8 }} />
              <Stat value={String(listings.length)} label="Listings" />
            </View>

            {/* CTA row */}
            {!isSelf && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <Pressable
                  onPress={() => setFollowed((v) => !v)}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 44,
                    borderRadius: radii.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: followed ? 'rgba(255,255,255,0.1)' : colors.lime,
                    borderWidth: followed ? 1 : 0,
                    borderColor: 'rgba(255,255,255,0.2)',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Feather name={followed ? 'check' : 'plus'} size={14} color={followed ? colors.white : colors.ink} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      color: followed ? colors.white : colors.ink,
                    }}
                  >
                    {followed ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 44,
                    borderRadius: radii.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Feather name="message-circle" size={14} color={colors.white} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.white }}>Message</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Section header */}
        <View style={{ paddingHorizontal: 20, marginTop: 22, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink, letterSpacing: -0.3 }}>
            Listings
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.mute }}>
            {listings.length} {listings.length === 1 ? 'item' : 'items'}
          </Text>
        </View>

        {listings.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.white,
                borderWidth: 1,
                borderColor: colors.hair,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Feather name="package" size={22} color={colors.ink} />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink, lineHeight: 32, letterSpacing: -0.8 }}>
              No listings yet.
            </Text>
            <Text style={{ fontSize: 13, color: colors.mute, marginTop: 8, lineHeight: 19, maxWidth: 280 }}>
              {profile.full_name || profile.username} hasn't posted anything yet. Check back soon.
            </Text>
          </View>
        ) : (
          <GridSection listings={listings} columns={columns} cardW={cardW} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '900', color: colors.white, letterSpacing: -0.3 }}>{value}</Text>
      <Text
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.55)',
          marginTop: 3,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function GridSection({ listings, columns, cardW }: { listings: Listing[]; columns: number; cardW: number }) {
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
  const style = useStaggeredEntrance(index, { delayStep: 28, offsetY: 6 });
  return <Animated.View style={[{ width }, style]}>{children}</Animated.View>;
}
