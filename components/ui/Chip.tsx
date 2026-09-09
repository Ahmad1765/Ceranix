import { Pressable, View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii } from '@/lib/theme';

type Tone = 'pink' | 'ink' | 'ghost' | 'amber' | 'soft' | 'panel';

type Props = {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Feather.glyphMap;
  active?: boolean;
  onPress?: () => void;
  count?: number;
  size?: 'sm' | 'md';
};

export function Chip({
  label,
  tone = 'ghost',
  icon,
  active = false,
  onPress,
  count,
  size = 'md',
}: Props) {
  const sty = stylesFor(active ? 'selected' : tone);
  const padX = 12;
  const fs = 12;

  const Inner = (
    <View
      style={{
        height: 28,
        paddingHorizontal: padX,
        borderRadius: radii.pill,
        backgroundColor: sty.bg,
        borderWidth: sty.bw,
        borderColor: sty.bc,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
      }}
    >
      {icon && <Feather name={icon} size={fs} color={sty.fg} />}
      <Text style={{ fontSize: fs, fontWeight: '700', color: sty.fg, letterSpacing: 0.1 }}>
        {label}
      </Text>
      {typeof count === 'number' && count > 0 && (
        <View
          style={{
            marginLeft: 2,
            paddingHorizontal: 4,
            height: 16,
            minWidth: 16,
            borderRadius: 8,
            backgroundColor: active ? colors.pink : colors.pinkSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 9.5,
              fontWeight: '800',
              color: active ? colors.white : colors.pinkDeep,
              lineHeight: 11,
            }}
          >
            {count}
          </Text>
        </View>
      )}
    </View>
  );

  if (!onPress) return Inner;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      {Inner}
    </Pressable>
  );
}

function stylesFor(t: Tone | 'selected') {
  switch (t) {
    case 'selected':
      return { bg: colors.selected, fg: colors.ink, bw: 1, bc: colors.border };
    case 'pink':
      return { bg: colors.pinkSoft, fg: colors.pinkDeep, bw: 0, bc: 'transparent' };
    case 'ink':
      return { bg: colors.ink, fg: colors.white, bw: 0, bc: 'transparent' };
    case 'amber':
      return { bg: colors.primarySoft, fg: colors.primaryDeep, bw: 0, bc: 'transparent' };
    case 'soft':
      return { bg: colors.panel, fg: colors.ink2, bw: 0, bc: 'transparent' };
    case 'panel':
      return { bg: colors.panel, fg: colors.ink2, bw: 1, bc: colors.hairline };
    case 'ghost':
    default:
      return { bg: colors.white, fg: colors.ink2, bw: 1, bc: colors.hairline };
  }
}
