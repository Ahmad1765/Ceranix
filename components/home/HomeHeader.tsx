// ─────────────────────────────────────────────────────────────────────────────
// HOME FEED HEADER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Preserving Aesthetic Discipline in Composed Headers
// Encapsulates the in-feed search bar, scrollable feed chips (For you, Trending,
// Saved, and custom alerts), and zero-layout-shift cold start guidance banners.
// ─────────────────────────────────────────────────────────────────────────────

import { memo, useRef } from 'react';
import { View, Pressable, ScrollView, Platform } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { colors, radii, shadow, type as typography } from '@/lib/theme';
import { FOR_YOU, TRENDING } from './useHomeFeedFilters';
import type { SavedSearch } from '@/lib/savedSearches';

function haptic() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

type FeedSearchProps = {
  value: string;
  onChangeText: (t: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  resultCount: number | null;
  filterCount: number;
  onOpenFilter: () => void;
  savedActive: boolean;
  onToggleSaved: () => void;
};

export const FeedSearch = memo(function FeedSearch({
  value,
  onChangeText,
  focused,
  onFocus,
  onBlur,
  resultCount,
  filterCount,
  onOpenFilter,
  savedActive,
  onToggleSaved,
}: FeedSearchProps) {
  const inputRef = useRef<any>(null);
  const searching = value.trim().length > 0;
  const hasFilters = filterCount > 0;

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#F1F2F6',
            borderRadius: radii.pill,
            paddingLeft: 14,
            paddingRight: 10,
            height: 44,
            borderWidth: 0,
            borderColor: 'transparent',
          }}
        >
          <Feather
            name="search"
            size={16}
            color="#6A6E76"
            style={{ flexShrink: 0 }}
          />
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Search"
            placeholderTextColor="#6A6E76"
            style={{
              flex: 1,
              minWidth: 0,
              flexShrink: 1,
              marginLeft: 9,
              marginRight: 6,
              fontFamily: typography.family.sansMedium,
              fontSize: 13.5,
              letterSpacing: -0.15,
              color: colors.ink,
              padding: 0,
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {searching && Platform.OS !== 'ios' && (
            <Pressable
              onPress={() => onChangeText('')}
              hitSlop={8}
              accessibilityLabel="Clear search"
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.08)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 4,
              }}
            >
              <Feather name="x" size={12} color="#6A6E76" />
            </Pressable>
          )}
          {resultCount != null && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radii.pill,
                backgroundColor: colors.purpleSoft,
                flexShrink: 0,
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 11,
                  color: colors.purple,
                  letterSpacing: -0.2,
                }}
              >
                {resultCount}
              </Text>
            </View>
          )}
        </View>

        {focused ? (
          <Pressable
            onPress={() => {
              inputRef.current?.blur();
              onBlur();
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              paddingHorizontal: 4,
              paddingVertical: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 14,
                color: colors.ink,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        ) : (
          <>
            {/* Filter button with badge */}
            <Pressable
              onPress={() => {
                haptic();
                onOpenFilter();
              }}
              accessibilityRole="button"
              accessibilityLabel={hasFilters ? `Filters, ${filterCount} active` : 'Filters'}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: hasFilters ? colors.ink : colors.surface,
                borderWidth: 1,
                borderColor: hasFilters ? colors.ink : colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
                ...shadow.sm,
              })}
            >
              <Feather
                name="sliders"
                size={16}
                color={hasFilters ? colors.white : colors.ink}
              />
              {hasFilters && (
                <View
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                    borderWidth: 2,
                    borderColor: colors.background,
                  }}
                >
                  <Text
                    style={{
                      color: colors.white,
                      fontSize: 10,
                      fontWeight: '800',
                      lineHeight: 11,
                    }}
                  >
                    {filterCount}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Saved quick toggle */}
            <Pressable
              onPress={() => {
                haptic();
                onToggleSaved();
              }}
              accessibilityRole="button"
              accessibilityLabel={savedActive ? 'Viewing saved items' : 'View saved items'}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: savedActive ? colors.ink : colors.surface,
                borderWidth: 1,
                borderColor: savedActive ? colors.ink : colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
                ...shadow.sm,
              })}
            >
              <Feather
                name="bookmark"
                size={16}
                color={savedActive ? colors.white : colors.ink}
              />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
});

