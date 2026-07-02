import { memo } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CategorySticker, type StickerSpec } from './CategorySticker';

const SCREEN_PAD = 16;
const ROW_GAP = 12;
const TILE_RADIUS = 18;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type CategoryTileData = {
  key: string;
  eyebrow: string;
  title: string;
  tagline: string;
  accent: string;
  icon: IoniconName;
  src: any;
};

const HERO_CARDS: CategoryTileData[] = [
  {
    key: 'vintage',
    eyebrow: 'The Vintage Edit',
    title: 'Pre-loved\ntreasures.',
    tagline: 'Curated finds with a story',
    accent: '#6C47FF',
    icon: 'leaf-outline',
    src: require('../assets/images/categories/vintage.jpg'),
  },
  {
    key: 'sneakers',
    eyebrow: 'Sneaker Drop',
    title: 'Hype\nawaits.',
    tagline: 'Fresh kicks, daily',
    accent: '#6C47FF',
    icon: 'flash-outline',
    src: require('../assets/images/categories/sneakers.jpg'),
  },
  {
    key: 'editors',
    eyebrow: "Editor's Picks",
    title: 'Hand-picked\nfor you.',
    tagline: 'Selected by the Carrinex team',
    accent: '#6C47FF',
    icon: 'sparkles-outline',
    src: require('../assets/images/categories/editors.jpg'),
  },
];

const GRID_CARDS: CategoryTileData[] = [
  {
    key: 'electronics',
    eyebrow: 'Tech',
    title: 'Electronics',
    tagline: 'Phones · audio · games',
    accent: '#6C47FF',
    icon: 'hardware-chip-outline',
    src: require('../assets/images/categories/electronics.jpg'),
  },
  {
    key: 'beauty',
    eyebrow: 'Glow',
    title: 'Beauty',
    tagline: 'Skin · scent · self-care',
    accent: '#6C47FF',
    icon: 'flower-outline',
    src: require('../assets/images/categories/beauty.jpg'),
  },
  {
    key: 'home',
    eyebrow: 'Live well',
    title: 'Home & Living',
    tagline: 'Décor · ceramics · linens',
    accent: '#6C47FF',
    icon: 'home-outline',
    src: require('../assets/images/categories/home.jpg'),
  },
  {
    key: 'handbags',
    eyebrow: 'Designer',
    title: 'Handbags',
    tagline: 'Authenticated luxury',
    accent: '#6C47FF',
    icon: 'bag-handle-outline',
    src: require('../assets/images/categories/handbags.jpg'),
  },
];

// Quick category shortcuts — the horizontal icon row under the headline.
// Same routing table as the tiles (keys resolve through DISPLAY_TO_ROUTE).
// Each entry carries a sticker spec: vivid fills deliberately outside the
// 3-color palette (explicit product call — gen-z sticker-sheet vibe, like
// the foodora reference) while labels and layout stay on-system.
// Capped at 6: one comfortable screenful with the 7th edge peeking as a
// scroll affordance. More belongs on the discover tab, not the home page.
const QUICK_CATS: { key: string; label: string; sticker: StickerSpec }[] = [
  { key: 'deals', label: 'Deals', sticker: { icon: 'pricetag', color: '#FF4D8D', deep: '#8E1247' } },
  { key: 'sneakers', label: 'Sneakers', sticker: { icon: 'flash', color: '#FFB03A', deep: '#8A4D00' } },
  { key: 'streetwear', label: 'Streetwear', sticker: { icon: 'flame', color: '#FF5757', deep: '#7E1010' } },
  { key: 'electronics', label: 'Tech', sticker: { icon: 'hardware-chip', color: '#36C5F0', deep: '#0B5570' } },
  { key: 'beauty', label: 'Beauty', sticker: { icon: 'flower', color: '#F45BC0', deep: '#771254' } },
  { key: 'vintage', label: 'Vintage', sticker: { icon: 'leaf', color: '#33D6A6', deep: '#0A5C44' } },
];

// Each tile maps to a discover route. Cards whose value is a real category
// pass `category=`; niche themes (vintage, streetwear, departments) pass a
// `q=` keyword because the discover screen text-matches title/brand/desc,
// which is far broader than the 7 fixed categories. The "Get the app" card
// has no product meaning, so it lands on unfiltered discover.
type DiscoverRoute = { q?: string; category?: string };

