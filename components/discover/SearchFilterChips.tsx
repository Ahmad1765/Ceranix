// ─────────────────────────────────────────────────────────────────────────────
// SEARCH FILTER CHIPS & RESULTS HEADER (VINTED PARITY)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Horizontal Refinement Chips & Micro-Filters
//
// Renders the horizontal scrollable filter chips directly below the search bar
// once a search is active, matching Vinted's exact visual design and taxonomy:
// 1. "Filters" with slider icon and active badge
// 2. "Category", "Brand", "Size", "Condition", "Price", "Color", "Material", "Sort by"
// 3. Subheader with formatted result count ("500+ results") and "Search results ⓘ"
// 4. Interactive quick-filter bottom sheets and educational search ranking modal
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { radii, type as typography } from '@/lib/theme';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import { CATEGORIES } from '@/lib/categories';
import type { Category, Condition } from '@/types';
import type { SortKey } from '@/lib/listings';

import {
  type SearchFilterState,
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
} from '@/lib/searchFilters';

export {
  type SearchFilterState,
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
};


const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];

const CONDITIONS: { id: Condition; label: string; desc: string }[] = [
  { id: 'new_with_tags', label: 'New with tags', desc: 'Brand new, never worn with tags' },
  { id: 'like_new', label: 'Like new', desc: 'Used once or twice, perfect condition' },
  { id: 'good', label: 'Good', desc: 'Gently used, minor flaws or wear' },
  { id: 'fair', label: 'Fair', desc: 'Visible signs of wear or defects' },
];

const POPULAR_BRANDS = [
  'Nike',
  'Zara',
  'Adidas',
  'H&M',
  "Levi's",
  'Ralph Lauren',
  'Brandy Melville',
  'Stussy',
  'Vintage',
  'Carhartt',
  'Urban Outfitters',
  'North Face',
];

const COLORS: { name: string; hex: string; border?: string }[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#FFFFFF', border: '#D1D5DB' },
  { name: 'Grey', hex: '#9CA3AF' },
  { name: 'Beige', hex: '#E6DCB8' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Red', hex: '#DC2626' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Purple', hex: '#9333EA' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Brown', hex: '#78350F' },
  { name: 'Multi', hex: 'linear-gradient(45deg, #f00, #ff0, #00f)' },
];

const MATERIALS = [
  'Cotton',
  'Denim',
  'Leather',
  'Silk',
  'Wool',
  'Linen',
  'Polyester',
  'Knitwear',
  'Velvet',
  'Fleece',
];

const SORT_OPTIONS: { id: SortKey | 'relevance'; label: string; desc: string }[] = [
  { id: 'relevance', label: 'Relevance', desc: 'Most relevant to your search' },
  { id: 'price_asc', label: 'Price: low to high', desc: 'Cheapest items first' },
  { id: 'price_desc', label: 'Price: high to low', desc: 'Highest priced items first' },
  { id: 'newest', label: 'Newest first', desc: 'Recently added listings' },
  { id: 'popular', label: 'Most liked', desc: 'Trending and most favorited' },
];

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'All', min: null, max: null },
  { label: `Under ${CURRENCY_SYMBOL}25`, min: null, max: 25 },
  { label: `${CURRENCY_SYMBOL}25 - ${CURRENCY_SYMBOL}50`, min: 25, max: 50 },
  { label: `${CURRENCY_SYMBOL}50 - ${CURRENCY_SYMBOL}100`, min: 50, max: 100 },
  { label: `${CURRENCY_SYMBOL}100+`, min: 100, max: null },
];

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync().catch(() => {});
  }
}

type ModalType =
  | null
  | 'category'
  | 'brand'
  | 'size'
  | 'condition'
  | 'price'
  | 'color'
  | 'material'
  | 'sort'
  | 'info';

export interface SearchFilterChipsProps {
  filters: SearchFilterState;
  onUpdateFilter: (updater: (prev: SearchFilterState) => SearchFilterState) => void;
  onResetFilters: () => void;
  resultCount: number;
  onOpenFullFilter?: () => void;
}

