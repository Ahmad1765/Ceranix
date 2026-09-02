import { View, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { useTheme } from '@/context/ThemeContext';


import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import type { User as Profile } from '@/types';

export function SettingsHero({
  profile,
  hasSession,
  onEditProfile,
  onSignIn,
}: {
  profile: Profile | null;
  /** Distinguishes "profile still loading" from "signed out". */
  hasSession: boolean;
  onEditProfile: () => void;
  onSignIn: () => void;
}) {
  const { theme, isDark } = useTheme();
  const initial =
    ((profile?.full_name || profile?.username || 'U').trim().charAt(0) || 'U').toUpperCase();

  const cardBg = isDark ? theme.surface : theme.text;
  const cardText = isDark ? theme.text : '#FFFFFF';
  const cardMuted = isDark ? theme.textMuted : 'rgba(255,255,255,0.6)';
  const iconBoxBg = isDark ? theme.panel : theme.accent;
  const iconColor = isDark ? theme.text : (theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF');

  return (
    <>
      <Text
        style={{
          fontSize: 44,
          fontWeight: '900',
          color: theme.text,
          lineHeight: 46,
          letterSpacing: -1.5,
          marginTop: 6,
        }}
      >
        Your{'\n'}settings.
      </Text>
      <View
        style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 22 }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.accent,
            marginRight: 10,
          }}
        />
        <Text style={{ fontSize: 14, color: theme.textMuted, lineHeight: 20, flex: 1 }}>
          Manage your shop, account and how you appear on Carrinex.
        </Text>
      </View>

      {profile ? (
        <Pressable
          onPress={onEditProfile}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          style={({ pressed }) => ({
            backgroundColor: cardBg,
            borderRadius: 24,
            borderWidth: isDark ? 1 : 0,
            borderColor: theme.border,
            padding: 18,
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 20,
            transform: [{ scale: pressed ? 0.99 : 1 }],
          })}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: iconBoxBg,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginRight: 14,
            }}
          >
            {profile.avatar_url ? (
              <Image
                source={{ uri: getOptimizedImageUrl(profile.avatar_url, { width: 120 }) }}
                style={{ width: 56, height: 56 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={IMAGE_TRANSITION}
              />
            ) : (
              <Text style={{ fontSize: 24, fontWeight: '900', color: iconColor }}>{initial}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: cardText }} numberOfLines={1}>
                {profile.full_name || profile.username}
              </Text>
              {profile.is_verified && (
                <View style={{ marginLeft: 6 }}>
                  <ShieldCheckIcon size={16} />
                </View>
              )}
            </View>

            <Text
              style={{ fontSize: 13, color: cardMuted, marginTop: 2 }}
              numberOfLines={1}
            >
              @{profile.username} · Tap to edit profile
            </Text>
          </View>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: iconBoxBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="edit-2" size={16} color={iconColor} />
          </View>
        </Pressable>
      ) : hasSession ? (
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 20,
            padding: 20,
            marginBottom: 20,
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: theme.border,
          }}
        >
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <Pressable
          onPress={onSignIn}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: cardBg,
            borderRadius: 20,
            borderWidth: isDark ? 1 : 0,
            borderColor: theme.border,
            padding: 18,
            marginBottom: 20,
            flexDirection: 'row',
            alignItems: 'center',
            transform: [{ scale: pressed ? 0.99 : 1 }],
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: iconBoxBg,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
            }}
          >
            <Feather name="log-in" size={18} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: cardText }}>Sign in</Text>
            <Text style={{ fontSize: 12, color: cardMuted, marginTop: 2 }}>
              Access your shop and listings
            </Text>
          </View>
          <Feather name="arrow-right" size={18} color={cardText} />
        </Pressable>
      )}
    </>
  );
}
