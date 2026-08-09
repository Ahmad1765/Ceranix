import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';

// Die-cut sticker icons for the home quick-category row. Deliberately
// off-palette: the user wants these to pop against the purple/white/black
// system with a gen-z sticker-sheet look — vivid fills, white die-cut
// borders, a gloss bite, sparkles, and a lazy tilt. Everything is drawn in
// SVG so there are no raster assets to ship.

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Four organic blob silhouettes (64x64 viewBox), cycled across the row so
// neighbouring stickers never share an outline.
const BLOBS = [
  // Rounded amoeba, heavier on the right
  'M33 3.5C46.5 1.5 59.5 9.5 60.5 24.5C61.5 38.5 56 56.5 38.5 60C22 63.5 5.5 53.5 4 37C2.5 21 19 5.5 33 3.5Z',
  // Squashed pebble, wide hips
  'M32 5C47 3 61 13 60 29C59 44 50 60 31 59.5C13 59 3 47 4.5 30C6 14 18 7 32 5Z',
  // Tall bean leaning left
  'M28 3C42 1 58 8 59.5 23C61 38 57 57 39 60.5C22 64 6.5 55 5 38.5C3.5 22 15 5 28 3Z',
  // Chunky squircle-ish blob
  'M31 4C45 2.5 59 9 60 25C61 41 53.5 58 33 60C14 62 4.5 50 4 33C3.5 17 17 5.5 31 4Z',
] as const;

// Four-point sparkle, drawn around (0,0) with radius 1 so it can be placed
// and scaled via the path transform props below.
const SPARKLE = 'M0 -1C0.18 -0.4 0.4 -0.18 1 0C0.4 0.18 0.18 0.4 0 1C-0.18 0.4 -0.4 0.18 -1 0C-0.4 -0.18 -0.18 -0.4 0 -1Z';

export type StickerSpec = {
  icon: IoniconName;
  /** Vivid sticker fill — intentionally outside the app palette. */
  color: string;
  /** Darker partner shade for the icon + sparkle so it reads on the fill. */
  deep: string;
};

export function CategorySticker({
  spec,
  index,
  size = 64,
}: {
  spec: StickerSpec;
  index: number;
  size?: number;
}) {
  const blob = BLOBS[index % BLOBS.length];
  // Deterministic lazy tilt, alternating direction along the row.
  const tilt = (index % 2 === 0 ? 1 : -1) * (4 + (index % 3) * 2);

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: `${tilt}deg` }],
        shadowColor: '#0F0F0F',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.16,
        shadowRadius: 5,
        elevation: 4,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 64 64" style={{ position: 'absolute' }}>
        {/* White die-cut border: same blob, fattened by a thick stroke */}
        <Path d={blob} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={7} strokeLinejoin="round" />
        <Path d={blob} fill={spec.color} />
        {/* Gloss bite — top-left highlight crescent */}
        <Path
          d="M14 19C16 11 24 6.5 32 6.5C26 9 19.5 13.5 17.5 21.5C16.5 25.5 12.5 24.5 14 19Z"
          fill="rgba(255,255,255,0.55)"
        />
        {/* Sparkles: one big white, one small deep-toned */}
        <Path d={SPARKLE} fill="#FFFFFF" scale={5.5} translateX={51} translateY={15} />
        <Path d={SPARKLE} fill={spec.deep} scale={3} translateX={10} translateY={46} />
        <Circle cx={55} cy={42} r={1.8} fill="rgba(255,255,255,0.85)" />
      </Svg>
      <Ionicons
        name={spec.icon}
        size={size * 0.42}
        color={spec.deep}
        style={{ transform: [{ rotate: `${-tilt / 2}deg` }] }}
      />
    </View>
  );
}