export const SearchFilterChips = memo(function SearchFilterChips({
  filters,
  onUpdateFilter,
  onResetFilters,
  resultCount,
  onOpenFullFilter,
}: SearchFilterChipsProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [brandInput, setBrandInput] = useState('');
  const [customMin, setCustomMin] = useState('');
  const [customMax, setCustomMax] = useState('');

  const activeCount = useMemo(() => countActiveSearchFilters(filters), [filters]);

  // Formatted count label matching Vinted: "500+ results" or "X results"
  const formattedCountText = useMemo(() => {
    if (resultCount >= 500) return '500+ results';
    if (resultCount === 1) return '1 result';
    return `${resultCount} results`;
  }, [resultCount]);

  // Close modals
  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  // Category Toggle
  const handleSelectCategory = useCallback(
    (catId: Category | null) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        category: prev.category === catId ? null : catId,
        subcategory: null,
      }));
      closeModal();
    },
    [onUpdateFilter, closeModal],
  );

  // Brand Toggle / Set
  const handleSelectBrand = useCallback(
    (brandName: string | null) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        brand: prev.brand?.toLowerCase() === brandName?.toLowerCase() ? null : brandName,
      }));
      closeModal();
    },
    [onUpdateFilter, closeModal],
  );

  const handleApplyCustomBrand = useCallback(() => {
    const trimmed = brandInput.trim();
    if (trimmed) {
      handleSelectBrand(trimmed);
      setBrandInput('');
    }
  }, [brandInput, handleSelectBrand]);

  // Size Multi-toggle
  const handleToggleSize = useCallback(
    (size: string) => {
      haptic();
      onUpdateFilter((prev) => {
        const exists = prev.sizes.includes(size);
        return {
          ...prev,
          sizes: exists ? prev.sizes.filter((s) => s !== size) : [...prev.sizes, size],
        };
      });
    },
    [onUpdateFilter],
  );

  // Condition Multi-toggle
  const handleToggleCondition = useCallback(
    (cond: Condition) => {
      haptic();
      onUpdateFilter((prev) => {
        const exists = prev.conditions.includes(cond);
        return {
          ...prev,
          conditions: exists ? prev.conditions.filter((c) => c !== cond) : [...prev.conditions, cond],
        };
      });
    },
    [onUpdateFilter],
  );

  // Price presets & custom
  const handleSelectPricePreset = useCallback(
    (min: number | null, max: number | null) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        priceMin: min,
        priceMax: max,
      }));
      closeModal();
    },
    [onUpdateFilter, closeModal],
  );

  const handleApplyCustomPrice = useCallback(() => {
    haptic();
    const minVal = customMin.trim() ? parseFloat(customMin) : null;
    const maxVal = customMax.trim() ? parseFloat(customMax) : null;
    onUpdateFilter((prev) => ({
      ...prev,
      priceMin: minVal !== null && !isNaN(minVal) ? Math.max(0, minVal) : null,
      priceMax: maxVal !== null && !isNaN(maxVal) ? Math.max(0, maxVal) : null,
    }));
    closeModal();
  }, [customMin, customMax, onUpdateFilter, closeModal]);


  // Color Toggle
  const handleSelectColor = useCallback(
    (colorName: string) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        color: prev.color === colorName ? null : colorName,
      }));
      closeModal();
    },
    [onUpdateFilter, closeModal],
  );

  // Material Toggle
  const handleSelectMaterial = useCallback(
    (mat: string) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        material: prev.material === mat ? null : mat,
      }));
      closeModal();
    },
    [onUpdateFilter, closeModal],
  );

  // Sort Toggle
  const handleSelectSort = useCallback(
    (sortId: SortKey | 'relevance') => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        sort: sortId === 'relevance' ? null : sortId,
      }));
      closeModal();
    },
    [onUpdateFilter, closeModal],
  );

  // Active labels on chips
  const categoryLabel = useMemo(() => {
    if (!filters.category) return 'Category';
    const found = CATEGORIES.find((c) => c.id === filters.category);
    return found ? found.label : 'Category';
  }, [filters.category]);

  const brandLabel = useMemo(() => {
    return filters.brand ? filters.brand : 'Brand';
  }, [filters.brand]);

  const sizeLabel = useMemo(() => {
    if (filters.sizes.length === 0) return 'Size';
    if (filters.sizes.length === 1) return `Size: ${filters.sizes[0]}`;
    return `Size (${filters.sizes.length})`;
  }, [filters.sizes]);

  const conditionLabel = useMemo(() => {
    if (filters.conditions.length === 0) return 'Condition';
    if (filters.conditions.length === 1) {
      const c = CONDITIONS.find((item) => item.id === filters.conditions[0]);
      return c ? c.label : 'Condition';
    }
    return `Condition (${filters.conditions.length})`;
  }, [filters.conditions]);

  const priceLabel = useMemo(() => {
    if (filters.priceMin != null && filters.priceMax != null) {
      return `${CURRENCY_SYMBOL}${filters.priceMin} - ${CURRENCY_SYMBOL}${filters.priceMax}`;
    }
    if (filters.priceMin != null) return `From ${CURRENCY_SYMBOL}${filters.priceMin}`;
    if (filters.priceMax != null) return `Up to ${CURRENCY_SYMBOL}${filters.priceMax}`;
    return 'Price';
  }, [filters.priceMin, filters.priceMax]);

  const colorLabel = useMemo(() => {
    return filters.color ? `Color: ${filters.color}` : 'Color';
  }, [filters.color]);

  const materialLabel = useMemo(() => {
    return filters.material ? `Material: ${filters.material}` : 'Material';
  }, [filters.material]);

  const sortLabel = useMemo(() => {
    if (!filters.sort || filters.sort === 'popular') return 'Sort by';
    const s = SORT_OPTIONS.find((item) => item.id === filters.sort);
    return s ? s.label : 'Sort by';
  }, [filters.sort]);

  return (
    <View style={styles.container}>
      {/* ── 1. Horizontal Filter Chips ScrollBar ───────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chipsScrollContent}
        style={styles.chipsScrollView}
      >
        {/* Chip 1: Filter (Main trigger) */}
        <Pressable
          onPress={() => {
            haptic();
            if (onOpenFullFilter) {
              onOpenFullFilter();
            } else {
              setActiveModal('category');
            }
          }}
          style={({ pressed }) => [
            styles.chip,
            activeCount > 0 ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open all filters"
        >
          <Feather
            name="sliders"
            size={13.5}
            color={activeCount > 0 ? '#007782' : '#15191A'}
            style={{ marginRight: 5 }}
          />
          <Text
            style={[
              styles.chipText,
              activeCount > 0 ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            Filters
          </Text>
          {activeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeCount}</Text>
            </View>
          )}
        </Pressable>

        {/* Chip 2: Category */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('category');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.category ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by category. Currently ${categoryLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.category ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {categoryLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={filters.category ? '#007782' : '#6B7280'}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 3: Brand */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('brand');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.brand ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by brand. Currently ${brandLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.brand ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {brandLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={filters.brand ? '#007782' : '#6B7280'}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 4: Size */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('size');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.sizes.length > 0 ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by size. Currently ${sizeLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.sizes.length > 0 ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {sizeLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={filters.sizes.length > 0 ? '#007782' : '#6B7280'}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 5: Condition */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('condition');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.conditions.length > 0 ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by condition. Currently ${conditionLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.conditions.length > 0 ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {conditionLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={filters.conditions.length > 0 ? '#007782' : '#6B7280'}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 6: Price */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('price');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.priceMin != null || filters.priceMax != null
              ? styles.chipActive
              : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by price. Currently ${priceLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.priceMin != null || filters.priceMax != null
                ? styles.chipTextActive
                : styles.chipTextInactive,
            ]}
          >
            {priceLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={
              filters.priceMin != null || filters.priceMax != null
                ? '#007782'
                : '#6B7280'
            }
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 7: Color */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('color');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.color ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by color. Currently ${colorLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.color ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {colorLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={filters.color ? '#007782' : '#6B7280'}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 8: Material */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('material');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.material ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by material. Currently ${materialLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.material ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {materialLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={filters.material ? '#007782' : '#6B7280'}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 9: Sort by */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('sort');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.sort && filters.sort !== 'popular'
              ? styles.chipActive
              : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Sort results. Currently ${sortLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.sort && filters.sort !== 'popular'
                ? styles.chipTextActive
                : styles.chipTextInactive,
            ]}
          >
            {sortLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={
              filters.sort && filters.sort !== 'popular' ? '#007782' : '#6B7280'
            }
            style={{ marginLeft: 4 }}
          />
        </Pressable>
      </ScrollView>

      {/* ── 2. Results Count & Search Results ⓘ Header ──────────────────────── */}
      <View style={styles.resultsHeaderRow}>
        <Text style={styles.resultsCountText}>{formattedCountText}</Text>

        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('info');
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="How search results work"
          style={({ pressed }) => [
            styles.infoButton,
            { opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Text style={styles.infoButtonText}>Search results</Text>
          <Feather name="help-circle" size={13.5} color="#5A6566" style={{ marginLeft: 4 }} />
        </Pressable>
      </View>

      {/* ── 3. Quick Sub-Modals / Bottom Sheets ────────────────────────────── */}

      {/* Category Modal */}
      <Modal
        visible={activeModal === 'category'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Category</Text>
              <Pressable hitSlop={10} onPress={closeModal}>
                <Feather name="x" size={20} color="#15191A" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              <Pressable
                onPress={() => handleSelectCategory(null)}
                style={[
                  styles.optionRow,
                  filters.category === null && styles.optionRowSelected,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    filters.category === null && styles.optionTextSelected,
                  ]}
                >
                  All categories
                </Text>
                {filters.category === null && (
                  <Feather name="check" size={16} color="#007782" />
                )}
              </Pressable>

              {CATEGORIES.map((c) => {
                const isSelected = filters.category === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => handleSelectCategory(c.id)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Feather name={c.icon} size={16} color={isSelected ? '#007782' : '#5A6566'} />
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {c.label}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check" size={16} color="#007782" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Brand Modal */}
      <Modal
        visible={activeModal === 'brand'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Brand</Text>
              <Pressable hitSlop={10} onPress={closeModal}>
                <Feather name="x" size={20} color="#15191A" />
              </Pressable>
            </View>

            {/* Custom Brand Input */}
            <View style={styles.brandInputRow}>
              <TextInput
                value={brandInput}
                onChangeText={setBrandInput}
                placeholder="Type a brand name…"
                placeholderTextColor="#9CA3AF"
                onSubmitEditing={handleApplyCustomBrand}
                style={styles.brandTextInput as any}
              />
              <Pressable
                onPress={handleApplyCustomBrand}
                style={styles.brandApplyBtn}
              >
                <Text style={styles.brandApplyBtnText}>Apply</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {filters.brand && (
                <Pressable
                  onPress={() => handleSelectBrand(null)}
                  style={styles.optionRow}
                >
                  <Text style={[styles.optionText, { color: '#DC2626' }]}>
                    Clear brand ({filters.brand})
                  </Text>
                  <Feather name="x" size={15} color="#DC2626" />
                </Pressable>
              )}

              {POPULAR_BRANDS.map((b) => {
                const isSelected = filters.brand?.toLowerCase() === b.toLowerCase();
                return (
                  <Pressable
                    key={b}
                    onPress={() => handleSelectBrand(b)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {b}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color="#007782" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Size Modal */}
      <Modal
        visible={activeModal === 'size'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Size</Text>
              <Pressable hitSlop={10} onPress={closeModal}>
                <Feather name="x" size={20} color="#15191A" />
              </Pressable>
            </View>

            <View style={styles.wrapGrid}>
              {SIZES.map((sz) => {
                const isSelected = filters.sizes.includes(sz);
                return (
                  <Pressable
                    key={sz}
                    onPress={() => handleToggleSize(sz)}
                    style={[
                      styles.sizeChip,
                      isSelected ? styles.sizeChipActive : styles.sizeChipInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sizeChipText,
                        isSelected ? styles.sizeChipTextActive : styles.sizeChipTextInactive,
                      ]}
                    >
                      {sz}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => {
                  onUpdateFilter((prev) => ({ ...prev, sizes: [] }));
                }}
                style={styles.modalClearBtn}
              >
                <Text style={styles.modalClearBtnText}>Clear</Text>
              </Pressable>
              <Pressable onPress={closeModal} style={styles.modalDoneBtn}>
                <Text style={styles.modalDoneBtnText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Condition Modal */}
      <Modal
        visible={activeModal === 'condition'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Condition</Text>
              <Pressable hitSlop={10} onPress={closeModal}>
                <Feather name="x" size={20} color="#15191A" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              {CONDITIONS.map((cond) => {
                const isSelected = filters.conditions.includes(cond.id);
                return (
                  <Pressable
                    key={cond.id}
                    onPress={() => handleToggleCondition(cond.id)}
                    style={[
                      styles.optionRowWithDesc,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {cond.label}
                      </Text>
                      <Text style={styles.optionDesc}>{cond.desc}</Text>
                    </View>
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxActive,
                      ]}
                    >
                      {isSelected && <Feather name="check" size={12} color="#FFFFFF" />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => {
                  onUpdateFilter((prev) => ({ ...prev, conditions: [] }));
                }}
                style={styles.modalClearBtn}
              >
                <Text style={styles.modalClearBtnText}>Clear</Text>
              </Pressable>
              <Pressable onPress={closeModal} style={styles.modalDoneBtn}>
                <Text style={styles.modalDoneBtnText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Price Modal */}
      <Modal
        visible={activeModal === 'price'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Price Range</Text>
              <Pressable hitSlop={10} onPress={closeModal}>
                <Feather name="x" size={20} color="#15191A" />
              </Pressable>
            </View>

            {/* Quick Presets */}
            <View style={styles.pricePresetsRow}>
              {PRICE_PRESETS.map((p, idx) => {
                const isMatch =
                  filters.priceMin === p.min && filters.priceMax === p.max;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => handleSelectPricePreset(p.min, p.max)}
                    style={[
                      styles.pricePresetChip,
                      isMatch && styles.pricePresetChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pricePresetText,
                        isMatch && styles.pricePresetTextActive,
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Custom Min / Max */}
            <View style={styles.priceInputsContainer}>
              <View style={styles.priceInputBox}>
                <Text style={styles.pricePrefix}>{CURRENCY_SYMBOL}</Text>
                <TextInput
                  value={customMin}
                  onChangeText={setCustomMin}
                  placeholder="Min"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  style={styles.numericInput as any}
                />
              </View>

              <Text style={{ color: '#9CA3AF', fontSize: 16 }}>–</Text>

              <View style={styles.priceInputBox}>
                <Text style={styles.pricePrefix}>{CURRENCY_SYMBOL}</Text>
                <TextInput
                  value={customMax}
                  onChangeText={setCustomMax}
                  placeholder="Max"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  style={styles.numericInput as any}
                />
              </View>
            </View>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => {
                  setCustomMin('');
                  setCustomMax('');
                  handleSelectPricePreset(null, null);
                }}
                style={styles.modalClearBtn}
              >
                <Text style={styles.modalClearBtnText}>Reset</Text>
              </Pressable>
              <Pressable onPress={handleApplyCustomPrice} style={styles.modalDoneBtn}>
                <Text style={styles.modalDoneBtnText}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Color Modal */}
      <Modal
        visible={activeModal === 'color'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Color</Text>
              <Pressable hitSlop={10} onPress={closeModal}>
                <Feather name="x" size={20} color="#15191A" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              <Pressable
                onPress={() => handleSelectColor('')}
                style={[
                  styles.optionRow,
                  !filters.color && styles.optionRowSelected,
                ]}
              >
                <Text style={[styles.optionText, !filters.color && styles.optionTextSelected]}>
                  All colors
                </Text>
                {!filters.color && <Feather name="check" size={16} color="#007782" />}
              </Pressable>

              {COLORS.map((col) => {
                const isSelected = filters.color === col.name;
                return (
                  <Pressable
                    key={col.name}
                    onPress={() => handleSelectColor(col.name)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: col.hex,
                          borderWidth: col.border ? 1 : 0,
                          borderColor: col.border || 'transparent',
                        }}
                      />
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {col.name}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check" size={16} color="#007782" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Material Modal */}
      <Modal
        visible={activeModal === 'material'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Material</Text>
              <Pressable hitSlop={10} onPress={closeModal}>
                <Feather name="x" size={20} color="#15191A" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              <Pressable
                onPress={() => handleSelectMaterial('')}
                style={[
                  styles.optionRow,
                  !filters.material && styles.optionRowSelected,
                ]}
              >
                <Text style={[styles.optionText, !filters.material && styles.optionTextSelected]}>
                  All materials
                </Text>
                {!filters.material && <Feather name="check" size={16} color="#007782" />}
              </Pressable>

              {MATERIALS.map((mat) => {
                const isSelected = filters.material === mat;
                return (
                  <Pressable
                    key={mat}
                    onPress={() => handleSelectMaterial(mat)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {mat}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color="#007782" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sort Modal */}
      <Modal
        visible={activeModal === 'sort'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sort by</Text>
              <Pressable hitSlop={10} onPress={closeModal}>
                <Feather name="x" size={20} color="#15191A" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              {SORT_OPTIONS.map((opt) => {
                const isSelected =
                  opt.id === 'relevance'
                    ? filters.sort === null || filters.sort === 'popular'
                    : filters.sort === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => handleSelectSort(opt.id)}
                    style={[
                      styles.optionRowWithDesc,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.optionDesc}>{opt.desc}</Text>
                    </View>
                    {isSelected && <Feather name="check" size={16} color="#007782" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Info Tooltip Dialog */}
      <Modal
        visible={activeModal === 'info'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={[styles.modalCard, { padding: 22 }]} onPress={(e) => e.stopPropagation()}>
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: '#E6F7F8',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <Feather name="info" size={22} color="#007782" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#15191A' }}>
                How search results work
              </Text>
            </View>

            <Text style={{ fontSize: 14, lineHeight: 20, color: '#5A6566', marginBottom: 16 }}>
              Results are ranked to show the most relevant items first, based on match accuracy with
              listing titles, brands, categories, descriptions, and tags.
            </Text>

            <Text style={{ fontSize: 14, lineHeight: 20, color: '#5A6566', marginBottom: 20 }}>
              Use the chips above to refine your search by size, brand, price range, and condition.
            </Text>

            <Pressable onPress={closeModal} style={styles.infoGotItBtn}>
              <Text style={styles.infoGotItBtnText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

// ── Styles (Vinted exact parity) ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: 4,
  },
  chipsScrollView: {
    maxHeight: 46,
  },
  chipsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#E6F7F8',
    borderColor: '#007782',
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 13.5,
    fontFamily: typography.family.sansMedium,
    letterSpacing: -0.1,
  },
  chipTextInactive: {
    color: '#15191A',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#007782',
    fontWeight: '700',
  },
  badge: {
    marginLeft: 5,
    backgroundColor: '#007782',
    borderRadius: 10,
    width: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  resultsCountText: {
    fontSize: 13.5,
    fontFamily: typography.family.sansMedium,
    fontWeight: '500',
    color: '#5A6566',
    letterSpacing: -0.1,
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoButtonText: {
    fontSize: 13.5,
    fontFamily: typography.family.sansMedium,
    fontWeight: '500',
    color: '#5A6566',
    letterSpacing: -0.1,
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.xl,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#15191A',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radii.md,
  },
  optionRowSelected: {
    backgroundColor: '#F0FDF4',
  },
  optionText: {
    fontSize: 15,
    color: '#15191A',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#007782',
    fontWeight: '700',
  },
  optionRowWithDesc: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.md,
  },
  optionDesc: {
    fontSize: 12.5,
    color: '#6B7280',
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkboxActive: {
    backgroundColor: '#007782',
    borderColor: '#007782',
  },
  wrapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 10,
  },
  sizeChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
  },
  sizeChipInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  sizeChipActive: {
    backgroundColor: '#E6F7F8',
    borderColor: '#007782',
    borderWidth: 1.5,
  },
  sizeChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sizeChipTextInactive: {
    color: '#15191A',
  },
  sizeChipTextActive: {
    color: '#007782',
  },
  modalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  modalClearBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalClearBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  modalDoneBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: '#007782',
    alignItems: 'center',
  },
  modalDoneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  brandInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  brandTextInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F9FAFB',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#15191A',
  },
  brandApplyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: '#007782',
  },
  brandApplyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  pricePresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  pricePresetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: '#F3F4F6',
  },
  pricePresetChipActive: {
    backgroundColor: '#E6F7F8',
    borderWidth: 1,
    borderColor: '#007782',
  },
  pricePresetText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#15191A',
  },
  pricePresetTextActive: {
    color: '#007782',
    fontWeight: '700',
  },
  priceInputsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginVertical: 10,
  },
  priceInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    backgroundColor: '#F9FAFB',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
  },
  pricePrefix: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 4,
  },
  numericInput: {
    flex: 1,
    fontSize: 14,
    color: '#15191A',
    padding: 0,
  },
  infoGotItBtn: {
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: '#007782',
    alignItems: 'center',
  },
  infoGotItBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
