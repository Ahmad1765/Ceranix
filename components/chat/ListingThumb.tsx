// The listing thumbnail that appears on an inbox row and on the pinned
// listing bar in a thread. One component so the corner radius, the fallback
// fill, and the status badge can't drift between the two surfaces.
//
// The badge is the palette-compliant read of Plick's highlighter-yellow
// "Sold" chip: ink fill, white label. Status is information here, not
// decoration — it only ever renders when the listing is actually sold or gone.

import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii, type as typography } from '@/lib/theme';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';

export type ListingStatus = 'active' | 'sold' | 'removed';

export function listingStatus(
  listing: { is_sold?: boolean | null } | null | undefined,
): ListingStatus {
  if (!listing) return 'removed';
  return listing.is_sold ? 'sold' : 'active';
}

export function ListingThumb({
  uri,
  width = 56,
  height,
  status = 'active',
  radius = radii.sm,
}: {
  uri: string | null;
  width?: number;
  height?: number;
  status?: ListingStatus;
  radius?: number;
}) {
  const h = height ?? width;
  const label = status === 'sold' ? 'Sold' : status === 'removed' ? 'Removed' : null;
  const optimizedUri = uri ? getOptimizedImageUrl(uri, { width: Math.round(width * 2) }) : null;

  return (
    <View
      style={{
        width,
        height: h,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: colors.panel,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {optimizedUri ? (
        <Image
          source={{ uri: optimizedUri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={IMAGE_TRANSITION}
        />
      ) : (
        <Feather name="image" size={Math.round(width * 0.3)} color={colors.muteSoft} />
      )}

      {label && (
        // A flush bottom bar rather than an inset pill: thumbs here are as
        // narrow as 52px and "Removed" doesn't fit inside a pill at that width
        // without clipping. Spanning the edge can't overflow at any size, and
        // the parent's overflow:hidden takes care of the rounded corners.
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingVertical: 2.5,
            alignItems: 'center',
            backgroundColor: colors.ink,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 9,
              lineHeight: 11,
              letterSpacing: 0.2,
              color: colors.white,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}