const DISPLAY_TO_ROUTE: Record<string, DiscoverRoute> = {
  // Quick row
  deals: { category: 'trending' },
  streetwear: { q: 'streetwear' },

  // Hero
  vintage: { q: 'vintage' },
  sneakers: { category: 'shoes' },
  editors: { category: 'trending' },

  // Grid
  electronics: { category: 'electronics' },
  beauty: { category: 'beauty' },
  home: { q: 'home' },
  handbags: { category: 'bags' },
};

function go(displayKey: string) {
  const route = DISPLAY_TO_ROUTE[displayKey] ?? {};
  const params = new URLSearchParams();
  if (route.q) params.set('q', route.q);
  if (route.category) params.set('category', route.category);
  const qs = params.toString();
  router.push(`/(tabs)/discover${qs ? `?${qs}` : ''}` as any);
}

// Small uppercase section label with a leading accent dot — sits above a
// content row to title it. Palette-safe: purple dot, ink text.
function SectionEyebrow({ children }: { children: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SCREEN_PAD,
        marginBottom: 12,
      }}
    >
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#6C47FF', marginRight: 8 }}
      />
      <Text
        style={{
          fontSize: 11,
          color: '#0F0F0F',
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          fontFamily: 'Inter_700Bold',
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function CategoryTile({
  data,
  width,
  height,
  titleSize,
}: {
  data: CategoryTileData;
  width: number;
  height: number;
  titleSize: number;
}) {
  return (
    <Pressable
      onPress={() => go(data.key)}
      style={({ pressed }) => ({
        width,
        opacity: pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View
        style={{
          width,
          height,
          borderRadius: TILE_RADIUS,
          overflow: 'hidden',
          backgroundColor: '#0F0F0F',
        }}
      >
        {/* Photographic background */}
        <Image
          source={data.src}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={250}
        />

        {/* Bottom-to-top dark gradient for text legibility */}
        <LinearGradient
          colors={['rgba(15,15,15,0.05)', 'rgba(15,15,15,0.45)', 'rgba(15,15,15,0.85)']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Icon chip — top-left, frosted */}
        <View
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.28)',
          }}
        >
          <Ionicons name={data.icon} size={17} color="#ffffff" />
        </View>

        {/* Corner sticker — top-right. White pill, ink text. 17.6:1 AA pass. */}
        <View
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
          }}
        >
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: '#0F0F0F',
            }}
          />
          <Text
            style={{
              fontSize: 9,
              color: '#0F0F0F',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              fontFamily: 'Inter_700Bold',
            }}
          >
            Carrinex
          </Text>
        </View>

        {/* Text content — bottom-left, layered */}
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.78)',
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              marginBottom: 4,
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {data.eyebrow}
          </Text>
          <Text
            style={{
              fontSize: titleSize,
              color: '#ffffff',
              letterSpacing: -0.6,
              lineHeight: titleSize * 1.05,
              fontFamily: 'Fraunces_700Bold',
              textShadowColor: 'rgba(0,0,0,0.35)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 6,
            }}
          >
            {data.title}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.78)',
              marginTop: 5,
              fontFamily: 'Inter_400Regular',
            }}
            numberOfLines={1}
          >
            {data.tagline}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Horizontal shortcut row: tilted die-cut sticker icons with a two-line-max
