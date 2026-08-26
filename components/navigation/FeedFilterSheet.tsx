import React, { useState, useMemo } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { ThumbButton } from '@/components/ui/ThumbButton';
import { Text, TextInput } from '@/lib/rnText';
import { colors, radii, shadow, type } from '@/lib/theme';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import type { Category, Condition } from '@/types';

export type FeedSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popular';

export interface FeedFilters {
  category: Category | null;
  conditions: Condition[];
  sizes: string[];
  priceMin: number | null;
  priceMax: number | null;
  sort: FeedSort;
}

export const EMPTY_FEED_FILTERS: FeedFilters = {
  category: null,
  conditions: [],
  sizes: [],
  priceMin: null,
  priceMax: null,
  sort: 'relevance',
};

export function countActiveFilters(f: FeedFilters): number {
  let count = 0;
  if (f.category) count += 1;
  count += f.conditions.length;
  count += f.sizes.length;
  if (f.priceMin != null || f.priceMax != null) count += 1;
  if (f.sort !== 'relevance') count += 1;
  return count;
}

const CATEGORIES: { id: Category; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'clothing', label: 'Clothing', icon: 'layers' },
  { id: 'shoes', label: 'Shoes', icon: 'box' },
  { id: 'bags', label: 'Bags', icon: 'briefcase' },
  { id: 'accessories', label: 'Accessories', icon: 'watch' },
  { id: 'electronics', label: 'Tech', icon: 'smartphone' },
  { id: 'beauty', label: 'Beauty', icon: 'droplet' },
  { id: 'other', label: 'Other', icon: 'grid' },
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];

const CONDITIONS: { id: Condition; label: string }[] = [
  { id: 'new_with_tags', label: 'New with tags' },
  { id: 'like_new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
];

const SORTS: { id: FeedSort; label: string }[] = [
  { id: 'relevance', label: 'Recommended' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'price_desc', label: 'Price: High to Low' },
  { id: 'popular', label: 'Most Liked' },
];

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'All', min: null, max: null },
  { label: `Under ${CURRENCY_SYMBOL}25`, min: null, max: 25 },
  { label: `${CURRENCY_SYMBOL}25 - ${CURRENCY_SYMBOL}50`, min: 25, max: 50 },
  { label: `${CURRENCY_SYMBOL}50 - ${CURRENCY_SYMBOL}100`, min: 50, max: 100 },
  { label: `${CURRENCY_SYMBOL}100+`, min: 100, max: null },
];

export interface FeedFilterSheetProps {
  visible: boolean;
  initial?: FeedFilters;
  onClose: () => void;
  onApply: (filters: FeedFilters) => void;
  resultCount?: number;
}

/**
 * Mobile-First Discovery Filter Bottom Sheet.
 * Multi-criteria refinement with horizontal chip selectors, price bounding,
 * and zero-navigation instant list application.
 */
