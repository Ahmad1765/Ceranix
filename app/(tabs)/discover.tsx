import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { colors, radii, shadow, type as typography } from '@/lib/theme';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { EmptyState } from '@/components/ui';
import {
  TAXONOMY_CATEGORIES,
  getBrandsForCategory,
  type TaxonomyCategory,
  type TaxonomySubcategory,
  type TaxonomyBrand,
} from '@/lib/taxonomy';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

type BrowseMode = 'categories' | 'brands';

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  // Mode: 'categories' or 'brands'
  const [mode, setMode] = useState<BrowseMode>('categories');

  // Drilldown selection for Categories mode (Level 1 -> Level 2)
  const [selectedCategory, setSelectedCategory] = useState<TaxonomyCategory | null>(null);

  // Selected category in Brands mode (defaults to first category: Women's Clothing)
  const [brandCategoryCode, setBrandCategoryCode] = useState<string>('CAT-01');

  // Search input
  const [searchQuery, setSearchQuery] = useState('');

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectCategory = useCallback((cat: TaxonomyCategory) => {
    haptic();
    setSelectedCategory(cat);
    setSearchQuery('');
  }, []);

  const handleBackToCategories = useCallback(() => {
    haptic();
    setSelectedCategory(null);
    setSearchQuery('');
  }, []);

  const handleSeeAllCategory = useCallback((cat: TaxonomyCategory) => {
    haptic();
    router.push({
      pathname: '/',
      params: {
        category: cat.rootCategory,
        chipLabel: cat.name,
      },
    } as any);
  }, []);

  const handleSelectSubcategory = useCallback((cat: TaxonomyCategory, sub: TaxonomySubcategory) => {
    haptic();
    router.push({
      pathname: '/',
      params: {
        category: cat.rootCategory,
        sub: sub.id,
        q: sub.label,
        chipLabel: sub.label,
      },
    } as any);
  }, []);

  const handleSelectBrand = useCallback((brandName: string, cat?: TaxonomyCategory | null) => {
    haptic();
    router.push({
      pathname: '/',
      params: {
        category: cat ? cat.rootCategory : undefined,
        q: brandName,
        chipLabel: brandName,
      },
    } as any);
  }, []);

  // ── Filtered Categories (Level 1) ─────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return TAXONOMY_CATEGORIES;
    return TAXONOMY_CATEGORIES.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.subcategories.some((sub) => sub.label.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  // ── Filtered Subcategories (Level 2) ──────────────────────────────────────
  const filteredSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return selectedCategory.subcategories;
    return selectedCategory.subcategories.filter((sub) =>
      sub.label.toLowerCase().includes(q),
    );
  }, [selectedCategory, searchQuery]);

  // ── Relevant Brands for Selected Category ─────────────────────────────────
  const activeBrandCategory = useMemo(() => {
    return TAXONOMY_CATEGORIES.find((c) => c.code === brandCategoryCode) ?? TAXONOMY_CATEGORIES[0];
  }, [brandCategoryCode]);

  const categoryBrands = useMemo(() => {
    const brands = getBrandsForCategory(brandCategoryCode);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brandCategoryCode, searchQuery]);

  // Quick brands preview inside Category Level 2
  const level2CategoryBrands = useMemo(() => {
    if (!selectedCategory) return [];
    return getBrandsForCategory(selectedCategory.code).slice(0, 10);
  }, [selectedCategory]);

  const tabClear = insets.bottom + 80;

  return (
    <SafeContainer edges={['top', 'left', 'right']} backgroundColor={theme.background} style={{ flex: 1 }}>
      {/* ── Main Header ── */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.hairline,
          backgroundColor: theme.background,
        }}
      >
        {selectedCategory && mode === 'categories' ? (
          // Level 2 Header with Back Button
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, marginBottom: 8 }}>
            <Pressable
              onPress={handleBackToCategories}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? theme.surface : 'transparent',
                marginRight: 8,
              })}
            >
              <Feather name="chevron-left" size={24} color={theme.ink} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 18,
                  color: theme.ink,
                  letterSpacing: -0.2,
                }}
                numberOfLines={1}
              >
                {selectedCategory.name}
              </Text>
            </View>
          </View>
        ) : (
          // Top Level Title & Mode Switcher
          <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 22,
                  color: theme.ink,
                  letterSpacing: -0.3,
                }}
              >
                Explore
              </Text>

              {/* Mode Switcher: Categories vs Brands */}
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: theme.surface,
                  borderRadius: 16,
                  padding: 3,
                  borderWidth: 1,
                  borderColor: theme.hairline,
                }}
              >
                <Pressable
                  onPress={() => {
                    haptic();
                    setMode('categories');
                    setSelectedCategory(null);
                    setSearchQuery('');
                  }}
                  style={({ pressed }) => ({
                    height: 28,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: mode === 'categories' ? (isDark ? theme.panel : '#111111') : 'transparent',
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: mode === 'categories' ? typography.family.sansBold : typography.family.sansMedium,
                      fontSize: 12.5,
                      color: mode === 'categories' ? '#FFFFFF' : theme.ink,
                    }}
                  >
                    Categories
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    haptic();
                    setMode('brands');
                    setSelectedCategory(null);
                    setSearchQuery('');
                  }}
                  style={({ pressed }) => ({
                    height: 28,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: mode === 'brands' ? (isDark ? theme.panel : '#111111') : 'transparent',
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: mode === 'brands' ? typography.family.sansBold : typography.family.sansMedium,
                      fontSize: 12.5,
                      color: mode === 'brands' ? '#FFFFFF' : theme.ink,
                    }}
                  >
                    Brands
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Search Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.surface,
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: theme.hairline,
            paddingHorizontal: 12,
            height: 40,
            gap: 8,
          }}
        >
          <Feather name="search" size={16} color={theme.muteSoft} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={
              mode === 'categories'
                ? selectedCategory
                  ? `Search in ${selectedCategory.name}...`
                  : 'Search categories & items...'
                : `Search brands in ${activeBrandCategory.name}...`
            }
            placeholderTextColor={theme.muteSoft}
            style={{
              flex: 1,
              fontFamily: typography.family.sans,
              fontSize: 14,
              color: theme.ink,
              paddingVertical: 0,
            }}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Feather name="x-circle" size={16} color={theme.muteSoft} />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Content ── */}
      {mode === 'categories' && !selectedCategory ? (
        // ── LEVEL 1: CATEGORIES LIST ──
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabClear }}
        >
          {filteredCategories.map((cat) => (
            <Pressable
              key={cat.code}
              onPress={() => handleSelectCategory(cat)}
              accessibilityRole="button"
              accessibilityLabel={cat.name}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                paddingHorizontal: 16,
                backgroundColor: pressed ? theme.surface : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: theme.hairline,
                gap: 14,
              })}
            >
              {/* Category Icon Container */}
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: isDark ? theme.surface : '#F2F3FE',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={cat.icon} size={20} color={colors.primary} />
              </View>

              {/* Label & Subtitle */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: typography.family.sansBold,
                    fontSize: 15.5,
                    color: theme.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {cat.name}
                </Text>
                <Text
                  style={{
                    fontFamily: typography.family.sans,
                    fontSize: 12.5,
                    color: theme.muteSoft,
                    marginTop: 2,
                  }}
                >
                  {cat.subcategories.length} sub-categories
                </Text>
              </View>

              <Feather name="chevron-right" size={18} color={theme.muteSoft} />
            </Pressable>
          ))}

          {filteredCategories.length === 0 && (
            <View style={{ paddingVertical: 48 }}>
              <EmptyState
                icon="search"
                title="No categories found"
                description={`We couldn't find any category matching "${searchQuery}".`}
              />
            </View>
          )}
        </ScrollView>
      ) : mode === 'categories' && selectedCategory ? (
        // ── LEVEL 2: SUBCATEGORIES DRILL-DOWN ──
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabClear }}
        >
          {/* Top Action: See all in this category */}
          <Pressable
            onPress={() => handleSeeAllCategory(selectedCategory)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 16,
              backgroundColor: pressed ? theme.surface : theme.panel,
              borderBottomWidth: 1,
              borderBottomColor: theme.hairline,
              gap: 12,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="grid" size={17} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 15,
                  color: colors.primary,
                }}
              >
                See all in {selectedCategory.name}
              </Text>
              <Text
                style={{
                  fontFamily: typography.family.sans,
                  fontSize: 12,
                  color: theme.muteSoft,
                }}
              >
                Browse all active items in this category
              </Text>
            </View>
            <Feather name="arrow-right" size={16} color={colors.primary} />
          </Pressable>

          {/* Subcategories Header */}
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 12.5,
                color: theme.muteSoft,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Sub-categories
            </Text>
          </View>

          {/* Subcategories List */}
          {filteredSubcategories.map((sub) => (
            <Pressable
              key={sub.id}
              onPress={() => handleSelectSubcategory(selectedCategory, sub)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 13,
                paddingHorizontal: 16,
                backgroundColor: pressed ? theme.surface : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: theme.hairline,
              })}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: typography.family.sansMedium,
                  fontSize: 15,
                  color: theme.ink,
                }}
              >
                {sub.label}
              </Text>
              <Feather name="chevron-right" size={16} color={theme.muteSoft} />
            </Pressable>
          ))}

          {filteredSubcategories.length === 0 && (
            <View style={{ paddingVertical: 32 }}>
              <EmptyState
                icon="search"
                title="No sub-categories found"
                description={`No sub-categories match "${searchQuery}".`}
              />
            </View>
          )}

          {/* Popular Brands Preview in this Category */}
          {level2CategoryBrands.length > 0 && (
            <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text
                  style={{
                    fontFamily: typography.family.sansBold,
                    fontSize: 12.5,
                    color: theme.muteSoft,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Popular Brands in {selectedCategory.name}
                </Text>
                <Pressable
                  onPress={() => {
                    haptic();
                    setBrandCategoryCode(selectedCategory.code);
                    setMode('brands');
                    setSelectedCategory(null);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontFamily: typography.family.sansBold, fontSize: 12.5, color: colors.primary }}>
                    View all
                  </Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {level2CategoryBrands.map((brand) => (
                  <Pressable
                    key={brand.name}
                    onPress={() => handleSelectBrand(brand.name, selectedCategory)}
                    style={({ pressed }) => ({
                      height: 30,
                      paddingHorizontal: 12,
                      borderRadius: 15,
                      backgroundColor: pressed ? theme.surface : theme.panel,
                      borderWidth: 1,
                      borderColor: theme.hairline,
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <Text style={{ fontFamily: typography.family.sansMedium, fontSize: 12.5, color: theme.ink }}>
                      {brand.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        // ── BRANDS MODE: ONLY POPULAR BRANDS RELEVANT TO SELECTED CATEGORY ──
        <View style={{ flex: 1 }}>
          {/* Horizontal Category Pill Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              gap: 8,
            }}
            style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: theme.hairline }}
          >
            {TAXONOMY_CATEGORIES.map((cat) => {
              const active = brandCategoryCode === cat.code;
              return (
                <Pressable
                  key={cat.code}
                  onPress={() => {
                    haptic();
                    setBrandCategoryCode(cat.code);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 30,
                    paddingHorizontal: 12,
                    borderRadius: 15,
                    backgroundColor: active
                      ? isDark ? theme.panel : '#111111'
                      : isDark ? theme.surface : theme.panel,
                    borderWidth: 1,
                    borderColor: active
                      ? isDark ? theme.border : '#111111'
                      : theme.hairline,
                    gap: 6,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Feather
                    name={cat.icon}
                    size={12}
                    color={active ? '#FFFFFF' : theme.ink}
                  />
                  <Text
                    style={{
                      fontFamily: active ? typography.family.sansBold : typography.family.sansMedium,
                      fontSize: 12,
                      color: active ? '#FFFFFF' : theme.ink,
                    }}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Brand List for the Selected Category */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: tabClear }}
          >
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 12.5,
                  color: theme.muteSoft,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Popular {activeBrandCategory.name} Brands ({categoryBrands.length})
              </Text>
            </View>

            {categoryBrands.map((brand) => (
              <Pressable
                key={brand.name}
                onPress={() => handleSelectBrand(brand.name, activeBrandCategory)}
                accessibilityRole="button"
                accessibilityLabel={brand.name}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 13,
                  paddingHorizontal: 16,
                  backgroundColor: pressed ? theme.surface : 'transparent',
                  borderBottomWidth: 1,
                  borderBottomColor: theme.hairline,
                  gap: 12,
                })}
              >
                {/* Brand Initial Badge */}
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isDark ? theme.surface : '#F2F3FE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: typography.family.sansBold,
                      fontSize: 14,
                      color: colors.primary,
                    }}
                  >
                    {brand.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Brand Details */}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: typography.family.sansBold,
                      fontSize: 15,
                      color: theme.ink,
                      letterSpacing: -0.1,
                    }}
                  >
                    {brand.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: typography.family.sans,
                      fontSize: 12,
                      color: theme.muteSoft,
                      marginTop: 1,
                    }}
                    numberOfLines={1}
                  >
                    {brand.categoryRelevance || brand.tier}
                  </Text>
                </View>

                <Feather name="chevron-right" size={16} color={theme.muteSoft} />
              </Pressable>
            ))}

            {categoryBrands.length === 0 && (
              <View style={{ paddingVertical: 48 }}>
                <EmptyState
                  icon="search"
                  title="No brands found"
                  description={`No brands in ${activeBrandCategory.name} match "${searchQuery}".`}
                />
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </SafeContainer>
  );
}
