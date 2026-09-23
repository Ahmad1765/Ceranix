import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { colors, radii, type as typography } from '@/lib/theme';
import {
  TAXONOMY_BRANDS,
  UNBRANDED_LOCAL_TAILOR,
  type BrandTier,
  getBrandsForCategory,
  getRecommendedBrandsForCategory,
} from '@/lib/taxonomy';
import { categoryLabel, subcategoryLabel } from '@/lib/categories';
import type { Category } from '@/types';

const DISPLAY_BOLD = typography.family.sansBold;

function BrandRow({
  name,
  subtitle,
  isSelected,
  onSelect,
  theme,
  isDark,
}: {
  name: string;
  subtitle?: string;
  isSelected: boolean;
  onSelect: () => void;
  theme: any;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: pressed ? theme.surface : 'transparent',
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
            fontFamily: DISPLAY_BOLD,
            fontSize: 14,
            color: colors.primary,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Brand Information */}
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text
          style={{
            fontSize: 15,
            fontFamily: isSelected ? DISPLAY_BOLD : typography.family.sansMedium,
            color: isSelected ? colors.primary : theme.ink,
          }}
        >
          {name}
        </Text>
        {Boolean(subtitle) && (
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, color: theme.muteSoft, marginTop: 1 }}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {isSelected ? (
        <Feather name="check" size={18} color={colors.primary} />
      ) : (
        <Feather name="chevron-right" size={16} color={theme.muteSoft} />
      )}
    </Pressable>
  );
}

