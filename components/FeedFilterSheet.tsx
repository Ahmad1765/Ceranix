import { useEffect, useState } from 'react';
import { View, Pressable, Modal, ScrollView } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii, type } from '@/lib/theme';
import { conditionLabel } from '@/components/product/shared';
import type { Category, Condition } from '@/types';

// ── Filter model ─────────────────────────────────────────────────────────────
export type FeedSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popular';

export interface FeedFilters {
  category: Category | null;
  conditions: Condition[];
  priceMin: number | null;
  priceMax: number | null;
  sort: FeedSort;
}

export const EMPTY_FEED_FILTERS: FeedFilters = {
  category: null,
  conditions: [],
  priceMin: null,
  priceMax: null,
  sort: 'relevance',
};

// Number of distinct constraints the user has applied — drives the red badge.
export function countActiveFilters(f: FeedFilters): number {
  let n = 0;
  if (f.category) n += 1;
  n += f.conditions.length;
  if (f.priceMin != null || f.priceMax != null) n += 1;
  if (f.sort !== 'relevance') n += 1;
  return n;
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

const CONDITIONS: Condition[] = ['new_with_tags', 'like_new', 'good', 'fair'];

const SORTS: { id: FeedSort; label: string }[] = [
  { id: 'relevance', label: 'Recommended' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'popular', label: 'Most liked' },
];

interface Props {
  visible: boolean;
  initial: FeedFilters;
  onApply: (filters: FeedFilters) => void;
  onClose: () => void;
}

const DISPLAY_BOLD = type.family.sansBold;

export function FeedFilterSheet({ visible, initial, onApply, onClose }: Props) {
  const [category, setCategory] = useState<Category | null>(initial.category);
  const [conditions, setConditions] = useState<Condition[]>(initial.conditions);
  const [priceMin, setPriceMin] = useState<string>(initial.priceMin?.toString() ?? '');
  const [priceMax, setPriceMax] = useState<string>(initial.priceMax?.toString() ?? '');
  const [sort, setSort] = useState<FeedSort>(initial.sort);

  // Re-seed local state from the applied filters each time the sheet opens so a
  // cancelled edit never leaks into the next open.
  useEffect(() => {
    if (!visible) return;
    setCategory(initial.category);
    setConditions(initial.conditions);
    setPriceMin(initial.priceMin?.toString() ?? '');
    setPriceMax(initial.priceMax?.toString() ?? '');
    setSort(initial.sort);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCondition = (c: Condition) =>
    setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const reset = () => {
    setCategory(null);
    setConditions([]);
    setPriceMin('');
    setPriceMax('');
    setSort('relevance');
  };

  const apply = () => {
    const min = priceMin.trim() ? Math.max(0, parseInt(priceMin, 10) || 0) : null;
    const max = priceMax.trim() ? Math.max(0, parseInt(priceMax, 10) || 0) : null;
    onApply({ category, conditions, priceMin: min, priceMax: max, sort });
    onClose();
  };

  const draft: FeedFilters = {
    category,
    conditions,
    priceMin: priceMin.trim() ? parseInt(priceMin, 10) || 0 : null,
    priceMax: priceMax.trim() ? parseInt(priceMax, 10) || 0 : null,
    sort,
  };
  const count = countActiveFilters(draft);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.white,
            borderTopLeftRadius: radii['3xl'],
            borderTopRightRadius: radii['3xl'],
            paddingTop: 12,
            maxHeight: '86%',
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.hairline,
              marginBottom: 14,
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              marginBottom: 6,
            }}
          >
            <Text style={{ fontFamily: DISPLAY_BOLD, fontSize: 20, color: colors.ink, letterSpacing: -0.3 }}>
              Filters
            </Text>
            {count > 0 ? (
              <Pressable hitSlop={8} onPress={reset} accessibilityRole="button">
                <Text style={{ fontSize: 13.5, fontFamily: DISPLAY_BOLD, color: colors.purple }}>
                  Reset
                </Text>
              </Pressable>
            ) : (
              <Pressable hitSlop={8} onPress={onClose} accessibilityRole="button">
                <Feather name="x" size={20} color={colors.muteSoft} />
              </Pressable>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          >
            {/* Category */}
            <SectionLabel>Category</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map((c) => {
                const on = category === c.id;
                return (
                  <FilterChip
                    key={c.id}
                    label={c.label}
                    active={on}
                    onPress={() => setCategory(on ? null : c.id)}
                  />
                );
              })}
            </View>

            {/* Condition */}
            <SectionLabel>Condition</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CONDITIONS.map((c) => (
                <FilterChip
                  key={c}
                  label={conditionLabel(c)}
                  active={conditions.includes(c)}
                  onPress={() => toggleCondition(c)}
                />
              ))}
            </View>

            {/* Price */}
            <SectionLabel>Price (Rs)</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PriceInput value={priceMin} onChangeText={setPriceMin} placeholder="Min" />
              <View style={{ width: 14, height: 1.5, borderRadius: 1, backgroundColor: colors.hairline }} />
              <PriceInput value={priceMax} onChangeText={setPriceMax} placeholder="Max" />
            </View>

            {/* Sort */}
            <SectionLabel>Sort by</SectionLabel>
            <View style={{ gap: 8 }}>
              {SORTS.map((s) => {
                const on = sort === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setSort(s.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: on ? colors.purple : colors.hairline,
                      backgroundColor: on ? colors.purpleSoft : colors.white,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: on ? DISPLAY_BOLD : type.family.sansMedium,
                        color: colors.ink,
                      }}
                    >
                      {s.label}
                    </Text>
                    {on ? <Feather name="check" size={17} color={colors.purple} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Apply CTA */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: colors.hairline,
            }}
          >
            <Pressable
              onPress={apply}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingVertical: 15,
                borderRadius: radii.pill,
                backgroundColor: colors.ink,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 14.5, fontFamily: DISPLAY_BOLD, color: colors.white, letterSpacing: -0.1 }}>
                {count > 0 ? `Apply ${count} ${count === 1 ? 'filter' : 'filters'}` : 'Show all items'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11.5,
        fontFamily: DISPLAY_BOLD,
        color: colors.mute,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        marginTop: 22,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        paddingHorizontal: 15,
        paddingVertical: 9,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: active ? colors.purple : colors.hairline,
        backgroundColor: active ? colors.purpleSoft : colors.white,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Text
        style={{
          fontSize: 13,
          fontFamily: active ? DISPLAY_BOLD : type.family.sansMedium,
          color: active ? colors.purple : colors.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PriceInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.panel,
        borderRadius: radii.md,
        paddingHorizontal: 14,
        height: 48,
      }}
    >
      <Text style={{ fontSize: 14, color: colors.muteSoft, marginRight: 6 }}>Rs</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, ''))}
        placeholder={placeholder}
        placeholderTextColor={colors.muteSoft}
        keyboardType="number-pad"
        style={
          {
            flex: 1,
            fontSize: 14.5,
            color: colors.ink,
            padding: 0,
            outlineStyle: 'none',
            outlineWidth: 0,
          } as any
        }
      />
    </View>
  );
}
