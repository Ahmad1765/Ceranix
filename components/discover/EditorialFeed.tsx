// Editorial blocks for the Discover idle feed: a personalized welcome, a
// horizontal "digest" of wide edit cards, a personalized picks rail, and brand
// "collection" collages. All presentational — data is derived upstream in
// lib/discover.ts and passed in. Strict purple/white/black, Inter + Fraunces.

import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ListingCard } from '@/components/ListingCard';
import { getOptimizedImageUrl } from '@/lib/images';
import { colors, radii, type } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import type { Listing } from '@/types';
import type { DigestCard, Collection } from '@/lib/discover';

const PAD = 16;
const GAP = 10;
const SERIF_BOLD = type.family.serifBold; // Fraunces_700Bold
const SERIF_SEMI = 'Fraunces_600SemiBold';

const eyebrowStyle = {
  fontSize: 11,
  fontFamily: type.family.sansBold,
  color: colors.mute,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
};

// ── Welcome ────────────────────────────────────────────────────────────────
export function WelcomeEyebrow({ username }: { username: string | null }) {
  return (
    <View style={{ paddingHorizontal: PAD, marginTop: 22 }}>
      <Text style={eyebrowStyle} numberOfLines={1}>
        {username ? `Welcome @${username}` : 'Welcome to Ceranix'}
      </Text>
      <Text
        style={{
          fontFamily: SERIF_SEMI,
          fontSize: 26,
          color: colors.ink,
          letterSpacing: -0.4,
          marginTop: 4,
        }}
      >
        Today’s edit
      </Text>
    </View>
  );
}

// ── Trending searches ───────────────────────────────────────────────────────
// Outlined chips (label + arrow), Grailed's idea reinterpreted on-brand: rounded
// rectangles, uppercase Inter, a purple arrow. "Shop all" leads, then top brands.
export function TrendingSearches({
  terms,
  onSelect,
  onShopAll,
}: {
  terms: string[];
  onSelect: (term: string) => void;
  onShopAll: () => void;
}) {
  if (terms.length === 0) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={[eyebrowStyle, { paddingHorizontal: PAD }]}>Trending searches</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAD, gap: 8, marginTop: 12 }}
      >
        <Chip label="Shop all" onPress={onShopAll} />
        {terms.map((term) => (
          <Chip key={term} label={term} onPress={() => onSelect(term)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Search ${label}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.hair,
        backgroundColor: pressed ? colors.panel : colors.white,
      })}
    >
      <Text
        style={{
          fontSize: 12.5,
          fontFamily: type.family.sansBold,
          color: colors.ink,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Feather name="arrow-up-right" size={13} color={colors.purple} />
    </Pressable>
  );
}

// ── Digest ─────────────────────────────────────────────────────────────────
export function DigestRail({
  cards,
  onPress,
}: {
  cards: DigestCard[];
  onPress: (card: DigestCard) => void;
}) {
  const { width } = useWindowDimensions();
  // Wide cards that peek the next one, capped so tablets don't get one huge card.
  const cardW = Math.min(300, Math.round(width * 0.64));
  if (cards.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP, marginTop: 16 }}
    >
      {cards.map((card) => (
        <EditCard key={card.id} card={card} width={cardW} onPress={() => onPress(card)} />
      ))}
    </ScrollView>
  );
}

