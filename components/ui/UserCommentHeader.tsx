import React, { useState } from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { Text } from '@/lib/rnText';
import { BRAND_INK } from '@/components/product/shared';
import { getOptimizedImageUrl } from '@/lib/images';

export interface UserCommentHeaderProps {
  avatarUrl?: string | null;
  username: string;
  timestamp?: string | null;
  subtitle?: string | null;
  isFollowing?: boolean;
  showFollow?: boolean;
  showMessage?: boolean;
  showOptions?: boolean;
  bordered?: boolean;
  variant?: 'card' | 'divider' | 'none';
  onFollowToggle?: (following: boolean) => void;
  onProfilePress?: () => void;
  onMessagePress?: () => void;
  onOptionsPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function UserCommentHeader({
  avatarUrl,
  username,
  timestamp,
  subtitle,
  isFollowing: initialFollowing = false,
  showFollow = true,
  showMessage = true,
  showOptions = true,
  bordered = true,
  variant = 'card',
  onFollowToggle,
  onProfilePress,
  onMessagePress,
  onOptionsPress,
  style,
}: UserCommentHeaderProps) {
  const [following, setFollowing] = useState(initialFollowing);

  const handleFollowPress = () => {
    const nextState = !following;
    setFollowing(nextState);
    onFollowToggle?.(nextState);
  };

  const cleanUsername = username.replace(/^@/, '');
  const displayText = subtitle || timestamp || '';

  const isCard = variant === 'card';
  const isDivider = variant === 'divider';

  return (
    <View
      style={[
        isCard
          ? {
              backgroundColor: 'white',
              borderRadius: 18,
              borderWidth: bordered ? 1 : 0,
              borderColor: 'rgba(15,15,15,0.08)',
              paddingHorizontal: 14,
              paddingVertical: 12,
            }
          : {
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              backgroundColor: 'white',
              ...(bordered && isDivider
                ? {
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(15,15,15,0.08)',
                  }
                : {}),
            },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Avatar + Username & Subtitle */}
        <Pressable
          onPress={onProfilePress}
          accessibilityRole="button"
          accessibilityLabel={`View @${cleanUsername}'s profile`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            flex: 1,
            marginRight: 10,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          {/* Avatar with subtle ring overlay */}
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              overflow: 'hidden',
              backgroundColor: 'rgba(15,15,15,0.04)',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(15,15,15,0.08)',
            }}
          >
            {avatarUrl ? (
              <Image
                source={{ uri: getOptimizedImageUrl(avatarUrl, { width: 120 }) }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
              />
            ) : (
              <Feather name="user" size={18} color="rgba(15,15,15,0.45)" />
            )}
          </View>

          {/* Username + Subtitle */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: BRAND_INK,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              @{cleanUsername}
            </Text>
            {displayText ? (
              <Text
                style={{
                  fontSize: 12.5,
                  color: 'rgba(15,15,15,0.48)',
                  marginTop: 1.5,
                  fontWeight: '400',
                }}
                numberOfLines={1}
              >
                {displayText}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {/* Right: Actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {showFollow && (
            <Pressable
              onPress={handleFollowPress}
              accessibilityRole="button"
              accessibilityLabel={following ? `Unfollow @${cleanUsername}` : `Follow @${cleanUsername}`}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 5.5,
                borderRadius: 999,
                backgroundColor: following ? 'rgba(15,15,15,0.03)' : BRAND_INK,
                borderWidth: 1,
                borderColor: following ? 'rgba(15,15,15,0.12)' : BRAND_INK,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '500',
                  color: following ? 'rgba(15,15,15,0.72)' : 'white',
                }}
              >
                {following ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          )}

          {showMessage && (
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
                backgroundColor: pressed ? 'rgba(15,15,15,0.06)' : 'transparent',
              })}
            >
              <Ionicons name="chatbox-outline" size={18} color="rgba(15,15,15,0.65)" />
            </Pressable>
          )}

          {showOptions && (
            <Pressable
              onPress={onOptionsPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="More options"
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? 'rgba(15,15,15,0.06)' : 'transparent',
              })}
            >
              <Feather name="more-vertical" size={18} color="rgba(15,15,15,0.65)" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export default UserCommentHeader;
