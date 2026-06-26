// Editorial blocks for the Discover idle feed: a personalized welcome, a
// horizontal "digest" of wide edit cards, a personalized picks rail, and brand
// "collection" collages. All presentational — data is derived upstream in
// lib/discover.ts and passed in. Strict purple/white/black, Inter + Fraunces.

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ListingCard } from '@/components/ListingCard';
import { getOptimizedImageUrl } from '@/lib/images';
import { colors, radii, shadow, type } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import type { Listing } from '@/types';
import type { DigestCard, Collection, PromoSlide, PromoTarget } from '@/lib/discover';

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
// Section heading for the idle feed. The personalized "Welcome @username"
// eyebrow was removed; this now just titles the edit.
export function WelcomeEyebrow() {
  return (
    <View style={{ paddingHorizontal: PAD, marginTop: 22 }}>
      <Text
        style={{
          fontFamily: SERIF_SEMI,
          fontSize: 26,
          color: colors.ink,
          letterSpacing: -0.4,
        }}
      >
        Today’s edit
      </Text>
    </View>
  );
}

// ── Promo banner ─────────────────────────────────────────────────────────────
// Hero promotional carousel at the top of the idle feed. Same shape as a
// delivery-app promo banner, reinterpreted strictly on-brand: a deep purple
// card with a tonal arc for depth, a serif headline with hard weight contrast,
// a high-contrast white CTA, and a framed product tile (no cheap bleed seam).
// Auto-advances, with an expanding-pill page indicator. Purple/white/black,
// no gradients.
const PROMO_H = 184;
const PROMO_AUTOPLAY_MS = 4800;

export function PromoBanner({
  slides,
  onPress,
}: {
  slides: PromoSlide[];
  onPress: (target: PromoTarget) => void;
}) {
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const activeRef = useRef(0);

  // Page width: the card plus its trailing gap, so each snap lands one slide on.
  const cardW = width - PAD * 2;
  const page = cardW + GAP;

  const setIndex = (i: number) => {
    activeRef.current = i;
    setActive(i);
  };

  // Track the active slide continuously. onMomentumScrollEnd is unreliable on
  // react-native-web (it misses programmatic scrolls and some snap settles), so
  // we derive the index from the live scroll offset instead.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / page);
    const clamped = Math.max(0, Math.min(slides.length - 1, i));
    if (clamped !== activeRef.current) setIndex(clamped);
  };

  // Auto-advance. Each tick reads the live index off the ref so manual swipes
  // (which update the ref via onMomentumEnd) don't get fought by a stale closure.
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      const next = (activeRef.current + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: next * page, animated: true });
      setIndex(next);
    }, PROMO_AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [slides.length, page]);

  if (slides.length === 0) return null;

  return (
    <View style={{ marginTop: 18 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={page}
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP }}
      >
        {slides.map((s) => (
          <PromoCard key={s.id} slide={s} width={cardW} onPress={() => onPress(s.target)} />
        ))}
      </ScrollView>

      {/* Page indicator — a frosted pill overlaid inside the banner, bottom
          center, so it floats on the card rather than taking feed space. */}
      {slides.length > 1 ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={{
              position: 'absolute',
              bottom: 12,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: radii.pill,
                backgroundColor: 'rgba(15,15,15,0.28)',
              }}
            >
              {slides.map((s, i) => (
                <View
                  key={s.id}
                  style={{
                    width: i === active ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      i === active ? colors.white : 'rgba(255,255,255,0.5)',
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PromoCard({
  slide,
  width,
  onPress,
}: {
  slide: PromoSlide;
  width: number;
  onPress: () => void;
}) {
  const src = slide.image ? getOptimizedImageUrl(slide.image, { width: 600 }) : null;
  const hasImg = !!src;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${slide.eyebrow}. ${slide.title.replace('\n', ' ')}. Shop now`}
      style={({ pressed }) => ({
        width,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View
        style={{
          width: '100%',
          height: PROMO_H,
          borderRadius: radii['3xl'],
          overflow: 'hidden',
          backgroundColor: colors.purpleDeep,
          flexDirection: 'row',
          ...shadow.lg,
        }}
      >
        {/* Product image, full-bleed to the right edge so it meets the copy
            panel like a real promo banner (no floating placeholder box). The
            purple fill underneath means a slow / missing image still reads as
            part of the card, never an empty hole. */}
        {hasImg ? (
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '46%' }}>
            <Image
              source={{ uri: src }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={250}
            />
            {/* Brand tint — a single flat purple wash unifies any product photo
                with the card. Not a gradient. */}
            <View
              pointerEvents="none"
              style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(85,56,214,0.22)' }}
            />
          </View>
        ) : null}

        {/* Tonal arc — a single lighter-purple disc gives the flat fill depth
            and anchors the headline. Sits behind the copy. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -64,
            top: -72,
            width: 210,
            height: 210,
            borderRadius: 105,
            backgroundColor: colors.purple,
            opacity: 0.5,
          }}
        />

        {/* Copy column — width-capped (not flex) so the headline always wraps
            inside the panel and never runs under the image. */}
        <View
          style={{
            width: hasImg ? '58%' : '100%',
            paddingLeft: 22,
            paddingRight: 12,
            paddingVertical: 20,
            justifyContent: 'space-between',
          }}
        >
          <View>
            <View
              style={{
                alignSelf: 'flex-start',
                paddingHorizontal: 11,
                paddingVertical: 5,
                borderRadius: radii.pill,
                backgroundColor: 'rgba(255,255,255,0.16)',
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontFamily: type.family.sansBold,
                  color: colors.white,
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                }}
                numberOfLines={1}
              >
                {slide.eyebrow}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: SERIF_BOLD,
                fontSize: 21,
                lineHeight: 25,
                color: colors.white,
                letterSpacing: -0.3,
                marginTop: 10,
              }}
            >
              {slide.title}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              alignSelf: 'flex-start',
              backgroundColor: colors.white,
              paddingLeft: 16,
              paddingRight: 13,
              paddingVertical: 9,
              borderRadius: radii.pill,
              ...shadow.sm,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: type.family.sansBold,
                color: colors.purpleDeep,
                letterSpacing: 0.2,
              }}
            >
              Shop now
            </Text>
            <Feather name="arrow-right" size={14} color={colors.purpleDeep} />
          </View>
        </View>
      </View>
    </Pressable>
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