function EditCard({
  card,
  width,
  onPress,
}: {
  card: DigestCard;
  width: number;
  onPress: () => void;
}) {
  const src = card.image ? getOptimizedImageUrl(card.image, { width: Math.round(width * 1.5) }) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${card.title}. ${card.subtitle}`}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={{
          width: '100%',
          aspectRatio: 4 / 3,
          borderRadius: radii.lg,
          overflow: 'hidden',
          backgroundColor: colors.panel,
        }}
      >
        {src ? (
          <Image
            source={{ uri: src }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : null}
      </View>
      <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 8 }} numberOfLines={1}>
        {card.subtitle}
      </Text>
      <Text
        style={{ fontFamily: SERIF_BOLD, fontSize: 17, color: colors.ink, marginTop: 1 }}
        numberOfLines={1}
      >
        {card.title}
      </Text>
    </Pressable>
  );
}

// ── Daily picks ──────────────────────────────────────────────────────────────
export function DailyPicks({
  listings,
  onSeeMore,
  testID,
}: {
  listings: Listing[];
  onSeeMore: () => void;
  testID?: string;
}) {
  if (listings.length === 0) return null;
  return (
    <View style={{ marginTop: 26 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: PAD,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 20, color: colors.ink, letterSpacing: -0.3 }}>
          Daily picks for you
        </Text>
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={onSeeMore}
          accessibilityRole="button"
          accessibilityLabel="See more daily picks"
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: colors.divider,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ ...eyebrowStyle, color: colors.ink, letterSpacing: 1 }}>See more</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAD, gap: 12 }}
        testID={testID}
      >
        {listings.map((l) => (
          <View key={l.id} style={{ width: 160 }}>
            <ListingCard listing={l} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Recently viewed ──────────────────────────────────────────────────────────
// Vertical list of the last items the user opened: square thumb + title + price.
// A row layout reads as "pick up where you left off" better than a card rail.
export function RecentlyViewedList({
  listings,
  testID,
}: {
  listings: Listing[];
  testID?: string;
}) {
  if (listings.length === 0) return null;
  return (
    <View style={{ marginTop: 26 }} testID={testID}>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 20,
          color: colors.ink,
          letterSpacing: -0.3,
          paddingHorizontal: PAD,
          marginBottom: 12,
        }}
      >
        Recently viewed
      </Text>
      <View style={{ paddingHorizontal: PAD, gap: 8 }}>
        {listings.map((l) => (
          <RecentRow key={l.id} listing={l} />
        ))}
      </View>
    </View>
  );
}

function RecentRow({ listing }: { listing: Listing }) {
  const img = listing.images[0] ? getOptimizedImageUrl(listing.images[0], { width: 160 }) : null;
  return (
    <Pressable
      onPress={() => router.push(`/product/${listing.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${listing.brand || listing.title}, $${listing.price}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 8,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.panel : colors.white,
        borderWidth: 1,
        borderColor: colors.hair,
      })}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: colors.panel,
        }}
      >
        {img ? (
          <Image
            source={{ uri: img }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 14.5, fontFamily: type.family.sansSemibold, color: colors.ink }}
          numberOfLines={1}
        >
          {listing.brand || listing.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <Text style={{ fontSize: 14, fontFamily: type.family.sansBold, color: colors.ink }}>
            ${listing.price}
          </Text>
          {listing.size ? (
            <Text style={{ fontSize: 12.5, color: colors.mute }}>· {listing.size}</Text>
          ) : null}
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={colors.muteSoft} />
    </Pressable>
  );
}

// ── Shop by brand ────────────────────────────────────────────────────────────
// One horizontal rail of brand cards (a hero thumb + brand name), replacing the
// old stacked collage blocks so brand browsing is a single band, not three.
export function ShopByBrandRail({
  collections,
  onPress,
}: {
  collections: Collection[];
  onPress: (brand: string) => void;
}) {
  if (collections.length === 0) return null;
  return (
    <View style={{ marginTop: 26 }}>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 20,
          color: colors.ink,
          letterSpacing: -0.3,
          paddingHorizontal: PAD,
          marginBottom: 12,
        }}
      >
        Shop by brand
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAD, gap: 12 }}
      >
        {collections.map((c) => (
          <BrandCard key={c.id} collection={c} onPress={() => onPress(c.brand)} />
        ))}
      </ScrollView>
    </View>
  );
}

function BrandCard({ collection, onPress }: { collection: Collection; onPress: () => void }) {
  const img = collection.images[0]
    ? getOptimizedImageUrl(collection.images[0], { width: 300 })
    : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${collection.brand}`}
      style={({ pressed }) => ({ width: 150, opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: radii.md,
          overflow: 'hidden',
          backgroundColor: colors.panel,
        }}
      >
        {img ? (
          <Image
            source={{ uri: img }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : null}
      </View>
      <Text style={[eyebrowStyle, { marginTop: 8 }]} numberOfLines={1}>
        {collection.eyebrow}
      </Text>
      <Text
        style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: colors.ink, marginTop: 1 }}
        numberOfLines={1}
      >
        {collection.brand}
      </Text>
    </Pressable>
  );
}
