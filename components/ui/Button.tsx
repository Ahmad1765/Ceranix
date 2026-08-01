import { Pressable, View, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii } from '@/lib/theme';

type Variant = 'primary' | 'gradient' | 'ghost' | 'dark' | 'soft' | 'text';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Feather.glyphMap;
  iconRight?: boolean;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
};

const HEIGHTS: Record<Size, number> = { sm: 36, md: 44, lg: 52 };
const FONTS: Record<Size, number> = { sm: 13, md: 14, lg: 15 };
const PADX: Record<Size, number> = { sm: 14, md: 18, lg: 22 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight = false,
  loading,
  disabled,
  full,
}: Props) {
  const height = HEIGHTS[size];
  const fontSize = FONTS[size];
  const styles = stylesFor(variant, disabled);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      hitSlop={8}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        alignSelf: full ? 'stretch' : 'flex-start',
      })}
    >
      <View
        style={{
          height,
          paddingHorizontal: PADX[size],
          borderRadius: radii.pill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: styles.bg,
          borderWidth: styles.bw,
          borderColor: styles.bc,
          ...shadowFor(variant),
        }}
      >
        {!iconRight && icon && !loading && (
          <Feather name={icon} size={fontSize + 2} color={styles.fg} />
        )}
        {loading ? (
          <ActivityIndicator size="small" color={styles.fg} />
        ) : (
          <Text
            style={{ color: styles.fg, fontSize, fontWeight: '700', letterSpacing: 0.1 }}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
        {iconRight && icon && !loading && (
          <Feather name={icon} size={fontSize + 2} color={styles.fg} />
        )}
      </View>
    </Pressable>
  );
}

function stylesFor(v: Variant, disabled?: boolean) {
  if (disabled) {
    return { bg: colors.panel, fg: colors.muteSoft, bw: 0, bc: 'transparent' };
  }
  switch (v) {
    case 'primary':
    case 'gradient':
      return { bg: colors.purple, fg: colors.white, bw: 0, bc: 'transparent' };
    case 'dark':
      return { bg: colors.ink, fg: colors.white, bw: 0, bc: 'transparent' };
    case 'soft':
      return { bg: colors.purpleSoft, fg: colors.purple, bw: 0, bc: 'transparent' };
    case 'ghost':
      return { bg: colors.white, fg: colors.ink, bw: 1, bc: colors.hairline };
    case 'text':
      return { bg: 'transparent', fg: colors.purple, bw: 0, bc: 'transparent' };
    default:
      return { bg: colors.panel, fg: colors.muteSoft, bw: 0, bc: 'transparent' };
  }
}

function shadowFor(v: Variant) {
  if (v === 'ghost' || v === 'text' || v === 'soft') return {};
  const rgb = v === 'primary' || v === 'gradient' ? '108,71,255' : '0,0,0';
  const box = `0px 4px 10px rgba(${rgb},0.16)`;
  return Platform.select({
    ios: {
      shadowColor: `rgb(${rgb})`,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 10,
    },
    android: { elevation: 2 },
    default: { boxShadow: box },
  });
}
