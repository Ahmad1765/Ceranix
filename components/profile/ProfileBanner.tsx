import { View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors } from '@/lib/theme';
import { getOptimizedImageUrl } from '@/lib/images';

export const AVATAR_SIZE = 96;
// White gap between the photo and the purple ring. The avatar sits on top of a
// photograph, so it needs a light separator or the ring reads as part of the
// image behind it.
const RING = 4;

// Banner geometry. The ratio follows the reference layout (a touch wider than
// 2:1), but it is capped in absolute pixels: on a tablet the same ratio would
// push the name and stats entirely below the fold.
export function bannerHeightFor(viewportWidth: number): number {
  return Math.round(Math.min(viewportWidth * 0.52, 260));
}

type Props = {
  bannerUrl?: string | null;
  avatarUrl?: string | null;
  /** First letter of the display name, shown when there's no avatar. */
  initial: string;
  verified?: boolean;
  /** Accessible description of whose profile this is. */
  label: string;
};

/**
 * Full-bleed banner with the avatar straddling its lower edge.
 *
 * The overlap is done with a negative margin on the avatar row rather than
 * absolute positioning, so the following content flows naturally beneath it and
 * nothing has to know the banner's height to lay itself out.
 */
export function ProfileBanner({ bannerUrl, avatarUrl, initial, verified, label }: Props) {
  const { width } = useWindowDimensions();
  const height = bannerHeightFor(width);
  const banner = bannerUrl ? getOptimizedImageUrl(bannerUrl, { width: 1080 }) : null;
  const avatar = avatarUrl ? getOptimizedImageUrl(avatarUrl, { width: 240 }) : null;
  const outer = AVATAR_SIZE + RING * 2;

  return (
    <View>
      {/* Purple-tint band doubles as both the no-banner fallback and the
          placeholder colour behind a still-loading photo. */}
      <View style={{ height, backgroundColor: colors.purpleSoft, overflow: 'hidden' }}>
        {banner ? (
          <Image
            source={{ uri: banner }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
            // Decorative: the identity below carries the meaning, and a banner
            // photo has no alt text a seller ever supplies.
            accessible={false}
          />
        ) : null}
      </View>

      <View style={{ alignItems: 'center', marginTop: -outer / 2 }}>
        <View
          style={{
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            backgroundColor: colors.white,
            padding: RING,
          }}
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
                transition={180}
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
                borderColor: colors.white,
              }}
            >
              <Feather name="check" size={12} color={colors.white} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
