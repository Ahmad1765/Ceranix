import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
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
    accent: '#f4e8d0',
    icon: 'leaf-outline',
    src: require('../assets/images/categories/vintage.jpg'),
  },
  {
    key: 'sneakers',
    eyebrow: 'Sneaker Drop',
    title: 'Hype\nawaits.',
    tagline: 'Fresh kicks, daily',
    accent: '#d8f53a',
    icon: 'flash-outline',
    src: require('../assets/images/categories/sneakers.jpg'),
  },
  {
    key: 'editors',
    eyebrow: "Editor's Picks",
    title: 'Hand-picked\nfor you.',
    tagline: 'Selected by the Carrinex team',
    accent: '#c4b5fd',
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
    accent: '#67e8f9',
    icon: 'hardware-chip-outline',
    src: require('../assets/images/categories/electronics.jpg'),
  },
  {
    key: 'beauty',
    eyebrow: 'Glow',
    title: 'Beauty',
    tagline: 'Skin · scent · self-care',
    accent: '#f9a8d4',
    icon: 'flower-outline',
    src: require('../assets/images/categories/beauty.jpg'),
  },
  {
    key: 'home',
    eyebrow: 'Live well',
    title: 'Home & Living',
    tagline: 'Décor · ceramics · linens',
    accent: '#a3d977',
    icon: 'home-outline',
    src: require('../assets/images/categories/home.jpg'),
  },
  {
    key: 'handbags',
    eyebrow: 'Designer',
    title: 'Handbags',
    tagline: 'Authenticated luxury',
    accent: '#fcd34d',
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
    accent: '#d8f53a',
    icon: 'phone-portrait-outline',
    src: require('../assets/images/categories/app.jpg'),
  },
  {
    key: 'activewear',
    eyebrow: 'Move',
    title: 'Activewear.',
    tagline: 'Train · run · stretch',
    accent: '#fb923c',
    icon: 'pulse-outline',
    src: require('../assets/images/categories/activewear.jpg'),
  },
  {
    key: 'streetwear',
    eyebrow: 'Drops',
    title: 'Streetwear.',
    tagline: 'Hype tees · hoodies · caps',
    accent: '#d8f53a',
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
    accent: '#f9a8d4',
    icon: 'heart-outline',
    src: require('../assets/images/categories/women.jpg'),
  },
  {
    key: 'men',
    eyebrow: 'Department',
    title: 'Men',
    tagline: 'Tailoring · tees · sneakers',
    accent: '#7dd3fc',
    icon: 'shirt-outline',
    src: require('../assets/images/categories/men.jpg'),
  },
  {
    key: 'kids',
    eyebrow: 'Department',
    title: 'Kids',
    tagline: 'Tiny outfits · toys · books',
    accent: '#fde047',
    icon: 'happy-outline',
    src: require('../assets/images/categories/kids.jpg'),
  },
  {
    key: 'lifestyle',
    eyebrow: 'Department',
    title: 'Lifestyle',
    tagline: 'Bikes · plants · books',
    accent: '#86efac',
    icon: 'bicycle-outline',
    src: require('../assets/images/categories/lifestyle.jpg'),
  },
];

const HERO_W = Math.round(SCREEN_WIDTH * 0.74);
const HERO_H = Math.round(HERO_W * 0.82);

const GRID_TILE_W = Math.floor((SCREEN_WIDTH - SCREEN_PAD * 2 - 12) / 2);
const GRID_TILE_H = GRID_TILE_W;

const MID_W = Math.round(SCREEN_WIDTH * 0.58);
const MID_H = Math.round(MID_W * 1.18);

const PORTRAIT_W = Math.round(SCREEN_WIDTH * 0.44);
const PORTRAIT_H = Math.round(PORTRAIT_W * 1.6);

function go() {
  router.push('/(tabs)/discover');
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
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#d8f53a', marginRight: 8 }}
      />
      <Text
        style={{
          fontSize: 11,
          color: '#0a0a0a',
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
  // Tiny seeded scatter so each tile's decorative orb sits in a slightly
  // different spot — feels less templated without needing per-card config.
  const orb = useMemo(() => {
    const seed = data.key.charCodeAt(0) + data.key.charCodeAt(data.key.length - 1);
    return {
      top: 10 + (seed % 14),
      right: 14 + ((seed * 3) % 20),
      size: 60 + ((seed * 7) % 28),
    };
  }, [data.key]);

  return (
    <Pressable
      onPress={go}
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
          backgroundColor: '#1a1a1a',
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
          colors={['rgba(10,10,10,0.05)', 'rgba(10,10,10,0.45)', 'rgba(10,10,10,0.85)']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Soft accent-tinted orb for depth */}
        <View
          style={{
            position: 'absolute',
            top: orb.top,
            right: orb.right,
            width: orb.size,
            height: orb.size,
            borderRadius: orb.size / 2,
            backgroundColor: data.accent,
            opacity: 0.22,
          }}
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

        {/* Accent corner sticker — top-right */}
        <View
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: data.accent,
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
              backgroundColor: '#0a0a0a',
            }}
          />
          <Text
            style={{
              fontSize: 9,
              color: '#0a0a0a',
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
  return (
    <View style={{ paddingTop: 8, paddingBottom: 8 }}>
      {/* Editorial heading */}
      <View style={{ paddingHorizontal: SCREEN_PAD, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#d8f53a',
              marginRight: 8,
            }}
          />
          <Text
            style={{
              fontSize: 11,
              color: '#6b7280',
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              fontFamily: 'Inter_700Bold',
            }}
          >
            Today on Carrinex
          </Text>
        </View>
        <Text
          style={{
            fontSize: 34,
            color: '#0a0a0a',
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
            color: '#6b7280',
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
        <View style={{ height: 1, backgroundColor: '#ececec', marginBottom: 18 }} />
        <Text
          style={{
            fontSize: 22,
            color: '#0a0a0a',
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
            color: '#6b7280',
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
