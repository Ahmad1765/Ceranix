import { View } from 'react-native';
import { getItemColor } from '@/lib/itemColors';

const HAIR = 'rgba(15,15,15,0.15)';
// Fixed quadrant colours for the multicolour swatch — a 2x2 fill (not a
// gradient, so it stays within the brand's flat-colour rule).
const MULTI_QUAD = ['#D7373F', '#F2C230', '#3FA463', '#3A6FE0'];

export function ColorSwatch({
  colorId,
  size = 18,
}: {
  colorId: string | null | undefined;
  size?: number;
}) {
  const c = getItemColor(colorId);
  if (!c) return null;
  const radius = size / 2;

  if (c.hex === null) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: HAIR,
          flexDirection: 'row',
          flexWrap: 'wrap',
        }}
      >
        {MULTI_QUAD.map((h, i) => (
          <View key={i} style={{ width: size / 2, height: size / 2, backgroundColor: h }} />
        ))}
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: c.hex,
        borderWidth: 1,
        borderColor: HAIR,
      }}
    />
  );
}
