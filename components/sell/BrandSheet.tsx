import { useState, useMemo } from 'react';
import { View, Pressable, ScrollView, Platform } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { BottomSheet } from './BottomSheet';
import {
  TAXONOMY_BRANDS,
  TAXONOMY_CATEGORIES,
  UNBRANDED_LOCAL_TAILOR,
  type BrandTier,
  getBrandsForCategory,
} from '@/lib/taxonomy';
import * as Haptics from 'expo-haptics';

const DISPLAY_BOLD = typography.family.sansBold;

const TIERS: (BrandTier | 'All')[] = [
  'All',
  'Local Premium',
  'Local Contemporary',
  'Local Modern Menswear',
  'Local Luxury / Couture',
  'Local Mass',
  'Gen Z / Streetwear',
  'Premium / Luxury',
  'Moderate / Mass',
  'Footwear',
  'Kids & Girls',
  'Eyewear',
];

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
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<BrandTier | 'All'>('All');

  const recommendedBrands = useMemo(() => {
    if (!categoryCode && !subcategoryId) return [];
    const taxonomyCode =
      (subcategoryId
        ? TAXONOMY_CATEGORIES.find((c) => c.subcategories.some((s) => s.id === subcategoryId))?.code
        : undefined) || (categoryCode?.startsWith('CAT-') ? categoryCode : undefined);
    if (!taxonomyCode && !subcategoryId) return [];
    return getBrandsForCategory(taxonomyCode || '', subcategoryId).slice(0, 8);
  }, [categoryCode, subcategoryId]);

  const filteredBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TAXONOMY_BRANDS.filter((b) => {
      const matchTier = selectedTier === 'All' || b.tier === selectedTier;
      const matchQuery = !q || b.name.toLowerCase().includes(q) || b.categoryRelevance.toLowerCase().includes(q);
      return matchTier && matchQuery;
    });
  }, [query, selectedTier]);

  const trimmedQuery = query.trim();
  const exactMatchExists = TAXONOMY_BRANDS.some(
    (b) => b.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );

  const handleSelect = (brandName: string, isCustom = false) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onSelectBrand(brandName, isCustom);
    setQuery('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Select Brand" onClose={onClose}>
      {/* Search Input */}
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
          marginBottom: 12,
        }}
      >
        <Feather name="search" size={16} color={theme.mute} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search 110+ brands or enter custom…"
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
              outlineWidth: 0,
            } as any
          }
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Feather name="x" size={16} color={theme.mute} />
          </Pressable>
        )}
      </View>

      {/* Tier Filter Chips (Universal 30px Standard) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 14 }}
      >
        {TIERS.map((tier) => {
          const active = selectedTier === tier;
          return (
            <Pressable
              key={tier}
              onPress={() => setSelectedTier(tier)}
              style={({ pressed }) => ({
                height: 30,
                paddingHorizontal: 14,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: active ? theme.ink : theme.border,
                backgroundColor: active ? theme.ink : theme.panel,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: active ? DISPLAY_BOLD : typography.family.sansMedium,
                  color: active ? theme.background : theme.ink,
                }}
              >
                {tier}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ maxHeight: 380 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Fast Action: Unbranded / Local Tailor */}
        <Pressable
          onPress={() => handleSelect(UNBRANDED_LOCAL_TAILOR, false)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: value === UNBRANDED_LOCAL_TAILOR ? theme.ink : theme.border,
            backgroundColor: value === UNBRANDED_LOCAL_TAILOR ? theme.surface : theme.panel,
            marginBottom: 12,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="scissors" size={14} color={theme.ink} />
              <Text style={{ fontSize: 14.5, fontFamily: DISPLAY_BOLD, color: theme.ink }}>
                {UNBRANDED_LOCAL_TAILOR}
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, color: theme.mute, marginTop: 2 }}>
              Custom stitched, tailor-made, or unbranded boutique garments
            </Text>
          </View>
          {value === UNBRANDED_LOCAL_TAILOR && <Feather name="check" size={16} color={theme.ink} />}
        </Pressable>

        {/* Recommended for this category (if applicable and not searching) */}
        {!query && recommendedBrands.length > 0 && selectedTier === 'All' && (
          <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 12,
                fontFamily: DISPLAY_BOLD,
                color: theme.mute,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Recommended for your selection
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {recommendedBrands.map((b) => (
                <Pressable
                  key={b.name}
                  onPress={() => handleSelect(b.name)}
                  style={({ pressed }) => ({
                    height: 30,
                    paddingHorizontal: 12,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: value === b.name ? theme.ink : theme.border,
                    backgroundColor: value === b.name ? theme.ink : theme.panel,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontFamily: value === b.name ? DISPLAY_BOLD : typography.family.sansMedium,
                      color: value === b.name ? theme.background : theme.ink,
                    }}
                  >
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </View>
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
              paddingVertical: 12,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              marginBottom: 10,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: DISPLAY_BOLD, color: theme.ink }}>
                Use &ldquo;{trimmedQuery}&rdquo;
              </Text>
              <Text style={{ fontSize: 11.5, color: theme.mute, marginTop: 2 }}>
                Custom brand (sets authenticity to &ldquo;Not Sure&rdquo; for buyer safety)
              </Text>
            </View>
            <Feather name="plus-circle" size={16} color={theme.ink} />
          </Pressable>
        )}

        {/* Brands Directory */}
        <View style={{ gap: 4, paddingBottom: 16 }}>
          {filteredBrands.map((brand) => {
            const isSelected = value?.toLowerCase() === brand.name.toLowerCase();
            return (
              <Pressable
                key={brand.name}
                onPress={() => handleSelect(brand.name)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  borderRadius: radii.md,
                  backgroundColor: isSelected ? (theme.primarySoft ?? 'rgba(0,0,0,0.06)') : pressed ? theme.surface : 'transparent',
                })}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontFamily: isSelected ? DISPLAY_BOLD : typography.family.sans,
                      color: theme.ink,
                    }}
                  >
                    {brand.name}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: theme.mute, marginTop: 1 }}>
                    {brand.tier} • {brand.categoryRelevance}
                  </Text>
                </View>
                {isSelected ? (
                  <Feather name="check" size={16} color={theme.ink} />
                ) : (
                  <Feather name="chevron-right" size={14} color={theme.mute} />
                )}
              </Pressable>
            );
          })}

          {filteredBrands.length === 0 && !trimmedQuery && (
            <Text style={{ fontSize: 13, color: theme.mute, textAlign: 'center', paddingVertical: 20 }}>
              No brands found in this tier.
            </Text>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
