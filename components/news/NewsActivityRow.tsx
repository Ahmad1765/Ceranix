import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { relativeTime } from '@/components/chat/format';
import type { Listing } from '@/types';

export type ActivityItem =
  | {
      id: string;
      kind: 'listing_created';
      actor: {
        id: string;
        username?: string;
        full_name?: string;
        avatar_url?: string | null;
      };
      listing: Listing;
      created_at: string;
    }
  | {
      id: string;
      kind: 'user_followed';
      actor: {
        id: string;
        username?: string;
        full_name?: string;
        avatar_url?: string | null;
      };
      targetUser: {
        id: string;
        username?: string;
        full_name?: string;
        avatar_url?: string | null;
      };
      created_at: string;
    }
  | {
      id: string;
      kind: 'listing_liked';
      actor: {
        id: string;
        username?: string;
        full_name?: string;
        avatar_url?: string | null;
      };
      listing: Listing;
      created_at: string;
    }
  | {
      id: string;
      kind: 'price_drop';
      listing: Listing & { old_price?: number; new_price?: number };
      created_at: string;
    }
  | {
      id: string;
      kind: 'search_alert';
      searchId: string;
      searchLabel: string;
      matchCount: number;
      category?: string | null;
      listing?: Listing | null;
      created_at: string;
    };

function haptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export const NewsActivityRow = memo(function NewsActivityRow({ item }: { item: ActivityItem }) {
  const { theme } = useTheme();

  const handlePress = () => {
    haptic();
    switch (item.kind) {
      case 'listing_created':
      case 'listing_liked':
      case 'price_drop':
        if (item.listing?.id) {
          router.push(`/product/${item.listing.id}` as any);
        }
        break;
      case 'user_followed':
        if (item.targetUser?.id) {
          router.push(`/user/${item.targetUser.id}` as any);
        } else if (item.actor?.id) {
          router.push(`/user/${item.actor.id}` as any);
        }
        break;
      case 'search_alert':
        if (item.category) {
          router.push(`/?category=${item.category}` as any);
        } else if (item.searchId) {
          router.push(`/?savedId=${item.searchId}` as any);
        }
        break;
    }
  };

  // Actor details
  const actor = 'actor' in item ? item.actor : null;
  const actorName = actor?.full_name || actor?.username || 'Creator';
  const actorInitial = actorName.trim().charAt(0).toUpperCase() || 'C';
  const actorAvatarUrl = actor?.avatar_url
    ? getOptimizedImageUrl(actor.avatar_url, { width: 120 })
    : null;

  // Right-hand visual (listing thumbnail or target user avatar)
  const listing = 'listing' in item ? item.listing : null;
  const listingPhoto = listing ? cardImageUrl(listing, 0) : null;
  const listingThumbUrl = listingPhoto
    ? getOptimizedImageUrl(listingPhoto, { width: 120 })
    : null;

  const targetUser = item.kind === 'user_followed' ? item.targetUser : null;
  const targetUserAvatar = targetUser?.avatar_url
    ? getOptimizedImageUrl(targetUser.avatar_url, { width: 120 })
    : null;
  const targetUserName = targetUser?.full_name || targetUser?.username || 'user';

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Activity: ${actorName}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
        backgroundColor: pressed ? theme.panel : 'transparent',
      })}
    >
      {/* Left Column: Actor circular avatar / alert icon */}
      {item.kind === 'search_alert' ? (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.purpleSoft,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Feather name="bookmark" size={18} color={theme.purple} />
        </View>
      ) : item.kind === 'price_drop' ? (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.panel,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Feather name="trending-down" size={18} color={theme.ink} />
        </View>
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.panel,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          {actorAvatarUrl ? (
            <Image
              source={{ uri: actorAvatarUrl }}
              style={{ width: '100%', height: '100%', borderRadius: 22 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={IMAGE_TRANSITION}
            />
          ) : (
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 16,
                color: theme.ink,
              }}
            >
              {actorInitial}
            </Text>
          )}
        </View>
      )}

      {/* Middle Column: Activity text & timestamp */}
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 14,
            lineHeight: 19,
            color: theme.ink,
          }}
          numberOfLines={2}
        >
          {item.kind === 'listing_created' && (
            <>
              <Text style={{ fontFamily: typography.family.sansBold }}>{actorName}</Text>
              {' created a new listing '}
              <Text style={{ fontFamily: typography.family.sansBold }}>{`'${item.listing.title}'`}</Text>
            </>
          )}

          {item.kind === 'user_followed' && (
            <>
              <Text style={{ fontFamily: typography.family.sansBold }}>{actorName}</Text>
              {' is now following '}
              <Text style={{ fontFamily: typography.family.sansBold }}>{targetUserName}</Text>
            </>
          )}

          {item.kind === 'listing_liked' && (
            <>
              <Text style={{ fontFamily: typography.family.sansBold }}>{actorName}</Text>
              {' liked '}
              <Text style={{ fontFamily: typography.family.sansBold }}>{`'${item.listing.title}'`}</Text>
            </>
          )}

          {item.kind === 'price_drop' && (
            <>
              {'Price dropped on '}
              <Text style={{ fontFamily: typography.family.sansBold }}>{`'${item.listing.title}'`}</Text>
              {item.listing.new_price != null ? ` to Rs ${item.listing.new_price.toLocaleString()}` : ''}
            </>
          )}

          {item.kind === 'search_alert' && (
            <>
              <Text style={{ fontFamily: typography.family.sansBold }}>{item.matchCount}</Text>
              {` new item${item.matchCount === 1 ? '' : 's'} matching `}
              <Text style={{ fontFamily: typography.family.sansBold }}>{`'${item.searchLabel}'`}</Text>
            </>
          )}
        </Text>

        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 12,
            color: theme.mute,
            marginTop: 3,
          }}
        >
          {relativeTime(item.created_at)}
        </Text>
      </View>

      {/* Right Column: Listing thumbnail or Target User avatar */}
      {listingThumbUrl ? (
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: radii.md,
            overflow: 'hidden',
            backgroundColor: theme.panel,
            borderWidth: 1,
            borderColor: theme.border,
            flexShrink: 0,
          }}
        >
          <Image
            source={{ uri: listingThumbUrl }}
            style={{ width: '100%', height: '100%', borderRadius: radii.md }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        </View>
      ) : targetUserAvatar ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            overflow: 'hidden',
            backgroundColor: theme.panel,
            borderWidth: 1,
            borderColor: theme.border,
            flexShrink: 0,
          }}
        >
          <Image
            source={{ uri: targetUserAvatar }}
            style={{ width: '100%', height: '100%', borderRadius: 20 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        </View>
      ) : null}
    </Pressable>
  );
});
