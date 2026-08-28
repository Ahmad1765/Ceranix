import React, { useState, useMemo, useCallback } from 'react';
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
import { radii, type, ThemeTokens } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
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

const SORTS: { id: FeedSort; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'relevance', label: 'Recommended', icon: 'star' },
  { id: 'newest', label: 'Newest', icon: 'clock' },
  { id: 'price_asc', label: 'Price: Low to High', icon: 'trending-up' },
  { id: 'price_desc', label: 'Price: High to Low', icon: 'trending-down' },
  { id: 'popular', label: 'Most Liked', icon: 'heart' },
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
 * High-performance, theme-reactive multi-criteria refinement bottom sheet
 * with wrap grids, dual-bound price inputs, and tactile micro-interactions.
 */
export function FeedFilterSheet({
  visible,
  initial = EMPTY_FEED_FILTERS,
  onClose,
  onApply,
  resultCount,
}: FeedFilterSheetProps) {
  const { theme, isDark } = useTheme();
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

  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

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

  const triggerHaptic = useCallback((type: 'selection' | 'impact' = 'selection') => {
    if (Platform.OS !== 'web') {
      if (type === 'selection') {
        Haptics.selectionAsync().catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }
  }, []);

  const toggleCategory = useCallback((cat: Category) => {
    triggerHaptic('selection');
    setFilters((prev) => ({
      ...prev,
      category: prev.category === cat ? null : cat,
    }));
  }, [triggerHaptic]);

  const toggleCondition = useCallback((cond: Condition) => {
    triggerHaptic('selection');
    setFilters((prev) => {
      const exists = prev.conditions.includes(cond);
      return {
        ...prev,
        conditions: exists
          ? prev.conditions.filter((c) => c !== cond)
          : [...prev.conditions, cond],
      };
    });
  }, [triggerHaptic]);

  const toggleSize = useCallback((size: string) => {
    triggerHaptic('selection');
    setFilters((prev) => {
      const exists = prev.sizes.includes(size);
      return {
        ...prev,
        sizes: exists
          ? prev.sizes.filter((s) => s !== size)
          : [...prev.sizes, size],
      };
    });
  }, [triggerHaptic]);

  const handleApplyPreset = useCallback((min: number | null, max: number | null) => {
    triggerHaptic('selection');
    setFilters((prev) => ({
      ...prev,
      priceMin: min,
      priceMax: max,
    }));
  }, [triggerHaptic]);

  const handleReset = useCallback(() => {
    triggerHaptic('impact');
    setFilters(EMPTY_FEED_FILTERS);
  }, [triggerHaptic]);

  const handleApply = useCallback(() => {
    triggerHaptic('impact');
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
  }, [filters, onApply, onClose, triggerHaptic]);

  const hasPriceConflict =
    filters.priceMin != null &&
    filters.priceMax != null &&
    filters.priceMin > filters.priceMax;

  // Dynamic Theme-Aware Styles
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Filter & Refine"
      subtitle={
        activeCount > 0
          ? `${activeCount} filter${activeCount > 1 ? 's' : ''} active${
              resultCount !== undefined ? ` · ${resultCount} items` : ''
            }`
          : 'Browse all items'
      }
      snapHeightRatio={0.9}
      scrollable
      headerRight={
        activeCount > 0 ? (
          <Pressable
            onPress={handleReset}
            hitSlop={10}
            style={({ pressed }) => [
              styles.headerReset,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Reset all filters"
          >
            <Feather name="rotate-ccw" size={13} color={theme.purple} style={{ marginRight: 4 }} />
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
                  ? `Show ${resultCount} Results`
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
        {/* 1. Category Selector */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Category</Text>
            {filters.category ? (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>1 selected</Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollRow}
          >
            {CATEGORIES.map((cat) => {
              const active = filters.category === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => toggleCategory(cat.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    active ? styles.chipActive : styles.chipInactive,
                    { transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <Feather
                    name={cat.icon}
                    size={14}
                    color={active ? '#FFFFFF' : theme.ink}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? '#FFFFFF' : theme.ink,
                        fontFamily: active
                          ? type.family.sansBold
                          : type.family.sansMedium,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {cat.label}
                  </Text>
                  {active && (
                    <Feather name="check" size={12} color="#FFFFFF" style={{ marginLeft: 2 }} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 2. Size Selector (Wrap Grid for instant scanning) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Size</Text>
            {filters.sizes.length > 0 ? (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>{filters.sizes.length} selected</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.wrapGrid}>
            {SIZES.map((size) => {
              const active = filters.sizes.includes(size);
              return (
                <Pressable
                  key={size}
                  onPress={() => toggleSize(size)}
                  style={({ pressed }) => [
                    styles.sizeChip,
                    active ? styles.chipActive : styles.chipInactive,
                    { transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <Text
                    style={[
                      styles.sizeChipText,
                      {
                        color: active ? '#FFFFFF' : theme.ink,
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
          </View>
        </View>

        {/* 3. Condition Selector */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Condition</Text>
            {filters.conditions.length > 0 ? (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>{filters.conditions.length} selected</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.wrapGrid}>
            {CONDITIONS.map((cond) => {
              const active = filters.conditions.includes(cond.id);
              return (
                <Pressable
                  key={cond.id}
                  onPress={() => toggleCondition(cond.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    active ? styles.chipActive : styles.chipInactive,
                    { transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  {active && (
                    <Feather name="check" size={13} color="#FFFFFF" style={{ marginRight: 2 }} />
                  )}
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? '#FFFFFF' : theme.ink,
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
          </View>
        </View>

        {/* 4. Price Range (Presets + Custom Inputs) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Price Range</Text>
            {filters.priceMin != null || filters.priceMax != null ? (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>
                  {filters.priceMin != null && filters.priceMax != null
                    ? `${CURRENCY_SYMBOL}${filters.priceMin} - ${CURRENCY_SYMBOL}${filters.priceMax}`
                    : filters.priceMin != null
                    ? `From ${CURRENCY_SYMBOL}${filters.priceMin}`
                    : filters.priceMax != null
                    ? `Up to ${CURRENCY_SYMBOL}${filters.priceMax}`
                    : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Quick Price Preset Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollRow}
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
                    isMatch ? styles.chipActive : styles.chipInactive,
                    { transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isMatch ? '#FFFFFF' : theme.ink,
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
                minFocused && styles.priceInputWrapperFocused,
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
                placeholderTextColor={theme.muteSoft}
                keyboardType="number-pad"
                returnKeyType="done"
                style={styles.priceInput}
              />
              {filters.priceMin != null && (
                <Pressable
                  onPress={() => setFilters((prev) => ({ ...prev, priceMin: null }))}
                  hitSlop={8}
                  style={styles.inputClearButton}
                  accessibilityLabel="Clear minimum price"
                >
                  <Feather name="x" size={13} color={theme.mute} />
                </Pressable>
              )}
            </View>

            <Text style={styles.priceDivider}>to</Text>

            <View
              style={[
                styles.priceInputWrapper,
                maxFocused && styles.priceInputWrapperFocused,
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
                placeholderTextColor={theme.muteSoft}
                keyboardType="number-pad"
                returnKeyType="done"
                style={styles.priceInput}
              />
              {filters.priceMax != null && (
                <Pressable
                  onPress={() => setFilters((prev) => ({ ...prev, priceMax: null }))}
                  hitSlop={8}
                  style={styles.inputClearButton}
                  accessibilityLabel="Clear maximum price"
                >
                  <Feather name="x" size={13} color={theme.mute} />
                </Pressable>
              )}
            </View>
          </View>

          {hasPriceConflict && (
            <View style={styles.priceWarningRow}>
              <Feather name="info" size={12} color={theme.purple} />
              <Text style={styles.priceWarningText}>
                Min is greater than Max (will auto-adjust on apply)
              </Text>
            </View>
          )}
        </View>

        {/* 5. Sort Order Selector */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Sort By</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollRow}
          >
            {SORTS.map((sortOption) => {
              const active = filters.sort === sortOption.id;
              return (
                <Pressable
                  key={sortOption.id}
                  onPress={() => {
                    triggerHaptic('selection');
                    setFilters((prev) => ({ ...prev, sort: sortOption.id }));
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    active ? styles.chipActive : styles.chipInactive,
                    { transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Feather
                    name={sortOption.icon}
                    size={14}
                    color={active ? '#FFFFFF' : theme.ink}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? '#FFFFFF' : theme.ink,
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

function createStyles(theme: ThemeTokens, isDark: boolean) {
  const inactiveChipBg = isDark ? '#222222' : '#F4F4F6';
  const inactiveChipBorder = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.07)';
  const activeChipBg = isDark ? theme.purple : '#111111';
  const activeChipBorder = isDark ? theme.purple : '#111111';
  const inputBg = isDark ? '#1E1E20' : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';

  return StyleSheet.create({
    container: {
      gap: 24,
    },
    headerReset: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radii.sm,
    },
    headerResetText: {
      fontSize: 13,
      color: theme.purple,
      fontFamily: type.family.sansBold,
      fontWeight: '700',
    },
    section: {
      gap: 12,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: 14,
      fontFamily: type.family.sansBold,
      fontWeight: '700',
      color: theme.ink,
      letterSpacing: -0.15,
    },
    activeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radii.pill,
      backgroundColor: isDark ? 'rgba(108, 71, 255, 0.25)' : theme.purpleSoft,
    },
    activeBadgeText: {
      fontSize: 11.5,
      fontFamily: type.family.sansBold,
      fontWeight: '700',
      color: isDark ? '#C4B5FD' : theme.purple,
    },
    scrollRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 2,
    },
    wrapGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      borderWidth: 1,
    },
    sizeChip: {
      minWidth: 48,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sizeChipText: {
      fontSize: 13,
      letterSpacing: -0.1,
    },
    chipInactive: {
      backgroundColor: inactiveChipBg,
      borderColor: inactiveChipBorder,
    },
    chipActive: {
      backgroundColor: activeChipBg,
      borderColor: activeChipBorder,
    },
    chipText: {
      fontSize: 13,
      letterSpacing: -0.1,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 2,
    },
    priceInputWrapper: {
      flex: 1,
      height: 46,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: inputBg,
      borderWidth: 1,
      borderColor: inputBorder,
      borderRadius: radii.xl,
      paddingHorizontal: 12,
    },
    priceInputWrapperFocused: {
      borderColor: theme.purple,
    },
    priceInputPrefix: {
      fontSize: 14,
      fontFamily: type.family.sansBold,
      color: theme.mute,
      marginRight: 6,
    },
    priceInput: {
      flex: 1,
      fontSize: 14.5,
      color: theme.ink,
      fontFamily: type.family.sansMedium,
      padding: 0,
      outlineStyle: 'none',
      outlineWidth: 0,
    } as any,
    inputClearButton: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 4,
    },
    priceDivider: {
      fontSize: 13,
      fontFamily: type.family.sansMedium,
      color: theme.muteSoft,
    },
    priceWarningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 4,
    },
    priceWarningText: {
      fontSize: 11.5,
      fontFamily: type.family.sansMedium,
      color: isDark ? '#C4B5FD' : theme.purple,
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
}
