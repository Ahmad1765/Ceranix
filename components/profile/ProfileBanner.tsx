import { View, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, shadow } from '@/lib/theme';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { getOptimizedImageUrl } from '@/lib/images';

export const AVATAR_SIZE = 96;
const RING = 3;
export const BANNER_ASPECT = 16 / 9;

export function bannerSizeFor(viewportWidth: number): { width: number; height: number } {
  const width = Math.min(viewportWidth, CONTENT_MAX_WIDTH);
  return { width, height: Math.round(width / BANNER_ASPECT) };
}

export type BannerAction = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  /** Tints the glyph purple — the on state of a toggle. */
  active?: boolean;
};

type Props = {
  bannerUrl?: string | null;
  avatarUrl?: string | null;
  /** First letter of the display name, shown when there's no avatar. */
  initial: string;
  verified?: boolean;
  /** Accessible description of whose profile this is. */
  label: string;
  /** Tapping change photo / avatar. Routes to edit screen on own profile. */
  onPress?: () => void;
  /** Action buttons on top-right. */
  actions?: BannerAction[];
  /** Back arrow on top-LEFT. Omit and there is none. */
  onBack?: () => void;
};

/**
 * Bannerless profile header: top action bar + centered avatar with badge and photo action.
 */
export function ProfileBanner({
  avatarUrl,
  initial,
  verified,
  label,
  onPress,
  actions,
  onBack,
}: Props) {
  const avatar = avatarUrl ? getOptimizedImageUrl(avatarUrl, { width: 192, quality: 80 }) : null;
  const outer = AVATAR_SIZE + RING * 2;

  return (
    <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}>
      {/* Top action bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={{ width: 38, height: 38 }} />
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {actions?.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: !!a.active }}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Ionicons name={a.icon} size={19} color={a.active ? colors.purple : colors.ink} />
            </Pressable>
          ))}
        </View>
      </View>

      {/* Centered Avatar */}
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={label}
          style={({ pressed }) => ({
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            backgroundColor: colors.surface,
            padding: RING,
            opacity: onPress && pressed ? 0.85 : 1,
            ...shadow.sm,
          })}
        >
          <View
            style={{
              flex: 1,
              borderRadius: AVATAR_SIZE / 2,
              borderWidth: 2,
              borderColor: colors.purple,
              overflow: 'hidden',
              backgroundColor: colors.purpleSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatar ? (
              <Image
                source={{ uri: avatar }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                priority="high"
                recyclingKey={avatarUrl ?? undefined}
                transition={Platform.OS === 'web' ? 0 : 120}
                cachePolicy="memory-disk"
                accessibilityLabel={label}
              />
            ) : (
              <Text style={{ fontSize: 32, fontWeight: '900', color: colors.purple }}>
                {initial}
              </Text>
            )}
          </View>

          {verified ? (
            <View
              accessibilityRole="image"
              accessibilityLabel="Verified account"
              style={{
                position: 'absolute',
                right: 2,
                bottom: 2,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.purple,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.background,
              }}
            >
              <Feather name="check" size={12} color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
