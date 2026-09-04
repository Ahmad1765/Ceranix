import { useEffect, useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { CATEGORIES, hasSubcategories } from '@/lib/categories';
import { ITEM_COLORS } from '@/lib/itemColors';
import { ColorSwatch } from '@/components/ColorSwatch';
import { CURRENCY_SYMBOL, CURRENCY_CODE } from '@/lib/currency';
import type { Category } from '@/types';
import { BottomSheet } from './BottomSheet';
import * as Haptics from 'expo-haptics';

const DISPLAY_BOLD = type.family.sansBold;

function SaveButton({ onPress, label = 'Save' }: { onPress: () => void; label?: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 28,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        backgroundColor: theme.surface,
      }}
    >
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          onPress();
        }}
        accessibilityRole="button"
        style={({ pressed }) => ({
          paddingVertical: 14,
          borderRadius: radii.md,
          backgroundColor: theme.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        })}
      >
        <Text style={{ fontSize: 15, fontFamily: DISPLAY_BOLD, color: theme.background, letterSpacing: -0.1 }}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Single-select list (Condition, Gender, Parcel size) ─────────────────────
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function SingleSelectSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <View style={{ gap: 10 }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                onChange(o.value);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: active ? theme.ink : theme.border,
                backgroundColor: active ? (theme.primarySoft ?? 'rgba(0,0,0,0.06)') : theme.panel,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              })}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: active ? DISPLAY_BOLD : type.family.sansSemibold,
                    color: theme.ink,
                    letterSpacing: -0.2,
                  }}
                >
                  {o.label}
                </Text>
                {o.hint ? (
                  <Text style={{ fontSize: 12.5, color: theme.mute, marginTop: 3, lineHeight: 17 }}>
                    {o.hint}
                  </Text>
                ) : null}
              </View>
              {active ? (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: theme.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="check" size={15} color={theme.background} />
                </View>
              ) : (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 1.5,
                    borderColor: theme.border,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

// ── Free-text field (Brand, Size) ──────────────────────────────────────────
export function TextFieldSheet({
  visible,
  title,
  placeholder,
  value,
  onChange,
  onClose,
  multiline,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  multiline?: boolean;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    onChange(draft.trim());
    onClose();
  };

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} footer={<SaveButton onPress={save} />}>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radii.md,
          backgroundColor: theme.panel,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={theme.muteSoft ?? theme.mute}
          autoFocus
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={
            {
              fontSize: 16,
              color: theme.ink,
              minHeight: multiline ? 90 : 28,
              padding: 0,
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any
          }
        />
      </View>
    </BottomSheet>
  );
}

// ── Price (hero numeric input) ──────────────────────────────────────────────
export function PriceSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    onChange(draft);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Price" onClose={onClose} footer={<SaveButton onPress={save} />}>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radii.xl,
          backgroundColor: theme.panel,
          paddingHorizontal: 18,
          paddingVertical: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Text
            style={{
              fontSize: 22,
              fontFamily: DISPLAY_BOLD,
              color: theme.mute,
              marginRight: 8,
            }}
          >
            {CURRENCY_SYMBOL}
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="0"
            placeholderTextColor={theme.muteSoft ?? theme.mute}
            keyboardType="decimal-pad"
            autoFocus
            style={
              {
                fontSize: 32,
                fontFamily: DISPLAY_BOLD,
                color: theme.ink,
                flex: 1,
                minWidth: 0,
                padding: 0,
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any
            }
          />
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radii.sm,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: DISPLAY_BOLD, color: theme.ink }}>
            {CURRENCY_CODE}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 12.5, color: theme.mute, marginTop: 10, paddingHorizontal: 4 }}>
        Set a fair price based on condition and brand to sell quickly.
      </Text>
    </BottomSheet>
  );
}

