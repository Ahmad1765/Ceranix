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
import { colors, radii } from '@/lib/theme';
import { useGridDimensions, HIT_SLOP_8 } from '@/lib/responsive';
import { useFadeIn, useStaggeredEntrance } from '@/lib/motion';
import type { User as Profile, Listing } from '@/types';
import { Button, EmptyState, SectionHeader } from '@/components/ui';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const AVATAR_SIZE = 88;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = typeof id === 'string' ? id : '';
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followed, setFollowed] = useState(false);

  const fade = useFadeIn(0, 320);

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      fetchUserListings(userId),
    ])
      .then(([p, l]) => {
        if (cancelled) return;
        setProfile((p.data as Profile | null) ?? null);
        setListings(l);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onRefresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    const [p, l] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      fetchUserListings(userId),
    ]);
    setProfile((p.data as Profile | null) ?? null);
    setListings(l);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} hitSlop={HIT_SLOP_8}>
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
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
            onPress={() => router.back()}
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

            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around', marginLeft: 16 }}>
              <Stat value={String(listings.length)} label="Posts" />
              <Stat value={String(profile.total_sales ?? 0)} label="Sold" />
              <Stat value={rating.toFixed(1)} label="Rating" />
            </View>
          </View>

          {/* Name + bio */}
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }} numberOfLines={1}>
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
          {!isSelf && (
            <View style={{ flexDirection: 'row', marginTop: 14, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={followed ? 'Following' : 'Follow'}
                  icon={followed ? 'check' : 'user-plus'}
                  variant={followed ? 'ghost' : 'primary'}
                  full
                  onPress={() => setFollowed((v) => !v)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Message"
                  icon="message-circle"
                  variant="ghost"
                  full
                  onPress={() => router.push('/conversation/new' as any)}
                />
              </View>
            </View>
          )}
        </Animated.View>

        {/* Listings */}
        <View style={{ marginTop: 26 }}>
          <SectionHeader title="Listings" count={listings.length} rightText={listings.length === 1 ? 'item' : 'items'} />

          {listings.length === 0 ? (
            <EmptyState
              icon="package"
              title="No listings yet"
              description={`${profile.full_name || profile.username} hasn't posted anything yet.`}
            />
          ) : (
            <GridSection listings={listings} columns={columns} cardW={cardW} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, color: colors.mute, marginTop: 2 }}>{label}</Text>
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
  const style = useStaggeredEntrance(index, { delayStep: 22, offsetY: 6 });
  return <Animated.View style={[{ width }, style]}>{children}</Animated.View>;
}