// label, scrolling edge to edge under the headline.
function QuickCategoryRow() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 16, paddingVertical: 4 }}
    >
      {QUICK_CATS.map((c, i) => (
        <Pressable
          key={c.key}
          onPress={() => go(c.key)}
          accessibilityRole="button"
          accessibilityLabel={c.label}
          style={({ pressed }) => ({
            alignItems: 'center',
            width: 74,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <CategorySticker spec={c.sticker} index={i} size={64} />
          <Text
            style={{
              fontSize: 12,
              lineHeight: 15,
              color: '#0F0F0F',
              marginTop: 8,
              textAlign: 'center',
              fontFamily: 'Inter_600SemiBold',
            }}
            numberOfLines={2}
          >
            {c.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const TOP_BRANDS = [
  { key: 'apple', label: 'Apple', q: 'apple', src: require('../assets/images/brand_apple.png') },
  { key: 'sony', label: 'Sony', q: 'sony', src: require('../assets/images/brand_sony.png') },
  { key: 'nike', label: 'Nike', q: 'nike', src: require('../assets/images/brand_nike.png') },
  { key: 'samsung', label: 'Samsung', q: 'samsung', src: require('../assets/images/brand_samsung.png') },
  { key: 'adidas', label: 'Adidas', q: 'adidas', src: require('../assets/images/brand_adidas.png') },
  { key: 'nintendo', label: 'Nintendo', q: 'nintendo', src: require('../assets/images/brand_nintendo.png') },
];

function TopBrandsRow() {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ paddingHorizontal: SCREEN_PAD, marginBottom: 12 }}>
        <Text
          style={{
            fontSize: 18,
            color: '#0F0F0F',
            fontFamily: 'Inter_700Bold',
          }}
        >
          Top brands
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 16 }}
      >
        {TOP_BRANDS.map((b) => (
          <Pressable
            key={b.key}
            onPress={() => router.push(`/(tabs)/discover?q=${b.q}` as any)}
            style={({ pressed }) => ({
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
              width: 90,
            })}
          >
            <View
              style={{
                width: 90,
                height: 90,
                borderRadius: 45,
                backgroundColor: '#F3F4F6',
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(15,15,15,0.05)',
              }}
            >
              <Image
                source={b.src}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
            <Text
              style={{
                fontSize: 14,
                color: '#0F0F0F',
                marginTop: 8,
                fontFamily: 'Inter_600SemiBold',
              }}
            >
              {b.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export const AnonCards = memo(function AnonCards() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const HERO_W = Math.round(SCREEN_WIDTH * 0.74);
  const HERO_H = Math.round(HERO_W * 0.82);

  const GRID_TILE_W = Math.floor((SCREEN_WIDTH - SCREEN_PAD * 2 - 12) / 2);
  const GRID_TILE_H = GRID_TILE_W;

  return (
    <View style={{ paddingTop: 8, paddingBottom: 8 }}>
      {/* Editorial heading */}
      <View style={{ paddingHorizontal: SCREEN_PAD, marginBottom: 4 }}>
        <Text
          style={{
            fontSize: 34,
            color: '#0F0F0F',
            letterSpacing: -1.4,
            lineHeight: 38,
            fontFamily: 'Fraunces_600SemiBold',
          }}
        >
          Find your{' '}
          <Text style={{ fontFamily: 'Fraunces_700Bold_Italic', color: '#6C47FF' }}>
            everything
          </Text>
          .
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: 'rgba(15,15,15,0.62)',
            marginTop: 8,
            lineHeight: 20,
            fontFamily: 'Inter_400Regular',
          }}
        >
          Curated finds across every corner of the marketplace.
        </Text>
      </View>

      {/* Quick category shortcuts + section break into the editorial tiles */}
      <View style={{ marginTop: 12 }}>
        <QuickCategoryRow />
      </View>
      <View style={{ height: 1, backgroundColor: 'rgba(15,15,15,0.08)', marginTop: 12 }} />

      {/* Row 1 — hero carousel */}
      <View style={{ marginTop: 16 }}>
        <SectionEyebrow>This week&apos;s spotlight</SectionEyebrow>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={HERO_W + ROW_GAP}
          snapToAlignment="start"
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: ROW_GAP }}
        >
          {HERO_CARDS.map((c) => (
            <CategoryTile key={c.key} data={c} width={HERO_W} height={HERO_H} titleSize={28} />
          ))}
        </ScrollView>
      </View>

      {/* Row 2 — 2x2 grid */}
      <View style={{ marginTop: 16 }}>
        <SectionEyebrow>Shop by aisle</SectionEyebrow>
        <View
          style={{
            paddingHorizontal: SCREEN_PAD,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {GRID_CARDS.map((c) => (
            <CategoryTile
              key={c.key}
              data={c}
              width={GRID_TILE_W}
              height={GRID_TILE_H}
              titleSize={22}
            />
          ))}
        </View>
      </View>

      {/* Top brands */}
      <TopBrandsRow />

      {/* Editorial divider into product feed below */}
      <View style={{ paddingHorizontal: SCREEN_PAD, marginTop: 20, marginBottom: 4 }}>
        <View style={{ height: 1, backgroundColor: 'rgba(15,15,15,0.08)', marginBottom: 18 }} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text
            style={{
              fontSize: 22,
              color: '#0F0F0F',
              letterSpacing: -0.4,
              lineHeight: 26,
              fontFamily: 'Fraunces_600SemiBold',
            }}
          >
            Picked for you
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/discover' as any)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="See all listings on discover"
          >
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#6C47FF' }}>
              See all
            </Text>
          </Pressable>
        </View>
        <Text
          style={{
            fontSize: 13,
            color: 'rgba(15,15,15,0.62)',
            marginTop: 4,
            fontFamily: 'Inter_400Regular',
          }}
        >
          Fresh listings from the community.
        </Text>
      </View>
    </View>
  );
});
