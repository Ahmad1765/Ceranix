import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
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
  gradient: [string, string, string];
  ink: string;
  accent: string;
  icon: IoniconName;
  textAlign?: 'left' | 'right';
};

const HERO_CARDS: CategoryTileData[] = [
  {
    key: 'vintage',
    eyebrow: 'The Vintage Edit',
    title: 'Pre-loved\ntreasures.',
    tagline: 'Curated finds with a story',
    gradient: ['#f4e8d0', '#e8c89a', '#c8a472'],
    ink: '#3d2817',
    accent: '#7a3f1e',
    icon: 'leaf-outline',
  },
  {
    key: 'sneakerdrop',
    eyebrow: 'Sneaker Drop',
    title: 'Hype\nawaits.',
    tagline: 'Fresh kicks, daily',
    gradient: ['#0a0a0a', '#1a1a2e', '#16213e'],
    ink: '#ffffff',
    accent: '#d8f53a',
    icon: 'flash-outline',
  },
  {
    key: 'editors',
    eyebrow: "Editor's Picks",
    title: 'Hand-picked\nfor you.',
    tagline: 'Selected by the Carrinex team',
    gradient: ['#6C47FF', '#8E6FFF', '#b39bff'],
    ink: '#ffffff',
    accent: '#d8f53a',
    icon: 'sparkles-outline',
  },
];

const GRID_CARDS: CategoryTileData[] = [
  {
    key: 'electronics',
    eyebrow: 'Tech',
    title: 'Electronics',
    tagline: 'Phones · audio · games',
    gradient: ['#1e293b', '#334155', '#475569'],
    ink: '#ffffff',
    accent: '#67e8f9',
    icon: 'hardware-chip-outline',
  },
  {
    key: 'beauty',
    eyebrow: 'Glow',
    title: 'Beauty',
    tagline: 'Skin · scent · self-care',
    gradient: ['#fce7f3', '#fbcfe8', '#f9a8d4'],
    ink: '#831843',
    accent: '#be185d',
    icon: 'flower-outline',
  },
  {
    key: 'home',
    eyebrow: 'Live well',
    title: 'Home & Living',
    tagline: 'Décor · ceramics · linens',
    gradient: ['#ecfccb', '#d9f99d', '#a3d977'],
    ink: '#1a2e05',
    accent: '#4d7c0f',
    icon: 'home-outline',
  },
  {
    key: 'handbags',
    eyebrow: 'Designer',
    title: 'Handbags',
    tagline: 'Authenticated luxury',
    gradient: ['#fef3c7', '#fcd34d', '#d97706'],
    ink: '#451a03',
    accent: '#92400e',
    icon: 'bag-handle-outline',
  },
];

const MID_CARDS: CategoryTileData[] = [
  {
    key: 'carrinex-app',
    eyebrow: 'Get the app',
    title: 'Carrinex,\nin your pocket.',
    tagline: 'Faster checkout · push deals',
    gradient: ['#0a0a0a', '#262626', '#3d3d3d'],
    ink: '#ffffff',
    accent: '#d8f53a',
    icon: 'phone-portrait-outline',
  },
  {
    key: 'activewear',
    eyebrow: 'Move',
    title: 'Activewear.',
    tagline: 'Train · run · stretch',
    gradient: ['#fb923c', '#f97316', '#dc2626'],
    ink: '#ffffff',
    accent: '#fef3c7',
    icon: 'pulse-outline',
  },
  {
    key: 'streetwear',
    eyebrow: 'Drops',
    title: 'Streetwear.',
    tagline: 'Hype tees · hoodies · caps',
    gradient: ['#18181b', '#27272a', '#52525b'],
    ink: '#d8f53a',
    accent: '#ffffff',
    icon: 'flame-outline',
  },
];

const PORTRAIT_CARDS: CategoryTileData[] = [
  {
    key: 'women',
    eyebrow: 'Department',
    title: 'Women',
    tagline: 'Dresses · denim · knits',
    gradient: ['#fdf2f8', '#fbcfe8', '#f472b6'],
    ink: '#500724',
    accent: '#be185d',
    icon: 'heart-outline',
  },
  {
    key: 'men',
    eyebrow: 'Department',
    title: 'Men',
    tagline: 'Tailoring · tees · sneakers',
    gradient: ['#082f49', '#0c4a6e', '#0369a1'],
    ink: '#ffffff',
    accent: '#7dd3fc',
    icon: 'shirt-outline',
  },
  {
    key: 'kids',
    eyebrow: 'Department',
    title: 'Kids',
    tagline: 'Tiny outfits · toys · books',
    gradient: ['#fef9c3', '#fde047', '#facc15'],
    ink: '#422006',
    accent: '#a16207',
    icon: 'happy-outline',
  },
  {
    key: 'living',
    eyebrow: 'Department',
    title: 'Lifestyle',
    tagline: 'Bikes · plants · books',
    gradient: ['#ecfdf5', '#a7f3d0', '#10b981'],
    ink: '#022c22',
    accent: '#047857',
    icon: 'bicycle-outline',
  },
];

const HERO_W = Math.round(SCREEN_WIDTH * 0.74);
const HERO_H = Math.round(HERO_W * 0.78);

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
      top: 12 + (seed % 18),
      right: 16 + ((seed * 3) % 24),
      size: 78 + ((seed * 7) % 36),
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
        }}
      >
        <LinearGradient
          colors={data.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        >
          {/* Decorative blurred orb — abstract, brand-safe */}
          <View
            style={{
              position: 'absolute',
              top: orb.top,
              right: orb.right,
              width: orb.size,
              height: orb.size,
              borderRadius: orb.size / 2,
              backgroundColor: data.accent,
              opacity: 0.18,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -20,
              left: -20,
              width: 90,
              height: 90,
              borderRadius: 45,
              backgroundColor: data.accent,
              opacity: 0.1,
            }}
          />

          {/* Icon chip — top-left */}
          <View
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: 'rgba(255,255,255,0.16)',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
            }}
          >
            <Ionicons name={data.icon} size={17} color={data.ink} />
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
                backgroundColor: data.ink,
              }}
            />
            <Text
              style={{
                fontSize: 9,
                color: data.ink,
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
                color: data.ink,
                opacity: 0.72,
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
                color: data.ink,
                letterSpacing: -0.6,
                lineHeight: titleSize * 1.05,
                fontFamily: 'Fraunces_700Bold',
              }}
            >
              {data.title}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: data.ink,
                opacity: 0.72,
                marginTop: 5,
                fontFamily: 'Inter_400Regular',
              }}
              numberOfLines={1}
            >
              {data.tagline}
            </Text>
          </View>
        </LinearGradient>
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
