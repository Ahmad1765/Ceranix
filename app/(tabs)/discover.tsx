import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import Animated from 'react-native-reanimated';
import { ListingCard } from '@/components/ListingCard';
import { fetchListings } from '@/lib/listings';
import { colors, radii, shadow, eyebrow } from '@/lib/theme';
import { useGridDimensions, HIT_SLOP_8 } from '@/lib/responsive';
import { useFadeIn, useStaggeredEntrance } from '@/lib/motion';
import type { Category, Listing } from '@/types';

type CatTile = {
  id: Category | 'trending';
  label: string;
  icon: keyof typeof Feather.glyphMap;
  accent: string;
};

const CATEGORY_TILES: CatTile[] = [
  { id: 'trending', label: 'Trending', icon: 'trending-up', accent: '#d8f53a' },
  { id: 'clothing', label: 'Clothing', icon: 'shopping-bag', accent: '#f1edff' },
  { id: 'shoes', label: 'Shoes', icon: 'compass', accent: '#fef9c3' },
  { id: 'bags', label: 'Bags', icon: 'briefcase', accent: '#fce7f3' },
  { id: 'accessories', label: 'Accessories', icon: 'watch', accent: '#dbeafe' },
  { id: 'electronics', label: 'Electronics', icon: 'monitor', accent: '#e0f2fe' },
  { id: 'beauty', label: 'Beauty', icon: 'droplet', accent: '#fae8ff' },
  { id: 'other', label: 'Other', icon: 'box', accent: '#f1f5f9' },
];

const HORIZONTAL_PAD = 16;
const GRID_GAP = 10;

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCat, setActiveCat] = useState<CatTile['id'] | null>(null);

  const heroFade = useFadeIn(0, 320);

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [420, 768, 1024],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchListings({ tab: 'popular', limit: 60 });
    setListings(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    let rows = listings;
    if (activeCat && activeCat !== 'trending') {
      rows = rows.filter((l) => l.category === activeCat);
    }
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      rows = rows.filter((l) => {
        return (
          l.title.toLowerCase().includes(q) ||
          (l.brand?.toLowerCase().includes(q) ?? false) ||
          (l.description?.toLowerCase().includes(q) ?? false)
        );
      });
    }
    return rows;
  }, [listings, query, activeCat]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.soft }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
        contentContainerStyle={{ paddingBottom: 56 }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          <Text style={eyebrow}>Discover</Text>
          <Pressable
            hitSlop={HIT_SLOP_8}
            onPress={() => router.push('/news' as any)}
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
            <Feather name="bell" size={16} color={colors.ink} />
          </Pressable>
        </View>

        {/* Hero */}
        <Animated.View style={[{ paddingHorizontal: 20 }, heroFade]}>
          <Text
            style={{
              fontSize: 40,
              fontWeight: '900',
              color: colors.ink,
              lineHeight: 42,
              letterSpacing: -1.4,
            }}
          >
            What's{'\n'}out there.
          </Text>
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime, marginRight: 10 }} />
            <Text style={{ fontSize: 13, color: colors.mute, flex: 1, lineHeight: 19 }}>
              Browse trending finds, filter by category, or search by brand and title.
            </Text>
          </View>
        </Animated.View>

        {/* Search bar */}
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 20,
            backgroundColor: colors.white,
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: colors.hair,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            height: 50,
            ...shadow.sm,
          }}
        >
          <Feather name="search" size={18} color={colors.mute} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search items, brands, sellers"
            placeholderTextColor={colors.ghost}
            style={{ flex: 1, marginLeft: 10, fontSize: 15, color: colors.ink, padding: 0 }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable hitSlop={HIT_SLOP_8} onPress={() => setQuery('')}>
              <Feather name="x" size={16} color={colors.mute} />
            </Pressable>
          )}
        </View>

        {/* Category grid */}
        <View style={{ marginTop: 22 }}>
          <View style={{ paddingHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink, letterSpacing: -0.3 }}>
              Browse by category
            </Text>
            {activeCat && (
              <Pressable hitSlop={HIT_SLOP_8} onPress={() => setActiveCat(null)}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.mute }}>Clear</Text>
              </Pressable>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
          >
            {CATEGORY_TILES.map((cat) => {
              const active = activeCat === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setActiveCat(active ? null : cat.id)}
                  style={({ pressed }) => ({
                    width: 112,
                    height: 124,
                    borderRadius: radii['2xl'],
                    backgroundColor: active ? colors.ink : cat.accent,
                    padding: 14,
                    justifyContent: 'space-between',
                    borderWidth: active ? 0 : 1,
                    borderColor: 'rgba(0,0,0,0.04)',
                    opacity: pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: active ? colors.lime : colors.white,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={cat.icon} size={16} color={colors.ink} />
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      color: active ? colors.white : colors.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Results */}
        <View style={{ marginTop: 24 }}>
          <View
            style={{
              paddingHorizontal: 20,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink, letterSpacing: -0.3 }}>
              {query.trim().length > 0
                ? `Results for "${query.trim()}"`
                : activeCat && activeCat !== 'trending'
                ? `In ${CATEGORY_TILES.find((c) => c.id === activeCat)?.label}`
                : 'Trending'}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.mute }}>
              {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
            </Text>
          </View>

          {loading ? (
            <View style={{ paddingHorizontal: HORIZONTAL_PAD, flexDirection: 'row', gap: GRID_GAP }}>
              {Array.from({ length: columns }).map((_, i) => (
                <SkeletonTile key={i} width={cardW} />
              ))}
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
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
                <Feather name="search" size={22} color={colors.ink} />
              </View>
              <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink, lineHeight: 32, letterSpacing: -0.8 }}>
                Nothing matched.
              </Text>
              <Text style={{ fontSize: 13, color: colors.mute, marginTop: 8, lineHeight: 19, maxWidth: 280 }}>
                Try a different word, brand, or category. Pull down to refresh the feed.
              </Text>
            </View>
          ) : (
            <GridSection listings={filtered} columns={columns} cardW={cardW} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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
  const style = useStaggeredEntrance(index, { delayStep: 26, offsetY: 6 });
  return <Animated.View style={[{ width }, style]}>{children}</Animated.View>;
}

function SkeletonTile({ width }: { width: number }) {
  return (
    <View style={{ width }}>
      <View
        style={{
          width: '100%',
          aspectRatio: 1 / 1.33,
          borderRadius: radii.sm,
          backgroundColor: colors.divider,
        }}
      />
      <View style={{ height: 12, borderRadius: 4, backgroundColor: colors.divider, marginTop: 8, width: '80%' }} />
      <View style={{ height: 12, borderRadius: 4, backgroundColor: colors.divider, marginTop: 4, width: '40%' }} />
    </View>
  );
}
