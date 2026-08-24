import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { Text } from '@/lib/rnText';
import { getOptimizedImageUrl } from '@/lib/images';
import { useTheme } from '@/context/ThemeContext';

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
  const { theme } = useTheme();
  const [following, setFollowing] = useState(initialFollowing);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  const handleFollowPress = () => {
    if (!onFollowToggle) return;
    const nextState = !following;
    setFollowing(nextState);
    onFollowToggle(nextState);
  };

  const cleanUsername = username.replace(/^@/, '');
  const displayText = subtitle || timestamp || '';

  const isCard = variant === 'card';
  const isDivider = variant === 'divider';

  const avatarAndInfo = (
    <>
      {/* Avatar with subtle ring overlay */}
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          overflow: 'hidden',
          backgroundColor: theme.panel,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.border,
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
          <Feather name="user" size={18} color={theme.textMuted} />
        )}
      </View>

      {/* Username + Subtitle */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '600',
            color: theme.text,
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
              color: theme.textMuted,
              marginTop: 1.5,
              fontWeight: '400',
            }}
            numberOfLines={1}
          >
            {displayText}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      style={[
        isCard
          ? {
              backgroundColor: theme.surface,
              borderRadius: 18,
              borderWidth: bordered ? 1 : 0,
              borderColor: theme.border,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }
          : {
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              backgroundColor: theme.background,
              ...(bordered && isDivider
                ? {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
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
        {onProfilePress ? (
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
            {avatarAndInfo}
          </Pressable>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              flex: 1,
              marginRight: 10,
            }}
          >
            {avatarAndInfo}
          </View>
        )}

        {/* Right: Actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {showFollow && !!onFollowToggle && (
            <Pressable
              onPress={handleFollowPress}
              accessibilityRole="button"
              accessibilityLabel={following ? `Unfollow @${cleanUsername}` : `Follow @${cleanUsername}`}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 5.5,
                borderRadius: 999,
                backgroundColor: following ? theme.panel : theme.accent,
                borderWidth: 1,
                borderColor: following ? theme.border : theme.accent,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '500',
                  color: following ? theme.text : (theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF'),
                }}
              >
                {following ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          )}

          {showMessage && !!onMessagePress && (
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
                backgroundColor: pressed ? theme.panel : 'transparent',
              })}
            >
              <Ionicons name="chatbox-outline" size={18} color={theme.textMuted} />
            </Pressable>
          )}

          {showOptions && !!onOptionsPress && (
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
                backgroundColor: pressed ? theme.panel : 'transparent',
              })}
            >
              <Feather name="more-vertical" size={18} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export default UserCommentHeader;