export function FeedFilterSheet({
  visible,
  initial = EMPTY_FEED_FILTERS,
  onClose,
  onApply,
  resultCount,
}: FeedFilterSheetProps) {
  const [filters, setFilters] = useState<FeedFilters>(initial);
  const prevVisibleRef = React.useRef(visible);
  const [minFocused, setMinFocused] = useState(false);
  const [maxFocused, setMaxFocused] = useState(false);

  // Sync with initial only when visible transitions from false to true
  React.useEffect(() => {
    if (!prevVisibleRef.current && visible) {
      setFilters(initial);
    }
    prevVisibleRef.current = visible;
  }, [visible, initial]);

  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.category) count += 1;
    count += filters.conditions.length;
    count += filters.sizes.length;
    if (filters.priceMin != null || filters.priceMax != null) count += 1;
    if (filters.sort !== 'relevance') count += 1;
    return count;
  }, [filters]);

  const isDirty = useMemo(() => {
    return (
      filters.category !== initial.category ||
      filters.sort !== initial.sort ||
      filters.priceMin !== initial.priceMin ||
      filters.priceMax !== initial.priceMax ||
      filters.conditions.length !== initial.conditions.length ||
      filters.sizes.length !== initial.sizes.length ||
      filters.conditions.some((c) => !initial.conditions.includes(c)) ||
      filters.sizes.some((s) => !initial.sizes.includes(s))
    );
  }, [filters, initial]);

  const toggleCategory = (cat: Category) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setFilters((prev) => ({
      ...prev,
      category: prev.category === cat ? null : cat,
    }));
  };

  const toggleCondition = (cond: Condition) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setFilters((prev) => {
      const exists = prev.conditions.includes(cond);
      return {
        ...prev,
        conditions: exists
          ? prev.conditions.filter((c) => c !== cond)
          : [...prev.conditions, cond],
      };
    });
  };

  const toggleSize = (size: string) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setFilters((prev) => {
      const exists = prev.sizes.includes(size);
      return {
        ...prev,
        sizes: exists
          ? prev.sizes.filter((s) => s !== size)
          : [...prev.sizes, size],
      };
    });
  };

  const handleApplyPreset = (min: number | null, max: number | null) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setFilters((prev) => ({
      ...prev,
      priceMin: min,
      priceMax: max,
    }));
  };

  const handleReset = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setFilters(EMPTY_FEED_FILTERS);
  };

  const handleApply = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    let appliedFilters = filters;
    if (
      filters.priceMin != null &&
      filters.priceMax != null &&
      filters.priceMin > filters.priceMax
    ) {
      appliedFilters = {
        ...filters,
        priceMin: filters.priceMax,
        priceMax: filters.priceMin,
      };
      setFilters(appliedFilters);
    }
    onApply(appliedFilters);
    onClose();
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Filter & Refine"
      subtitle={activeCount > 0 ? `${activeCount} filter${activeCount > 1 ? 's' : ''} applied` : 'Browse all items'}
      snapHeightRatio={0.88}
      scrollable
      headerRight={
        activeCount > 0 ? (
          <Pressable onPress={handleReset} hitSlop={8} style={styles.headerReset}>
            <Text style={styles.headerResetText}>Reset all</Text>
          </Pressable>
        ) : null
      }
      footer={
        <View style={styles.footerRow}>
          <View style={styles.resetButtonFlex}>
            <ThumbButton
              label="Reset"
              variant="secondary"
              heightToken="48px"
              disabled={activeCount === 0}
              onPress={handleReset}
              accessibilityLabel="Reset all filters"
            />
          </View>
          <View style={styles.applyButtonFlex}>
            <ThumbButton
              label={
                !isDirty && resultCount !== undefined
                  ? `Apply (${resultCount})`
                  : activeCount > 0
                  ? `Apply (${activeCount})`
                  : 'Apply Filters'
              }
              variant="primary"
              heightToken="48px"
              onPress={handleApply}
              accessibilityLabel="Apply filters and close"
            />
          </View>
        </View>
      }
    >
      <View style={styles.container}>
        {/* 1. Category Horizontal Chips */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Category</Text>
            {filters.category ? (
              <Text style={styles.sectionActiveHint}>1 selected</Text>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {CATEGORIES.map((cat) => {
              const active = filters.category === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => toggleCategory(cat.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    { transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <Feather
                    name={cat.icon}
                    size={14}
                    color={active ? '#FFFFFF' : colors.ink}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? '#FFFFFF' : colors.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 2. Size Horizontal Chips */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Size</Text>
            {filters.sizes.length > 0 ? (
              <Text style={styles.sectionActiveHint}>{filters.sizes.length} selected</Text>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {SIZES.map((size) => {
              const active = filters.sizes.includes(size);
              return (
                <Pressable
                  key={size}
                  onPress={() => toggleSize(size)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    { transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? '#FFFFFF' : colors.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {size}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 3. Condition Horizontal Chips */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Condition</Text>
            {filters.conditions.length > 0 ? (
              <Text style={styles.sectionActiveHint}>{filters.conditions.length} selected</Text>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {CONDITIONS.map((cond) => {
              const active = filters.conditions.includes(cond.id);
              return (
                <Pressable
                  key={cond.id}
                  onPress={() => toggleCondition(cond.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    { transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? '#FFFFFF' : colors.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {cond.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 4. Price Range Presets + Min/Max Inputs */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Price Range</Text>
            {filters.priceMin != null || filters.priceMax != null ? (
              <Text style={styles.sectionActiveHint}>
                {filters.priceMin != null && filters.priceMax != null
                  ? `${CURRENCY_SYMBOL}${filters.priceMin} - ${CURRENCY_SYMBOL}${filters.priceMax}`
                  : filters.priceMin != null
                  ? `From ${CURRENCY_SYMBOL}${filters.priceMin}`
                  : filters.priceMax != null
                  ? `Up to ${CURRENCY_SYMBOL}${filters.priceMax}`
                  : ''}
              </Text>
            ) : null}
          </View>

          {/* Quick Price Preset Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {PRICE_PRESETS.map((preset, index) => {
              const isMatch =
                filters.priceMin === preset.min && filters.priceMax === preset.max;
              return (
                <Pressable
                  key={index}
                  onPress={() => handleApplyPreset(preset.min, preset.max)}
                  style={({ pressed }) => [
                    styles.chip,
                    isMatch && styles.chipActive,
                    { transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isMatch ? '#FFFFFF' : colors.ink,
                        fontFamily: isMatch
                          ? type.family.sansBold
                          : type.family.sansMedium,
                        fontWeight: isMatch ? '700' : '500',
                      },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Custom Min/Max Inputs */}
          <View style={styles.priceRow}>
            <View
              style={[
                styles.priceInputWrapper,
                minFocused && { borderColor: colors.purple },
              ]}
            >
              <Text style={styles.priceInputPrefix}>{CURRENCY_SYMBOL}</Text>
              <TextInput
                value={filters.priceMin != null ? String(filters.priceMin) : ''}
                onChangeText={(text) => {
                  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
                  setFilters((prev) => ({
                    ...prev,
                    priceMin: isNaN(n) ? null : n,
                  }));
                }}
                onFocus={() => setMinFocused(true)}
                onBlur={() => setMinFocused(false)}
                placeholder="Min"
                placeholderTextColor={colors.muteSoft}
                keyboardType="number-pad"
                style={[styles.priceInput, { fontFamily: type.family.sansMedium }]}
              />
            </View>
            <Text style={styles.priceDivider}>to</Text>
            <View
              style={[
                styles.priceInputWrapper,
                maxFocused && { borderColor: colors.purple },
              ]}
            >
              <Text style={styles.priceInputPrefix}>{CURRENCY_SYMBOL}</Text>
              <TextInput
                value={filters.priceMax != null ? String(filters.priceMax) : ''}
                onChangeText={(text) => {
                  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
                  setFilters((prev) => ({
                    ...prev,
                    priceMax: isNaN(n) ? null : n,
                  }));
                }}
                onFocus={() => setMaxFocused(true)}
                onBlur={() => setMaxFocused(false)}
                placeholder="Max"
                placeholderTextColor={colors.muteSoft}
                keyboardType="number-pad"
                style={[styles.priceInput, { fontFamily: type.family.sansMedium }]}
              />
            </View>
          </View>
        </View>

        {/* 5. Sort Order Radio Chips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sort By</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {SORTS.map((sortOption) => {
              const active = filters.sort === sortOption.id;
              return (
                <Pressable
                  key={sortOption.id}
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      Haptics.selectionAsync().catch(() => {});
                    }
                    setFilters((prev) => ({ ...prev, sort: sortOption.id }));
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    { transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? '#FFFFFF' : colors.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {sortOption.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 22,
  },
  headerReset: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerResetText: {
    fontSize: 13,
    color: colors.purple,
    fontFamily: type.family.sansBold,
    fontWeight: '700',
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 13.5,
    fontFamily: type.family.sansBold,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.1,
  },
  sectionActiveHint: {
    fontSize: 12,
    fontFamily: type.family.sansMedium,
    color: colors.purple,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 15,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  chipText: {
    fontSize: 13,
    letterSpacing: -0.1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  priceInputWrapper: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
  },
  priceInputPrefix: {
    fontSize: 15,
    fontFamily: type.family.sansBold,
    color: colors.ink,
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    fontSize: 14.5,
    color: colors.ink,
    padding: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  priceDivider: {
    fontSize: 13,
    fontFamily: type.family.sansMedium,
    color: colors.muteSoft,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  resetButtonFlex: {
    flex: 1,
  },
  applyButtonFlex: {
    flex: 2,
  },
});