// ── Colors (swatch grid) ─────────────────────────────────────────────────────
export function ColorSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string | null;
  onChange: (v: string | null) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();

  return (
    <BottomSheet visible={visible} title="Color" onClose={onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {ITEM_COLORS.map((c) => {
          const active = value === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                onChange(active ? null : c.id);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                alignItems: 'center',
                width: 68,
                paddingVertical: 8,
                borderRadius: radii.md,
                backgroundColor: active ? (theme.primarySoft ?? 'rgba(0,0,0,0.06)') : 'transparent',
                borderWidth: active ? 1 : 1,
                borderColor: active ? theme.ink : 'transparent',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? theme.ink : theme.border,
                  marginBottom: 6,
                }}
              >
                <ColorSwatch colorId={c.id} size={active ? 26 : 32} />
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontFamily: active ? DISPLAY_BOLD : type.family.sansMedium,
                  color: theme.ink,
                  textAlign: 'center',
                }}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

// ── Category (two-level: category then subcategory) ─────────────────────────
export function CategorySheet({
  visible,
  category,
  subcategory,
  onChange,
  onClose,
}: {
  visible: boolean;
  category: Category;
  subcategory: string | null;
  onChange: (category: Category, subcategory: string | null) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [cat, setCat] = useState<Category>(category);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) {
      setCat(category);
      setQuery('');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = CATEGORIES.find((c) => c.id === cat);
  const subs = (def?.subs ?? []).filter((s) =>
    query.trim() ? s.label.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );

  return (
    <BottomSheet visible={visible} title="Category" onClose={onClose}>
      {/* Category Pills */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {CATEGORIES.map((c) => {
          const active = cat === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                setCat(c.id);
                setQuery('');
                if (!hasSubcategories(c.id)) {
                  onChange(c.id, null);
                  onClose();
                }
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: active ? theme.ink : theme.border,
                backgroundColor: active ? theme.ink : theme.panel,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Feather name={c.icon} size={14} color={active ? theme.background : theme.ink} />
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: DISPLAY_BOLD,
                  color: active ? theme.background : theme.ink,
                }}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Subcategory Search (if many subcategories) */}
      {def && def.subs.length > 6 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: radii.md,
            backgroundColor: theme.panel,
            paddingHorizontal: 12,
            height: 42,
            marginBottom: 14,
          }}
        >
          <Feather name="search" size={15} color={theme.mute} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${def?.label.toLowerCase() ?? ''}…`}
            placeholderTextColor={theme.muteSoft ?? theme.mute}
            style={{ flex: 1, minWidth: 0, fontSize: 14, color: theme.ink, padding: 0, outlineStyle: 'none' } as any}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Feather name="x" size={14} color={theme.mute} />
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Subcategories grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {subs.map((s) => {
          const active = subcategory === s.id && category === cat;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                onChange(cat, s.id);
                onClose();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: active ? theme.ink : theme.border,
                backgroundColor: active ? (theme.primarySoft ?? 'rgba(0,0,0,0.06)') : theme.panel,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              {active && <Feather name="check" size={13} color={theme.ink} />}
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: active ? DISPLAY_BOLD : type.family.sansMedium,
                  color: theme.ink,
                }}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
        {def && def.subs.length === 0 ? (
          <Pressable
            onPress={() => {
              onChange(cat, null);
              onClose();
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: radii.pill,
              backgroundColor: theme.primary,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontFamily: DISPLAY_BOLD, color: theme.background }}>
              Use {def.label}
            </Text>
          </Pressable>
        ) : null}
        {def && def.subs.length > 0 && subs.length === 0 ? (
          <Text style={{ fontSize: 13, color: theme.mute, paddingVertical: 12 }}>
            No matching subcategory
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

// ── Tags (chip input) ────────────────────────────────────────────────────────
export function TagsSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string[];
  onChange: (v: string[]) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [tags, setTags] = useState<string[]>(value);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (visible) {
      setTags(value);
      setDraft('');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFromDraft = (candidate?: string) => {
    const textToUse = typeof candidate === 'string' ? candidate : draft;
    const raw = textToUse.trim().replace(/[,#]/g, '').toLowerCase();
    if (raw && !tags.includes(raw) && tags.length < 10) {
      setTags((prev) => [...prev, raw]);
    }
    setDraft('');
  };

  const save = () => {
    onChange(tags);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Tags" onClose={onClose} footer={<SaveButton onPress={save} />}>
      <Text style={{ fontSize: 13, color: theme.mute, marginBottom: 12 }}>
        Add keywords like style, aesthetics, or fit to help buyers discover your item (up to 10).
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radii.md,
          backgroundColor: theme.panel,
          padding: 12,
          minHeight: 52,
        }}
      >
        {tags.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTags((prev) => prev.filter((x) => x !== t))}
            style={({ pressed }) => ({
              backgroundColor: theme.ink,
              borderRadius: radii.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 12.5, fontFamily: DISPLAY_BOLD, color: theme.background }}>
              #{t}
            </Text>
            <Feather name="x" size={12} color={theme.background} />
          </Pressable>
        ))}
        <TextInput
          value={draft}
          onChangeText={(text) => {
            if (/[ ,]$/.test(text)) {
              addFromDraft(text);
            } else {
              setDraft(text);
            }
          }}
          onSubmitEditing={() => addFromDraft()}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === 'Backspace' && draft.length === 0 && tags.length > 0) {
              setTags((prev) => prev.slice(0, -1));
            }
          }}
          placeholder={tags.length === 0 ? 'e.g. vintage, y2k, oversized' : 'add tag…'}
          placeholderTextColor={theme.muteSoft ?? theme.mute}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          style={
            {
              flexGrow: 1,
              minWidth: 90,
              fontSize: 14,
              color: theme.ink,
              padding: 0,
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any
          }
        />
      </View>
    </BottomSheet>
  );
}

