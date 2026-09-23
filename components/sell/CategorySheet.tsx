import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { CATEGORIES, hasSubcategories } from '@/lib/categories';
import type { Category } from '@/types';
import { UNBRANDED_LOCAL_TAILOR } from '@/lib/taxonomy';

const DISPLAY_BOLD = typography.family.sansBold;

const CATEGORY_META: Record<
  Category,
  { title: string; subtitle: string; icon: keyof typeof Feather.glyphMap }
> = {
  clothing: {
    title: 'Clothing',
    subtitle: 'Dresses, Kurta, Tops, Jeans, Outerwear & more',
    icon: 'shopping-bag',
  },
  shoes: {
    title: 'Shoes',
    subtitle: 'Sneakers, Khussas, Heels, Boots, Flats',
    icon: 'package',
  },
  bags: {
    title: 'Bags',
    subtitle: 'Handbags, Backpacks, Totes, Wallets, Clutches',
    icon: 'briefcase',
  },
  accessories: {
    title: 'Accessories',
    subtitle: 'Watches, Jewelry, Sunglasses, Belts, Scarves',
    icon: 'watch',
  },
  beauty: {
    title: 'Beauty',
    subtitle: 'Makeup, Skincare, Fragrance, Haircare, Nails',
    icon: 'droplet',
  },
  other: {
    title: 'Other',
    subtitle: 'Items not matching the categories above',
    icon: 'box',
  },
};

