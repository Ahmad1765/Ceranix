import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors, radii } from '@/lib/theme';
import { fetchSimilarToLiked } from '@/lib/myFeed';
import { fetchListings } from '@/lib/listings';
import { fetchSavedListings } from '@/lib/saves';
import {
  deleteSavedSearch,
  listSavedSearches,
  type SavedSearch,
} from '@/lib/savedSearches';
import { ListingCard } from '@/components/ListingCard';
import { DropAlertSheet } from '@/components/DropAlertSheet';
import { useToast } from '@/lib/toast';
import { useGridDimensions } from '@/lib/responsive';
import type { Category, Listing } from '@/types';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const FOR_YOU: 'for-you' = 'for-you';
const SAVED: 'saved' = 'saved';

export default function MyFeedScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const [listings, setListings] = useState<Listing[]>([]);
  const [isFallback, setIsFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  const [savedListings, setSavedListings] = useState<Listing[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [activeChip, setActiveChip] = useState<string>(FOR_YOU);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);

  const { columns, cardWidth } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const loadListings = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      if (user?.id) {
        const r = await fetchSimilarToLiked(user.id);
        if (r.ok && r.rows.length > 0) {
          setListings(r.rows);
          setIsFallback(false);
        } else {
          const fallback = await fetchListings({ tab: 'popular', limit: 60 });
          setListings(fallback);
          setIsFallback(true);
        }
      } else {
        const fallback = await fetchListings({ tab: 'popular', limit: 60 });
        setListings(fallback);
        setIsFallback(true);
      }
      setLoading(false);
    },
    [user?.id],
  );

  const loadSavedSearches = useCallback(async () => {
    if (!user?.id) {
      setSavedSearches([]);
      return;
    }
    const rows = await listSavedSearches(user.id);
    setSavedSearches(rows);
  }, [user?.id]);

  const loadSavedListings = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user?.id) {
        setSavedListings([]);
        return;
      }
      if (!opts?.silent) setLoadingSaved(true);
      const rows = await fetchSavedListings(user.id);
      setSavedListings(rows);
      if (!opts?.silent) setLoadingSaved(false);
    },
    [user?.id],
  );

  useEffect(() => {
    loadListings();
    loadSavedSearches();
    loadSavedListings();
  }, [loadListings, loadSavedSearches, loadSavedListings]);

  useFocusEffect(
    useCallback(() => {
      loadListings({ silent: true });
      loadSavedSearches();
      loadSavedListings({ silent: true });
    }, [loadListings, loadSavedSearches, loadSavedListings]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadListings({ silent: true }),
      loadSavedSearches(),
      loadSavedListings({ silent: true }),
    ]);
    setRefreshing(false);
  }, [loadListings, loadSavedSearches, loadSavedListings]);

  const onDeleteChip = useCallback(
    (search: SavedSearch) => {
      const label = search.label ?? 'Saved';
      Alert.alert(
        `Remove "${label}"?`,
        'This feed will be removed from your list.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              // Optimistic: drop locally before round-trip so the chip
              // disappears immediately on press.
              setSavedSearches((prev) => prev.filter((s) => s.id !== search.id));
              if (activeChip === search.id) setActiveChip(FOR_YOU);
              const ok = await deleteSavedSearch(search.id);
              if (!ok) {
                toast.show('Could not remove that feed', { variant: 'info', icon: 'alert-circle' });
                loadSavedSearches();
              }
            },
          },
        ],
      );
    },
    [activeChip, loadSavedSearches, toast],
  );

  const activeSavedSearch = useMemo(
    () => savedSearches.find((s) => s.id === activeChip) ?? null,
    [savedSearches, activeChip],
  );

  const showingSaved = activeChip === SAVED;

  // Client-side filter when a saved search chip is selected. Mirrors the
  // discover screen's filter logic so the chip's params actually narrow the
  // grid in-place rather than navigating away. When the "Saved" chip is
  // active we swap the dataset entirely to the user's bookmarks.
  const visibleListings = useMemo(() => {
    if (showingSaved) return savedListings;
    if (!activeSavedSearch) return listings;
    let rows = listings;
    if (activeSavedSearch.category) {
      rows = rows.filter((l) => l.category === (activeSavedSearch.category as Category));
    }
    const q = activeSavedSearch.query?.trim().toLowerCase() ?? '';
    if (q.length > 0) {
      rows = rows.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.brand?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  }, [listings, savedListings, activeSavedSearch, showingSaved]);

  const showColdStartBanner = !user;
  const showFollowCta =
    !!user && savedSearches.length === 0 && isFallback;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {/* Title */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
            My Feed
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.muteSoft,
              marginTop: 2,
              letterSpacing: -0.1,
            }}
          >
            Curated from what you like
          </Text>
        </View>

        {showColdStartBanner ? (
          <Pressable
            onPress={() => router.push('/auth/login')}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.purpleSoft,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Feather name="user-plus" size={16} color={colors.purple} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontWeight: '600' }}>
              Sign in and like a few items to see this feed personalize itself.
            </Text>
          </Pressable>
        ) : null}

        {showFollowCta ? (
          <Pressable
            onPress={() => router.push('/(tabs)/discover')}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.purpleSoft,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Feather name="compass" size={16} color={colors.purple} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontWeight: '600' }}>
              Follow some sellers or like a few items to start personalizing your feed.
            </Text>
          </Pressable>
        ) : null}

        {/* Chip row: For you + Saved + saved searches + add */}
        <ChipRow
          savedSearches={savedSearches}
          activeChip={activeChip}
          onSelectChip={setActiveChip}
          onDeleteChip={onDeleteChip}
          onAdd={() => {
            if (!user?.id) {
              toast.show('Sign in to create drop alerts', { variant: 'info', icon: 'log-in' });
              router.push('/auth/login');
              return;
            }
            setAlertSheetOpen(true);
          }}
        />

        <Grid
          rows={visibleListings}
          loading={showingSaved ? loadingSaved : loading}
          columns={columns}
          cardWidth={cardWidth}
          emptyText={
            showingSaved
              ? 'No saved items yet. Tap the bookmark on any listing to save it.'
              : 'Nothing matches this feed yet.'
          }
        />
      </ScrollView>

      {user?.id ? (
        <DropAlertSheet
          visible={alertSheetOpen}
          userId={user.id}
          onClose={() => setAlertSheetOpen(false)}
          onCreated={loadSavedSearches}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ChipRow({
  savedSearches,
  activeChip,
  onSelectChip,
  onDeleteChip,
  onAdd,
}: {
  savedSearches: SavedSearch[];
  activeChip: string;
  onSelectChip: (id: string) => void;
  onDeleteChip: (search: SavedSearch) => void;
  onAdd: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 14, paddingBottom: 10 }}
    >
      <Chip
        label="For you"
        active={activeChip === FOR_YOU}
        onPress={() => onSelectChip(FOR_YOU)}
      />
      <Chip
        label="Saved"
        active={activeChip === SAVED}
        onPress={() => onSelectChip(SAVED)}
      />
      <AddChip onPress={onAdd} />
      {savedSearches.map((s) => (
        <Chip
          key={s.id}
          label={s.label ?? 'Saved'}
          active={activeChip === s.id}
          onPress={() => onSelectChip(s.id)}
          onLongPress={() => onDeleteChip(s)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  onLongPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  // Selected state: solid grey fill, no border (Instagram-style). Unselected
  // keeps the hairline border on a white surface.
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: active ? 'transparent' : colors.hairline,
        backgroundColor: active ? 'rgba(15,15,15,0.08)' : colors.white,
        opacity: pressed ? 0.7 : 1,
      })}
    >
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
    </Pressable>
  );
}

function AddChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a new feed"
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: radii.pill,
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
  );
}

