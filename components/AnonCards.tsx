import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

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

const MID_CARDS: CategoryTileData[] = [
  {
    key: 'app',
    eyebrow: 'Get the app',
    title: 'Carrinex,\nin your pocket.',
    tagline: 'Faster checkout · push deals',
    accent: '#6C47FF',
    icon: 'phone-portrait-outline',
    src: require('../assets/images/categories/app.jpg'),
  },
  {
    key: 'activewear',
    eyebrow: 'Move',
    title: 'Activewear.',
    tagline: 'Train · run · stretch',
    accent: '#6C47FF',
    icon: 'pulse-outline',
    src: require('../assets/images/categories/activewear.jpg'),
  },
  {
    key: 'streetwear',
    eyebrow: 'Drops',
    title: 'Streetwear.',
    tagline: 'Hype tees · hoodies · caps',
    accent: '#6C47FF',
    icon: 'flame-outline',
    src: require('../assets/images/categories/streetwear.jpg'),
  },
];

const PORTRAIT_CARDS: CategoryTileData[] = [
  {
    key: 'women',
    eyebrow: 'Department',
    title: 'Women',
    tagline: 'Dresses · denim · knits',
    accent: '#6C47FF',
    icon: 'heart-outline',
    src: require('../assets/images/categories/women.jpg'),
  },
  {
    key: 'men',
    eyebrow: 'Department',
    title: 'Men',
    tagline: 'Tailoring · tees · sneakers',
    accent: '#6C47FF',
    icon: 'shirt-outline',
    src: require('../assets/images/categories/men.jpg'),
  },
  {
    key: 'kids',
    eyebrow: 'Department',
    title: 'Kids',
    tagline: 'Tiny outfits · toys · books',
    accent: '#6C47FF',
    icon: 'happy-outline',
    src: require('../assets/images/categories/kids.jpg'),
  },
  {
    key: 'lifestyle',
    eyebrow: 'Department',
    title: 'Lifestyle',
    tagline: 'Bikes · plants · books',
    accent: '#6C47FF',
    icon: 'bicycle-outline',
    src: require('../assets/images/categories/lifestyle.jpg'),
  },
];



// Each tile maps to a discover route. Cards whose value is a real category
// pass `category=`; niche themes (vintage, streetwear, departments) pass a
// `q=` keyword because the discover screen text-matches title/brand/desc,
// which is far broader than the 7 fixed categories. The "Get the app" card
// has no product meaning, so it lands on unfiltered discover.
type DiscoverRoute = { q?: string; category?: string };

const DISPLAY_TO_ROUTE: Record<string, DiscoverRoute> = {
  // Hero
  vintage: { q: 'vintage' },
  sneakers: { category: 'shoes' },
  editors: { category: 'trending' },

  // Grid
  electronics: { category: 'electronics' },
  beauty: { category: 'beauty' },
  home: { q: 'home' },
  handbags: { category: 'bags' },

  // Mid
  app: {},
  activewear: { q: 'activewear' },
  streetwear: { q: 'streetwear' },

  // Departments — discover has no gender filter, so query text is the only
  // signal that meaningfully narrows the feed.
  women: { q: 'women' },
  men: { q: 'men' },
  kids: { q: 'kids' },
  lifestyle: { q: 'lifestyle' },
};

function go(displayKey: string) {
  const route = DISPLAY_TO_ROUTE[displayKey] ?? {};
  const params = new URLSearchParams();
  if (route.q) params.set('q', route.q);
  if (route.category) params.set('category', route.category);
  const qs = params.toString();
  router.push(`/(tabs)/discover${qs ? `?${qs}` : ''}` as any);
}

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
            top: 14,
            left: 14,
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
            top: 14,
            right: 14,
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
            bottom: 14,
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

export function AnonCards() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const HERO_W = Math.round(SCREEN_WIDTH * 0.74);
  const HERO_H = Math.round(HERO_W * 0.82);

  const GRID_TILE_W = Math.floor((SCREEN_WIDTH - SCREEN_PAD * 2 - 12) / 2);
  const GRID_TILE_H = GRID_TILE_W;

  const MID_W = Math.round(SCREEN_WIDTH * 0.58);
  const MID_H = Math.round(MID_W * 1.18);

  const PORTRAIT_W = Math.round(SCREEN_WIDTH * 0.44);
  const PORTRAIT_H = Math.round(PORTRAIT_W * 1.6);

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

      {/* Row 1 — hero carousel */}
      <View style={{ marginTop: 24 }}>
        <SectionEyebrow>This week's spotlight</SectionEyebrow>
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
      <View style={{ marginTop: 28 }}>
        <SectionEyebrow>Shop by aisle</SectionEyebrow>
        <View
          style={{
            paddingHorizontal: SCREEN_PAD,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            rowGap: 12,
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

      {/* Row 3 — mid carousel */}
      <View style={{ marginTop: 28 }}>
        <SectionEyebrow>Worth a scroll</SectionEyebrow>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={MID_W + ROW_GAP}
          snapToAlignment="start"
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: ROW_GAP }}
        >
          {MID_CARDS.map((c) => (
            <CategoryTile key={c.key} data={c} width={MID_W} height={MID_H} titleSize={26} />
          ))}
        </ScrollView>
      </View>

      {/* Row 4 — portrait carousel (departments) */}
      <View style={{ marginTop: 28, marginBottom: 8 }}>
        <SectionEyebrow>Shop by department</SectionEyebrow>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={PORTRAIT_W + ROW_GAP}
          snapToAlignment="start"
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: ROW_GAP }}
        >
          {PORTRAIT_CARDS.map((c) => (
            <CategoryTile
              key={c.key}
              data={c}
              width={PORTRAIT_W}
              height={PORTRAIT_H}
              titleSize={24}
            />
          ))}
        </ScrollView>
      </View>

      {/* Editorial divider into product feed below */}
      <View style={{ paddingHorizontal: SCREEN_PAD, marginTop: 30, marginBottom: 4 }}>
        <View style={{ height: 1, backgroundColor: 'rgba(15,15,15,0.08)', marginBottom: 18 }} />
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
}
