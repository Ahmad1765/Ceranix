// Conversation header: back, who you're talking to, overflow.
//
// The identity block is one tap target that opens their profile — in a
// marketplace, "who is this person" is the question a buyer asks most often,
// so it gets the whole name row rather than a separate icon button.

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
        paddingHorizontal: 8,
        paddingTop: 4,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: theme.surface,
      }}
    >
      <Pressable
        onPress={onBack}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.55 : 1,
        })}
      >
        <Feather name="arrow-left" size={22} color={theme.ink} />
      </Pressable>

      <Pressable
        onPress={onPressIdentity}
        disabled={!onPressIdentity}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s profile`}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingLeft: 2,
          paddingRight: 8,
          paddingVertical: 4,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.primarySoft,
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
                color: theme.primary,
              }}
            >
              {initial}
            </Text>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 15,
              letterSpacing: -0.2,
              color: theme.ink,
            }}
          >
            {name}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: typography.family.sans,
                fontSize: 11.5,
                color: theme.muteSoft,
                marginTop: 1,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        onPress={onOverflow}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel="Conversation options"
        style={({ pressed }) => ({
          width: 36,
          height: 36,
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
