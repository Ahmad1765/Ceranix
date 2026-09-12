import { Pressable, View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { ThemeTokens, radii } from '@/lib/theme';

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
  const { theme, isDark } = useTheme();
  const sty = stylesFor(active ? 'selected' : tone, theme, isDark);
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
            backgroundColor: active
              ? isDark ? 'rgba(255, 255, 255, 0.2)' : theme.pink
              : isDark ? 'rgba(255, 255, 255, 0.1)' : theme.pinkSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 9.5,
              fontWeight: '800',
              color: active ? '#FFFFFF' : theme.ink,
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

function stylesFor(t: Tone | 'selected', theme: ThemeTokens, isDark: boolean) {
  switch (t) {
    case 'selected':
      return {
        bg: isDark ? theme.panel : '#111111',
        fg: '#FFFFFF',
        bw: 1,
        bc: isDark ? theme.border : '#111111',
      };
    case 'pink':
      return {
        bg: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.pinkSoft,
        fg: isDark ? '#FFFFFF' : theme.pinkDeep,
        bw: 0,
        bc: 'transparent',
      };
    case 'ink':
      return {
        bg: isDark ? theme.panel : '#111111',
        fg: isDark ? theme.ink : '#FFFFFF',
        bw: isDark ? 1 : 0,
        bc: isDark ? theme.border : 'transparent',
      };
    case 'amber':
      return {
        bg: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.primarySoft,
        fg: isDark ? '#FFFFFF' : theme.primaryDeep,
        bw: 0,
        bc: 'transparent',
      };
    case 'soft':
      return { bg: theme.panel, fg: theme.ink, bw: 0, bc: 'transparent' };
    case 'panel':
      return { bg: theme.panel, fg: theme.ink, bw: 1, bc: isDark ? theme.border : theme.hairline };
    case 'ghost':
    default:
      return {
        bg: isDark ? theme.surface : '#FFFFFF',
        fg: theme.ink,
        bw: 1,
        bc: isDark ? theme.border : theme.hairline,
      };
  }
}