function Grid({
  rows,
  loading,
  columns,
  cardWidth,
  emptyText,
}: {
  rows: Listing[];
  loading: boolean;
  columns: number;
  cardWidth: number;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <View style={{ paddingHorizontal: HORIZONTAL_PAD, flexDirection: 'row', gap: GRID_GAP }}>
        {Array.from({ length: columns }).map((_, i) => (
          <View
            key={i}
            style={{
              width: cardWidth,
              aspectRatio: 1,
              borderRadius: 12,
              backgroundColor: 'rgba(15,15,15,0.06)',
            }}
          />
        ))}
      </View>
    );
  }
  if (rows.length === 0) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: colors.muteSoft, textAlign: 'center' }}>
          {emptyText ?? 'Nothing matches this feed yet.'}
        </Text>
      </View>
    );
  }
  const grid: Listing[][] = [];
  for (let i = 0; i < rows.length; i += columns) grid.push(rows.slice(i, i + columns));
  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}>
      {grid.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: GRID_GAP }}>
          {row.map((listing) => (
            <View key={listing.id} style={{ width: cardWidth }}>
              <ListingCard listing={listing} />
            </View>
          ))}
          {row.length < columns &&
            Array.from({ length: columns - row.length }).map((_, i) => (
              <View key={`pad-${i}`} style={{ width: cardWidth }} />
            ))}
        </View>
      ))}
    </View>
  );
}
