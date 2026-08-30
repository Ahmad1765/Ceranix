// Conversation header: back chevron in a circle, identity pill with avatar +
// online dot + name. Matches the rounded, modern chat-header reference.

import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { HIT_SLOP_8 } from '@/lib/responsive';

export function ThreadHeader({
  name,
  subtitle,
  avatar,
  onBack,
  onPressIdentity,
  onOverflow,
}: {
  name: string;
  subtitle?: string | null;
  avatar: string | null;
  onBack: () => void;
  onPressIdentity?: () => void;
  onOverflow: () => void;
}) {
  const { theme } = useTheme();
  const initial = name.trim().charAt(0).toUpperCase() || 'U';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 6,
        paddingBottom: 10,
        gap: 10,
      }}
    >
      {/* ── Back button: chevron inside a circular container ──────────── */}
      <Pressable
        onPress={onBack}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: 'rgba(0, 0, 0, 0.08)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.55 : 1,
        })}
      >
        <Feather name="chevron-left" size={22} color={theme.ink} />
      </Pressable>

      {/* ── Identity pill: avatar + online dot + name ─────────────────── */}
      <Pressable
        onPress={onPressIdentity}
        disabled={!onPressIdentity}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s profile`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: 'rgba(0, 0, 0, 0.08)',
          borderRadius: 24,
          paddingVertical: 6,
          paddingLeft: 6,
          paddingRight: 16,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {/* Avatar with online dot */}
        <View style={{ position: 'relative' }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: theme.ink,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatar ? (
              <Image
                source={{ uri: avatar }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 14,
                  color: '#FFFFFF',
                }}
              >
                {initial}
              </Text>
            )}
          </View>

          {/* Green online dot */}
          <View
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: '#00C853',
              borderWidth: 2,
              borderColor: theme.background,
            }}
          />
        </View>

        {/* Name */}
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 16,
            letterSpacing: -0.2,
            color: theme.ink,
          }}
        >
          {name}
        </Text>
      </Pressable>

      {/* Spacer pushes overflow to the right edge */}
      <View style={{ flex: 1 }} />

      {/* ── Overflow menu (three dots) ───────────────────────────────── */}
      <Pressable
        onPress={onOverflow}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel="Conversation options"
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: 'rgba(0, 0, 0, 0.08)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.55 : 1,
        })}
      >
        <Feather name="more-horizontal" size={22} color={theme.ink} />
      </Pressable>
    </View>
  );
}
