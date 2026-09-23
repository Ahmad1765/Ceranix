import { useState, useMemo } from 'react';
import { View, Pressable, Platform, useWindowDimensions } from 'react-native';
import { TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { colors, radii, shadow, type as typography } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';

interface Props {
  placeholder?: string;
  onPress?: () => void;
  editable?: boolean;
  value?: string;
  onChangeText?: (text: string) => void;
}

export function SearchBar({
  placeholder = 'What are you looking for today?',
  onPress,
  editable = false,
  value = '',
  onChangeText,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  const searching = (value ?? '').trim().length > 0;

  const resolvedPlaceholder = useMemo(() => {
    if (placeholder !== 'What are you looking for today?') {
      return placeholder;
    }
    if (screenWidth < 380) {
      return 'Search items, brands…';
    }
    if (screenWidth < 420) {
      return 'What are you looking for?';
    }
    return placeholder;
  }, [placeholder, screenWidth]);

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.panel,
        borderRadius: radii.pill,
        paddingLeft: 12,
        paddingRight: searching ? 8 : 12,
        height: 44,
        borderWidth: 1,
        borderColor: focused ? colors.purple : colors.border,
        ...shadow.sm,
      }}
    >
      <Feather
        name="search"
        size={17}
        color={focused ? colors.purple : colors.muteSoft}
        style={{ flexShrink: 0 }}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={resolvedPlaceholder}
        placeholderTextColor={colors.muteSoft}
        editable={editable && !onPress}
        pointerEvents={onPress ? 'none' : 'auto'}
        style={
          {
            flex: 1,
            minWidth: 0,
            flexShrink: 1,
            marginLeft: 8,
            marginRight: searching ? 6 : 0,
            fontFamily: typography.family.sansMedium,
            fontSize: 16,
            letterSpacing: -0.15,
            color: colors.ink,
            padding: 0,
            outlineStyle: 'none',
            outlineWidth: 0,
          } as any
        }
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel={resolvedPlaceholder}
      />
      {searching && onChangeText && !onPress ? (
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
            onChangeText('');
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={({ pressed }) => ({
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: radii.pill,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          <Feather name="x" size={14} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        style={({ pressed }) => ({
          marginHorizontal: 16,
          marginVertical: 8,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={{ marginHorizontal: 16, marginVertical: 8 }}>{content}</View>;
}
