import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors } from '@/lib/theme';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { getOptimizedImageUrl } from '@/lib/images';

export const AVATAR_SIZE = 96;
// White gap between the photo and the purple ring. The avatar sits on top of a
// photograph, so it needs a light separator or the ring reads as part of the
// image behind it.
const RING = 4;

// Banner geometry.
//
// 16:9 is not a look, it's a contract: it's the ratio the picker crops to, and
// the banner renders `contentFit="cover"`, so any OTHER display ratio would
// silently crop the seller's crop a second time. Keep these two in sync — if
// this changes, change the picker's `aspect` and the web cropper's frame with it.
export const BANNER_ASPECT = 16 / 9;

// Width is clamped to the same column as the cards below. Left full-bleed, a
// desktop viewport would make a 16:9 banner over 700px tall and push the whole
// profile below the fold.
export function bannerSizeFor(viewportWidth: number): { width: number; height: number } {
  const width = Math.min(viewportWidth, CONTENT_MAX_WIDTH);
  return { width, height: Math.round(width / BANNER_ASPECT) };
}

type Props = {
  bannerUrl?: string | null;
  avatarUrl?: string | null;
  /** First letter of the display name, shown when there's no avatar. */
  initial: string;
  verified?: boolean;
  /** Accessible description of whose profile this is. */
  label: string;
  /**
   * Tapping the banner. Only wired on your OWN profile, where it routes to the
   * edit screen — the banner looks editable, so doing nothing on tap reads as
   * broken rather than as "not a control".
   */
  onPress?: () => void;
};

/**
 * Full-bleed banner with the avatar straddling its lower edge.
 *
 * The overlap is done with a negative margin on the avatar row rather than
 * absolute positioning, so the following content flows naturally beneath it and
 * nothing has to know the banner's height to lay itself out.
 */
export function ProfileBanner({
  bannerUrl,
  avatarUrl,
  initial,
  verified,
  label,
  onPress,
}: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const { width, height } = bannerSizeFor(viewportWidth);
  const banner = bannerUrl ? getOptimizedImageUrl(bannerUrl, { width: 1080 }) : null;
  const avatar = avatarUrl ? getOptimizedImageUrl(avatarUrl, { width: 240 }) : null;
  const outer = AVATAR_SIZE + RING * 2;

  return (
    <View>
      {/* Purple-tint band doubles as both the no-banner fallback and the
          placeholder colour behind a still-loading photo. */}
      <Pressable
        onPress={onPress}
        // A plain View when there's nothing to do, so a visitor's banner isn't
        // announced as a button.
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? 'Change your banner' : undefined}
        style={({ pressed }) => ({
          width,
          height,
          alignSelf: 'center',
          backgroundColor: colors.purpleSoft,
          overflow: 'hidden',
          opacity: onPress && pressed ? 0.85 : 1,
        })}
      >
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

        {/* Only on your own profile, and only while there's no banner yet — an
            empty purple band gives no hint that it can be filled. */}
        {onPress && !banner ? (
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Feather name="image" size={18} color={colors.purple} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.purple }}>
              Add a banner
            </Text>
          </View>
        ) : null}
      </Pressable>

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
