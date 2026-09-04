import React, { memo, useCallback } from 'react';
import { View, Pressable, ScrollView, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { HIT_SLOP_8 } from '@/lib/responsive';
import type { SearchSuggestion } from '@/lib/searchSuggestions';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

interface PreSearchSuggestionsProps {
  suggestions: SearchSuggestion[];
  onSelect: (term: string) => void;
  onPopulate: (term: string) => void;
}

export const PreSearchSuggestions = memo(function PreSearchSuggestions({
  suggestions,
  onSelect,
  onPopulate,
}: PreSearchSuggestionsProps) {
  const { theme, isDark } = useTheme();

  const handleSelect = useCallback(
    (term: string) => {
      haptic();
      onSelect(term);
    },
    [onSelect],
  );

  const handlePopulate = useCallback(
    (term: string) => {
      haptic();
      onPopulate(term);
    },
    [onPopulate],
  );

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      contentContainerStyle={{ paddingBottom: 40 }}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      {suggestions.map((item) => (
        <SuggestionRow
          key={item.id}
          item={item}
          isDark={isDark}
          theme={theme}
          onSelect={handleSelect}
          onPopulate={handlePopulate}
        />
      ))}
    </ScrollView>
  );
});

interface SuggestionRowProps {
  item: SearchSuggestion;
  isDark: boolean;
  theme: any;
  onSelect: (term: string) => void;
  onPopulate: (term: string) => void;
}

const SuggestionRow = memo(function SuggestionRow({
  item,
  isDark,
  theme,
  onSelect,
  onPopulate,
}: SuggestionRowProps) {
  const textColor = isDark ? '#EDEDED' : '#111827';
  const borderBottomColor = isDark ? '#1C2428' : '#F0F2F5';
  const pressedBg = isDark ? '#1E282D' : '#F3F4F6';
  const arrowColor = isDark ? '#9CA3AF' : '#6B7280';

  return (
    <Pressable
      onPress={() => onSelect(item.text)}
      accessibilityRole="button"
      accessibilityLabel={`Search ${item.text}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor,
        backgroundColor: pressed ? pressedBg : 'transparent',
      })}
    >
      {/* Suggestion Text with Highlight Formatting */}
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginRight: 12 }}>
        <Text
          style={{
            fontSize: 15.5,
            color: textColor,
            letterSpacing: -0.2,
          }}
        >
          {item.parts.map((part, idx) => (
            <Text
              key={idx}
              style={{
                // Matching reference screenshot: query part in regular weight, completed parts in bold weight
                fontWeight: part.isMatch ? '400' : '700',
                color: part.isMatch
                  ? isDark
                    ? '#9CA3AF'
                    : '#4B5563'
                  : textColor,
              }}
            >
              {part.text}
            </Text>
          ))}
        </Text>
      </View>

      {/* Action Arrow (↖) - Tapping populates search input to continue typing */}
      <Pressable
        hitSlop={HIT_SLOP_8}
        onPress={(e) => {
          e.stopPropagation();
          onPopulate(item.text);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Insert ${item.text} into search`}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 16,
          opacity: pressed ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.92 : 1 }],
        })}
      >
        <Feather name="arrow-up-left" size={19} color={arrowColor} />
      </Pressable>
    </Pressable>
  );
});
