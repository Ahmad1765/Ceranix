// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT SELLER PROFILE CARD (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Role-Based Conditional UI in Presentational Components
// Depending on whether the viewer owns the listing or is a prospective buyer,
// this card displays owner management tools (mark as sold, delete) or buyer
// interaction tools (follow, direct message, overflow sheet).
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/lib/theme';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { timeAgo } from '@/components/product/shared';
import type { Listing } from '@/types';

type ProductSellerProfileCardProps = {
  seller: Listing['seller'];
  createdAt?: string | null;
  isOwnListing: boolean;
  isSold: boolean;
  ownerBusy: boolean;
  soldBusy: boolean;
  deleteBusy: boolean;
  followed: boolean;
  onToggleSold: () => void;
  onDelete: () => void;
  onFollowPress: () => void;
  onMessagePress: () => void;
  onMoreOptionsPress: () => void;
};

export const ProductSellerProfileCard = memo(function ProductSellerProfileCard({
  seller,
  createdAt,
  isOwnListing,
  isSold,
  ownerBusy,
  soldBusy,
  deleteBusy,
  followed,
  onToggleSold,
  onDelete,
  onFollowPress,
  onMessagePress,
  onMoreOptionsPress,
}: ProductSellerProfileCardProps) {
  if (!seller) return null;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
      <View
        style={{
          backgroundColor: colors.white,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Avatar + Username & Subtitle */}
        <Pressable
          onPress={() => router.push(`/user/${seller.id}` as any)}
          accessibilityRole="button"
          accessibilityLabel={`View @${seller.username}'s profile`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            flex: 1,
            marginRight: 10,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          {/* Avatar circle */}
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              overflow: 'hidden',
              backgroundColor: colors.panel,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {seller.avatar_url ? (
              <Image
                source={{ uri: getOptimizedImageUrl(seller.avatar_url, { width: 120 }) }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={IMAGE_TRANSITION}
              />
            ) : (
              <Feather name="user" size={18} color={colors.mute} />
            )}
          </View>

          {/* Username + Subtitle */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: colors.ink,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              @{seller.username}
            </Text>
            <Text
              style={{
                fontSize: 12.5,
                color: colors.mute,
                marginTop: 1.5,
                fontWeight: '400',
              }}
              numberOfLines={1}
            >
              {[
                seller?.location,
                createdAt ? timeAgo(createdAt) : null,
              ]
                .filter(Boolean)
                .join(' • ') || 'Active seller'}
            </Text>
          </View>
        </Pressable>

        {/* Right Actions: Owner vs Buyer Controls */}
        {isOwnListing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable
              onPress={onToggleSold}
              disabled={ownerBusy}
              testID="owner-toggle-sold"
              style={({ pressed }) => ({
                paddingHorizontal: 13,
                paddingVertical: 5.5,
                borderRadius: 999,
                backgroundColor: isSold ? colors.white : colors.ink,
                borderWidth: 1,
                borderColor: isSold ? colors.border : colors.ink,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: soldBusy ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: isSold ? colors.ink : colors.background,
                }}
              >
                {isSold ? 'Available' : 'Mark sold'}
              </Text>
            </Pressable>

            <Pressable
              onPress={onDelete}
              disabled={ownerBusy}
              testID="owner-delete"
              accessibilityRole="button"
              accessibilityLabel="Delete listing"
              hitSlop={8}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.panel : 'transparent',
                opacity: deleteBusy ? 0.5 : 1,
              })}
            >
              <Feather name="trash-2" size={17} color={colors.danger} />
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {/* Follow Button */}
            <Pressable
              onPress={onFollowPress}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 5.5,
                borderRadius: 999,
                backgroundColor: followed ? colors.white : colors.ink,
                borderWidth: 1,
                borderColor: followed ? colors.border : colors.ink,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: followed ? colors.ink : colors.background,
                }}
              >
                {followed ? 'Following' : 'Follow'}
              </Text>
            </Pressable>

            {/* Message Icon */}
            <Pressable
              onPress={onMessagePress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Message seller"
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.panel : 'transparent',
              })}
            >
              <Ionicons name="chatbox-outline" size={18} color={colors.ink} />
            </Pressable>

            {/* More / Profile Options Icon */}
            <Pressable
              onPress={onMoreOptionsPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="More options"
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.panel : 'transparent',
              })}
            >
              <Feather name="more-vertical" size={18} color={colors.ink} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
});
