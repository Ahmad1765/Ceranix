// The top of the settings page: title block, then whichever identity card the
// session state calls for — the profile card, a loading placeholder while the
// profile resolves, or the signed-out sign-in CTA.
//
// Purely presentational. `onEditProfile` / `onSignIn` are supplied by the screen
// so navigation stays in one place.
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { colors } from '@/lib/theme';
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
  const initial =
    ((profile?.full_name || profile?.username || 'U').trim().charAt(0) || 'U').toUpperCase();

  return (
    <>
      <Text
        style={{
          fontSize: 44,
          fontWeight: '900',
          color: colors.ink,
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
            backgroundColor: colors.primary,
            marginRight: 10,
          }}
        />
        <Text style={{ fontSize: 14, color: colors.smoke, lineHeight: 20, flex: 1 }}>
          Manage your shop, account and how you appear on Carrinex.
        </Text>
      </View>

      {profile ? (
        <Pressable
          onPress={onEditProfile}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          style={({ pressed }) => ({
            backgroundColor: colors.ink,
            borderRadius: 24,
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
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginRight: 14,
            }}
          >
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: 56, height: 56 }}
                contentFit="cover"
              />
            ) : (
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFFFFF' }}>{initial}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: 'white' }} numberOfLines={1}>
                {profile.full_name || profile.username}
              </Text>
              {profile.is_verified && (
                <View style={{ marginLeft: 6 }}>
                  <Feather name="check-circle" size={14} color="#FFFFFF" />
                </View>
              )}
            </View>
            <Text
              style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}
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
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="edit-2" size={16} color="#FFFFFF" />
          </View>
        </Pressable>
      ) : hasSession ? (
        <View
          style={{
            backgroundColor: 'white',
            borderRadius: 20,
            padding: 20,
            marginBottom: 20,
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: colors.hairline,
          }}
        >
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : (
        <Pressable
          onPress={onSignIn}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: colors.ink,
            borderRadius: 20,
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
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
            }}
          >
            <Feather name="log-in" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: 'white' }}>Sign in</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              Access your shop and listings
            </Text>
          </View>
          <Feather name="arrow-right" size={18} color="white" />
        </Pressable>
      )}
    </>
  );
}