export function CategorySheet({
  visible,
  category,
  subcategory,
  selectedBrand,
  onChange,
  onClose,
}: {
  visible: boolean;
  category: Category;
  subcategory: string | null;
  selectedBrand?: string | null;
  onChange: (category: Category, subcategory: string | null) => void;
  onClose: () => void;
}) {
  const { theme, isDark } = useTheme();

  // Active Category drill-down (null = Level 1 Main Categories, Category = Level 2 Sub-categories)
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState('');
  const closedByPopStateRef = useRef(false);

  const activeCategoryRef = useRef<Category | null>(null);
  activeCategoryRef.current = activeCategory;
  const queryRef = useRef('');
  queryRef.current = query;

  // Reset drill-down state on open
  useEffect(() => {
    if (visible) {
      setActiveCategory(null);
      setQuery('');
    }
  }, [visible]);

  const haptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handleBack = useCallback(() => {
    haptic();
    if (queryRef.current.trim().length > 0) {
      setQuery('');
      return;
    }
    if (activeCategoryRef.current !== null) {
      setActiveCategory(null);
      return;
    }
    onClose();
  }, [onClose]);

  // Hardware back button on Android
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleBack]);

  // Escape key & history sync on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    closedByPopStateRef.current = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const stateId = `sell_category_${Date.now()}`;
    try {
      window.history.pushState({ sellCategory: stateId }, '', window.location.href);
    } catch {}

    const handlePopState = () => {
      closedByPopStateRef.current = true;
      if (activeCategoryRef.current !== null) {
        setActiveCategory(null);
      } else {
        onClose();
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (!closedByPopStateRef.current && window.history.state?.sellCategory === stateId) {
        window.history.back();
      }
    };
  }, [visible, handleBack, onClose]);

  // Search Results across all categories & subcategories
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const results: {
      category: Category;
      categoryTitle: string;
      categoryIcon: keyof typeof Feather.glyphMap;
      subId: string | null;
      subLabel: string;
    }[] = [];

    for (const catDef of CATEGORIES) {
      const catMeta = CATEGORY_META[catDef.id] || {
        title: catDef.label,
        subtitle: '',
        icon: catDef.icon,
      };

      // Check subcategories
      for (const sub of catDef.subs) {
        const matchesLabel = sub.label.toLowerCase().includes(q);
        const matchesKw = sub.kw?.some((k) => k.toLowerCase().includes(q));
        if (matchesLabel || matchesKw) {
          results.push({
            category: catDef.id,
            categoryTitle: catMeta.title,
            categoryIcon: catMeta.icon,
            subId: sub.id,
            subLabel: sub.label,
          });
        }
      }

      // If category title itself matches and has no subcategories
      if (catDef.label.toLowerCase().includes(q) && catDef.subs.length === 0) {
        results.push({
          category: catDef.id,
          categoryTitle: catMeta.title,
          categoryIcon: catMeta.icon,
          subId: null,
          subLabel: catMeta.title,
        });
      }
    }

    return results;
  }, [query]);

  const activeCategoryDef = useMemo(() => {
    if (!activeCategory) return null;
    return CATEGORIES.find((c) => c.id === activeCategory) ?? null;
  }, [activeCategory]);

  const activeCategoryMeta = activeCategory ? CATEGORY_META[activeCategory] : null;

  const handleSelectLevel1 = (catId: Category) => {
    haptic();
    if (!hasSubcategories(catId)) {
      onChange(catId, null);
      onClose();
      return;
    }
    setActiveCategory(catId);
    setQuery('');
  };

  const handleSelectLevel2 = (catId: Category, subId: string) => {
    haptic();
    onChange(catId, subId);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={handleBack}
    >
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{
          flex: 1,
          backgroundColor: theme.background,
        }}
      >
        {/* Navigation Header */}
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
          {/* Back Button */}
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={activeCategory !== null ? 'Back to categories' : 'Close'}
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
            <Feather
              name={activeCategory !== null ? 'arrow-left' : 'x'}
              size={22}
              color={theme.ink}
            />
          </Pressable>

          {/* Centered Title */}
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
              {activeCategory !== null
                ? activeCategoryMeta?.title ?? 'Category'
                : 'Select Category'}
            </Text>
            {activeCategory !== null ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  color: theme.mute,
                  marginTop: 1,
                  textAlign: 'center',
                }}
              >
                Choose sub-category
              </Text>
            ) : null}
          </View>

          {/* Empty Right Spacer */}
          <View style={{ width: 40 }} />
        </View>

        {/* Selected Brand Context Advisory (if user already chose a brand) */}
        {selectedBrand && selectedBrand !== UNBRANDED_LOCAL_TAILOR && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: theme.background,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <Feather name="info" size={14} color={theme.ink} />
            <Text style={{ fontSize: 13, color: theme.ink, flex: 1 }}>
              Selecting category for{' '}
              <Text style={{ fontFamily: DISPLAY_BOLD }}>{selectedBrand}</Text>
            </Text>
          </View>
        )}

        {/* Search Input Bar */}
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
                activeCategory !== null
                  ? `Search in ${activeCategoryMeta?.title}…`
                  : 'Search category…'
              }
              placeholderTextColor={theme.muteSoft ?? theme.mute}
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

        {/* Content Views: Search Results OR Level 2 OR Level 1 */}
        {searchResults !== null ? (
          // ── SEARCH RESULTS ──
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          >
            <View style={{ paddingVertical: 10 }}>
              <Text
                style={{
                  fontFamily: DISPLAY_BOLD,
                  fontSize: 12,
                  color: theme.muteSoft,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Results ({searchResults.length})
              </Text>
            </View>

            {searchResults.map((res, index) => {
              const isSelected =
                category === res.category &&
                (res.subId === null ? subcategory === null : subcategory === res.subId);
              return (
                <Pressable
                  key={`${res.category}-${res.subId ?? 'root'}-${index}`}
                  onPress={() => {
                    if (res.subId) {
                      handleSelectLevel2(res.category, res.subId);
                    } else {
                      handleSelectLevel1(res.category);
                    }
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                    backgroundColor: pressed ? theme.surface : 'transparent',
                    gap: 12,
                  })}
                >
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
                    <Feather name={res.categoryIcon} size={17} color={colors.primary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: DISPLAY_BOLD,
                        fontSize: 15,
                        color: theme.ink,
                      }}
                    >
                      {res.subLabel}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: theme.mute,
                        marginTop: 1,
                      }}
                    >
                      {res.categoryTitle}
                    </Text>
                  </View>

                  {isSelected ? (
                    <Feather name="check" size={18} color={colors.primary} />
                  ) : (
                    <Feather name="chevron-right" size={18} color={theme.muteSoft} />
                  )}
                </Pressable>
              );
            })}

            {searchResults.length === 0 && (
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
                  No categories found
                </Text>
                <Text style={{ fontSize: 13, color: theme.mute, marginTop: 4 }}>
                  No match for &quot;{query}&quot;. Try another search term.
                </Text>
              </View>
            )}
          </ScrollView>
        ) : activeCategoryDef !== null ? (
          // ── LEVEL 2: SUBCATEGORIES OF SELECTED CATEGORY (Vinted Style) ──
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          >
            {activeCategoryDef.subs.map((s) => {
              const isSelected = category === activeCategory && subcategory === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => handleSelectLevel2(activeCategoryDef.id, s.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 15,
                    paddingHorizontal: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                    backgroundColor: pressed ? theme.surface : 'transparent',
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  <Text
                    style={{
                      fontSize: 15.5,
                      fontFamily: isSelected ? DISPLAY_BOLD : typography.family.sansMedium,
                      color: isSelected ? colors.primary : theme.ink,
                    }}
                  >
                    {s.label}
                  </Text>

                  {isSelected && (
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: isDark ? theme.surface : '#F2F3FE',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="check" size={15} color={colors.primary} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          // ── LEVEL 1: MAIN CATEGORIES (Dedicated Page, Vinted Style) ──
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          >
            {CATEGORIES.map((c) => {
              const meta = CATEGORY_META[c.id] || {
                title: c.label,
                subtitle: '',
                icon: c.icon,
              };
              const isCurrent = category === c.id;

              return (
                <Pressable
                  key={c.id}
                  onPress={() => handleSelectLevel1(c.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                    backgroundColor: pressed ? theme.surface : 'transparent',
                    gap: 14,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  {/* Icon Circle */}
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: isDark ? theme.surface : '#F2F3FE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather
                      name={meta.icon}
                      size={20}
                      color={isCurrent ? colors.primary : theme.ink}
                    />
                  </View>

                  {/* Title & Subtitle Preview */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: DISPLAY_BOLD,
                        fontSize: 16,
                        color: theme.ink,
                        letterSpacing: -0.1,
                      }}
                    >
                      {meta.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12.5,
                        color: theme.muteSoft,
                        marginTop: 2,
                      }}
                    >
                      {meta.subtitle}
                    </Text>
                  </View>

                  {/* Chevron or Subcategory count */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isCurrent && (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: colors.primary,
                        }}
                      />
                    )}
                    <Feather name="chevron-right" size={18} color={theme.muteSoft} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
