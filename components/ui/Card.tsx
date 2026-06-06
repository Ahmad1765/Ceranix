import { View, Platform, ViewStyle } from 'react-native';
import { colors, radii } from '@/lib/theme';

type Props = {
  children: React.ReactNode;
  variant?: 'soft' | 'paper' | 'pink' | 'ink';
  radius?: keyof typeof radii;
  pad?: number;
  style?: ViewStyle;
  elevated?: boolean;
};

export function Card({
  children,
  variant = 'paper',
  radius = '2xl',
  pad = 16,
  style,
  elevated = false,
}: Props) {
  const sty = stylesFor(variant);
  return (
    <View
      style={[
        {
          backgroundColor: sty.bg,
          borderRadius: radii[radius],
          padding: pad,
          borderWidth: sty.bw,
          borderColor: sty.bc,
          ...(elevated
            ? Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.06,
                  shadowRadius: 7,
                },
                android: { elevation: 2 },
                default: ({ boxShadow: '0px 4px 14px rgba(0,0,0,0.06)' } as any),
              })
            : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function stylesFor(v: NonNullable<Props['variant']>) {
  switch (v) {
    case 'soft':
      return { bg: colors.panel, bw: 1, bc: colors.hairline };
    case 'pink':
      return { bg: colors.pinkSoft, bw: 0, bc: 'transparent' };
    case 'ink':
      return { bg: colors.ink, bw: 0, bc: 'transparent' };
    case 'paper':
    default:
      return { bg: colors.white, bw: 1, bc: colors.hairline };
  }
}
