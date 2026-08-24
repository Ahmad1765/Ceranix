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
import { colors, radii, type } from '@/lib/theme';
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
  { id: 'clothing', label: 'Clothing', icon: 'shopping-bag' },
  { id: 'shoes', label: 'Shoes', icon: 'shopping-bag' },
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

export interface FeedFilterSheetProps {
  visible: boolean;
  initial?: FeedFilters;
  onClose: () => void;
  onApply: (filters: FeedFilters) => void;
  resultCount?: number;
}

/**
 * Mobile-First Discovery Filter Bottom Sheet.
 * Multi-criteria refinement with 1-tap chip selectors, price bounding,
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
      snapHeightRatio={0.85}
      scrollable
      headerRight={
        activeCount > 0 ? (
          <Pressable onPress={handleReset} hitSlop={8} style={styles.headerReset}>
            <Text style={styles.headerResetText}>Reset</Text>
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
          <Text style={[styles.sectionTitle, { fontFamily: type.family.sansBold }]}>
            Category
          </Text>
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
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <Feather
                    name={cat.icon}
                    size={14}
                    color={active ? colors.primary : colors.ink}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? colors.primary : colors.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
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
          <Text style={[styles.sectionTitle, { fontFamily: type.family.sansBold }]}>
            Size
          </Text>
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
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? colors.primary : colors.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
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
          <Text style={[styles.sectionTitle, { fontFamily: type.family.sansBold }]}>
            Condition
          </Text>
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
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? colors.primary : colors.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
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

        {/* 4. Price Range Visualizer Inputs */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontFamily: type.family.sansBold }]}>
            Price Range
          </Text>
          <View style={styles.priceRow}>
            <View style={styles.priceInputWrapper}>
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
                placeholder="Min"
                placeholderTextColor={colors.mute}
                keyboardType="number-pad"
                style={[styles.priceInput, { fontFamily: type.family.sansMedium }]}
              />
            </View>
            <Text style={styles.priceDivider}>to</Text>
            <View style={styles.priceInputWrapper}>
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
                placeholder="Max"
                placeholderTextColor={colors.mute}
                keyboardType="number-pad"
                style={[styles.priceInput, { fontFamily: type.family.sansMedium }]}
              />
            </View>
          </View>
        </View>

        {/* 5. Sort Order Radio Chips */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontFamily: type.family.sansBold }]}>
            Sort By
          </Text>
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
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? colors.primary : colors.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
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
    gap: 20,
  },
  headerReset: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerResetText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    color: colors.ink,
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
    height: 44, // Minimum 44px mobile touch target
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    fontSize: 13,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  priceInputWrapper: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.xl,
    paddingHorizontal: 12,
  },
  priceInputPrefix: {
    fontSize: 16,
    color: colors.mute,
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  },
  priceDivider: {
    fontSize: 13,
    color: colors.mute,
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
