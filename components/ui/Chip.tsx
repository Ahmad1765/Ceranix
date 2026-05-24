import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
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
  const sty = stylesFor(active ? 'ink' : tone);
  const padY = size === 'sm' ? 6 : 8;
  const padX = size === 'sm' ? 12 : 14;
  const fs = size === 'sm' ? 12 : 13;

  const Inner = (
    <View
      style={{
        paddingVertical: padY,
        paddingHorizontal: padX,
        borderRadius: radii.pill,
        backgroundColor: sty.bg,
        borderWidth: sty.bw,
        borderColor: sty.bc,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon && <Feather name={icon} size={fs + 1} color={sty.fg} />}
      <Text style={{ fontSize: fs, fontWeight: '700', color: sty.fg, letterSpacing: 0.1 }}>
        {label}
      </Text>
      {typeof count === 'number' && count > 0 && (
        <View
          style={{
            marginLeft: 2,
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 999,
            backgroundColor: active ? colors.pink : colors.pinkSoft,
            minWidth: 18,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: '800',
              color: active ? colors.white : colors.pinkDeep,
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

function stylesFor(t: Tone) {
  switch (t) {
    case 'pink':
      return { bg: colors.pinkSoft, fg: colors.pinkDeep, bw: 0, bc: 'transparent' };
    case 'ink':
      return { bg: colors.ink, fg: colors.white, bw: 0, bc: 'transparent' };
    case 'amber':
      return { bg: '#fff3d6', fg: '#a36b00', bw: 0, bc: 'transparent' };
    case 'soft':
      return { bg: '#f5f5f5', fg: colors.ink2, bw: 0, bc: 'transparent' };
    case 'panel':
      return { bg: colors.panel, fg: colors.ink2, bw: 1, bc: colors.hairline };
    case 'ghost':
    default:
      return { bg: colors.white, fg: colors.ink2, bw: 1, bc: colors.hairline };
  }
}