type ChipRowProps = {
  savedSearches: SavedSearch[];
  activeChip: string;
  onSelectChip: (id: string) => void;
  onDeleteChip: (s: SavedSearch) => void;
  onAdd: () => void;
};

export const ChipRow = memo(function ChipRow({
  savedSearches,
  activeChip,
  onSelectChip,
  onDeleteChip,
  onAdd,
}: ChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 12, alignItems: 'center' }}
    >
      {/* For You Primary Chip */}
      <Pressable
        onPress={() => {
          haptic();
          onSelectChip(FOR_YOU);
        }}
        style={({ pressed }) => ({
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radii.pill,
          backgroundColor: activeChip === FOR_YOU ? '#F2F4F7' : '#FFFFFF',
          borderWidth: activeChip === FOR_YOU ? 0 : 1,
          borderColor: activeChip === FOR_YOU ? 'transparent' : 'rgba(0, 0, 0, 0.1)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <Feather name="zap" size={13} color={colors.ink} />
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 13,
            color: colors.ink,
          }}
        >
          For you
        </Text>
      </Pressable>

      {/* Trending Chip */}
      <Pressable
        onPress={() => {
          haptic();
          onSelectChip(TRENDING);
        }}
        style={({ pressed }) => ({
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radii.pill,
          backgroundColor: activeChip === TRENDING ? '#F2F4F7' : '#FFFFFF',
          borderWidth: activeChip === TRENDING ? 0 : 1,
          borderColor: activeChip === TRENDING ? 'transparent' : 'rgba(0, 0, 0, 0.1)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <Feather name="trending-up" size={13} color={colors.ink} />
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 13,
            color: colors.ink,
          }}
        >
          Trending
        </Text>
      </Pressable>

      {/* Create Alert / Saved Search Circular Button */}
      <Pressable
        onPress={() => {
          haptic();
          onAdd();
        }}
        accessibilityLabel="Create alert"
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: radii.pill,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: 'rgba(0, 0, 0, 0.1)',
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <Feather name="plus" size={16} color={colors.ink} />
      </Pressable>

      {/* Saved Searches Chips */}
      {savedSearches.map((s) => {
        const active = activeChip === s.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => {
              haptic();
              onSelectChip(s.id);
            }}
            onLongPress={() => {
              haptic();
              onDeleteChip(s);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radii.pill,
              backgroundColor: active ? '#F2F4F7' : '#FFFFFF',
              borderWidth: active ? 0 : 1,
              borderColor: active ? 'transparent' : 'rgba(0, 0, 0, 0.1)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Text
              style={{
                fontFamily: typography.family.sansMedium,
                fontSize: 13,
                color: colors.ink,
              }}
            >
              {s.label ?? 'Saved'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

type HomeHeaderProps = {
  searchProps: FeedSearchProps;
  chipProps: ChipRowProps;
  showColdStartBanner: boolean;
  showFollowCta: boolean;
};

export const HomeHeader = memo(function HomeHeader({
  searchProps,
  chipProps,
  showColdStartBanner,
  showFollowCta,
}: HomeHeaderProps) {
  return (
    <>
      <FeedSearch {...searchProps} />
      <ChipRow {...chipProps} />

      {showColdStartBanner && (
        <Pressable
          onPress={() => {
            haptic();
            router.push('/auth/login');
          }}
          style={{
            marginTop: -8,
            marginHorizontal: 14,
            marginBottom: 10,
            padding: 14,
            borderRadius: radii.md,
            backgroundColor: colors.purpleSoft,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Feather name="user-plus" size={16} color={colors.purple} style={{ marginRight: 10 }} />
          <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontWeight: '600' }}>
            Sign in and like a few items to see this feed personalize itself.
          </Text>
        </Pressable>
      )}

      {showFollowCta && (
        <Pressable
          onPress={() => {
            haptic();
            router.push('/(tabs)/discover');
          }}
          style={{
            marginTop: -8,
            marginHorizontal: 14,
            marginBottom: 10,
            padding: 14,
            borderRadius: radii.md,
            backgroundColor: colors.purpleSoft,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Feather name="compass" size={16} color={colors.purple} style={{ marginRight: 10 }} />
          <Text style={{ flex: 1, color: colors.purple, fontSize: 13, fontWeight: '600' }}>
            Follow some sellers or like a few items to start personalizing your feed.
          </Text>
        </Pressable>
      )}
    </>
  );
});