export function BrandSheet({
  visible,
  value,
  categoryCode,
  subcategoryId,
  onSelectBrand,
  onClose,
}: {
  visible: boolean;
  value: string | null | undefined;
  categoryCode?: string;
  subcategoryId?: string | null;
  onSelectBrand: (brandName: string, isCustom?: boolean) => void;
  onClose: () => void;
}) {
  const { theme, isDark } = useTheme();
  const [query, setQuery] = useState('');
  const closedByPopStateRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setQuery('');
    }
  }, [visible]);

  const haptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handleClose = () => {
    haptic();
    onClose();
  };

  // Hardware back button on Android
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  // Escape key & history sync on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    closedByPopStateRef.current = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const stateId = `sell_brand_${Date.now()}`;
    try {
      window.history.pushState({ sellBrand: stateId }, '', window.location.href);
    } catch {}

    const handlePopState = () => {
      closedByPopStateRef.current = true;
      onClose();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (!closedByPopStateRef.current && window.history.state?.sellBrand === stateId) {
        window.history.back();
      }
    };
  }, [visible]);

  // Category context display name
  const categoryContextName = useMemo(() => {
    if (!categoryCode) return null;
    if (subcategoryId) {
      return subcategoryLabel(categoryCode as Category, subcategoryId);
    }
    return categoryLabel(categoryCode as Category);
  }, [categoryCode, subcategoryId]);

  // Brands strictly matching the selected category and/or subcategory
  const categoryBrands = useMemo(() => {
    if (!categoryCode && !subcategoryId) return TAXONOMY_BRANDS;
    return getBrandsForCategory(categoryCode || '', subcategoryId);
  }, [categoryCode, subcategoryId]);

  // Recommended popular brands strictly for this category selection
  const recommendedBrands = useMemo(() => {
    return getRecommendedBrandsForCategory(categoryCode, subcategoryId);
  }, [categoryCode, subcategoryId]);

  const filteredBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasCategoryFilter = Boolean(categoryCode || subcategoryId);

    const pool = hasCategoryFilter ? categoryBrands : TAXONOMY_BRANDS;

    return pool.filter((b) => {
      const matchQuery =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.categoryRelevance.toLowerCase().includes(q);
      return matchQuery;
    });
  }, [categoryBrands, categoryCode, subcategoryId, query]);

  const trimmedQuery = query.trim();
  const exactMatchExists = filteredBrands.some(
    (b) => b.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );

  const handleSelect = (brandName: string, isCustom = false) => {
    haptic();
    onSelectBrand(brandName, isCustom);
    setQuery('');
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={handleClose}
    >
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{
          flex: 1,
          backgroundColor: theme.background,
        }}
      >
        {/* Full Page Navigation Header */}
        <View
          style={{
            height: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          }}
        >
          {/* Back button */}
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close brand picker"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.panel : 'transparent',
              marginLeft: -6,
            })}
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </Pressable>

          {/* Title & Subtitle */}
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: DISPLAY_BOLD,
                fontSize: 17,
                color: theme.ink,
                letterSpacing: -0.2,
                textAlign: 'center',
              }}
            >
              Select Brand
            </Text>
            {categoryContextName ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  color: theme.mute,
                  marginTop: 1,
                  textAlign: 'center',
                }}
              >
                Filtered for {categoryContextName}
              </Text>
            ) : null}
          </View>

          {/* Spacer */}
          <View style={{ width: 40 }} />
        </View>

        {/* Search Input */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: radii.xl,
              backgroundColor: theme.panel,
              paddingHorizontal: 14,
              height: 44,
            }}
          >
            <Feather name="search" size={16} color={theme.mute} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={
                categoryContextName
                  ? `Search ${categoryContextName.toLowerCase()} brands…`
                  : 'Search brands…'
              }
              placeholderTextColor={theme.muteSoft ?? theme.mute}
              autoCapitalize="words"
              autoCorrect={false}
              style={
                {
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14.5,
                  color: theme.ink,
                  padding: 0,
                  outlineStyle: 'none',
                } as any
              }
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Feather name="x" size={16} color={theme.mute} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Scrollable Brands Directory */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        >
          {/* Fast Action: Unbranded / Local Tailor */}
          {!query && (
            <Pressable
              onPress={() => handleSelect(UNBRANDED_LOCAL_TAILOR, false)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor:
                  value === UNBRANDED_LOCAL_TAILOR ? colors.primary : theme.border,
                backgroundColor:
                  value === UNBRANDED_LOCAL_TAILOR
                    ? isDark
                      ? theme.surface
                      : '#F2F3FE'
                    : theme.panel,
                marginTop: 10,
                marginBottom: 14,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="scissors" size={16} color={colors.primary} />
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: DISPLAY_BOLD,
                      color: theme.ink,
                    }}
                  >
                    {UNBRANDED_LOCAL_TAILOR}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: theme.mute, marginTop: 3 }}>
                  Custom stitched, tailor-made, or unbranded boutique items
                </Text>
              </View>
              {value === UNBRANDED_LOCAL_TAILOR && (
                <Feather name="check" size={18} color={colors.primary} />
              )}
            </Pressable>
          )}

          {/* ── ONLY POPULAR BRANDS RELEVANT TO THE SELECTED CATEGORY ── */}
          {!query && recommendedBrands.length > 0 && (
            <View style={{ marginBottom: 18 }}>
              <View style={{ paddingVertical: 8 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: DISPLAY_BOLD,
                    color: theme.muteSoft,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {categoryContextName
                    ? `Popular in ${categoryContextName} (${recommendedBrands.length})`
                    : `Popular Brands (${recommendedBrands.length})`}
                </Text>
              </View>

              {/* Listed in row design like all brands are listed */}
              {recommendedBrands.map((b) => (
                <BrandRow
                  key={`popular-${b.name}`}
                  name={b.name}
                  subtitle={[b.tier, b.categoryRelevance].filter(Boolean).join(' • ')}
                  isSelected={value?.toLowerCase() === b.name.toLowerCase()}
                  onSelect={() => handleSelect(b.name)}
                  theme={theme}
                  isDark={isDark}
                />
              ))}
            </View>
          )}

          {/* Custom Brand Fallback if query typed and no exact match */}
          {trimmedQuery.length > 0 && !exactMatchExists && (
            <Pressable
              onPress={() => handleSelect(trimmedQuery, true)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: isDark ? theme.surface : '#F2F3FE',
                marginTop: 6,
                marginBottom: 14,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: DISPLAY_BOLD,
                    color: colors.primary,
                  }}
                >
                  Use &ldquo;{trimmedQuery}&rdquo;
                </Text>
                <Text style={{ fontSize: 12, color: theme.mute, marginTop: 3 }}>
                  Custom brand (authenticity badge marked as &ldquo;Not Sure&rdquo;)
                </Text>
              </View>
              <Feather name="plus-circle" size={18} color={colors.primary} />
            </Pressable>
          )}

          {/* All Filtered Brands Directory */}
          <View style={{ paddingTop: 4 }}>
            <View style={{ paddingVertical: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: DISPLAY_BOLD,
                  color: theme.muteSoft,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {query
                  ? `Matching Brands (${filteredBrands.length})`
                  : categoryContextName
                  ? `All ${categoryContextName} Brands (${filteredBrands.length})`
                  : `All Brands (${filteredBrands.length})`}
              </Text>
            </View>

            {filteredBrands.map((brand) => (
              <BrandRow
                key={brand.name}
                name={brand.name}
                subtitle={[brand.tier, brand.categoryRelevance].filter(Boolean).join(' • ')}
                isSelected={value?.toLowerCase() === brand.name.toLowerCase()}
                onSelect={() => handleSelect(brand.name)}
                theme={theme}
                isDark={isDark}
              />
            ))}

            {filteredBrands.length === 0 && (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Feather name="search" size={32} color={theme.muteSoft} />
                <Text
                  style={{
                    fontFamily: DISPLAY_BOLD,
                    fontSize: 15,
                    color: theme.ink,
                    marginTop: 12,
                  }}
                >
                  No brands found
                </Text>
                <Text style={{ fontSize: 13, color: theme.mute, marginTop: 4 }}>
                  {trimmedQuery
                    ? `Tap "+ Use \"${trimmedQuery}\"" above to add as custom brand.`
                    : 'No brands match the selected filter.'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
