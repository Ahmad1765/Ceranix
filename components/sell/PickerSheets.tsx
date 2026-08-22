import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii, type } from '@/lib/theme';
import { CATEGORIES, hasSubcategories } from '@/lib/categories';
import { ITEM_COLORS } from '@/lib/itemColors';
import { ColorSwatch } from '@/components/ColorSwatch';
import { CURRENCY_SYMBOL, CURRENCY_CODE } from '@/lib/currency';
import type { Category } from '@/types';
import { BottomSheet } from './BottomSheet';
import { SELL_TEAL, SELL_TEAL_SOFT } from './theme';

const DISPLAY_BOLD = type.family.sansBold;

function SaveButton({ onPress, label = 'Save' }: { onPress: () => void; label?: string }) {
  return (
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
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => ({
          paddingVertical: 15,
          borderRadius: radii.md,
          backgroundColor: SELL_TEAL,
          alignItems: 'center',
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <Text style={{ fontSize: 14.5, fontFamily: DISPLAY_BOLD, color: '#FFFFFF', letterSpacing: -0.1 }}>
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
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <View style={{ gap: 8 }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                onChange(o.value);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                padding: 14,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: active ? SELL_TEAL : colors.border,
                backgroundColor: active ? SELL_TEAL_SOFT : colors.surface,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: DISPLAY_BOLD, color: colors.ink }}>{o.label}</Text>
                {o.hint ? (
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>{o.hint}</Text>
                ) : null}
              </View>
              {active ? <Feather name="check" size={18} color={SELL_TEAL} /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

// ── Free-text field (Brand, Size, Material) ─────────────────────────────────
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
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        placeholderTextColor={colors.mute}
        autoFocus
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={
          {
            fontSize: 16,
            color: colors.ink,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingVertical: 10,
            minHeight: multiline ? 90 : undefined,
            outlineStyle: 'none',
            outlineWidth: 0,
          } as any
        }
      />
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
      <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 20 }}>
        <Text style={{ fontSize: 24, fontFamily: DISPLAY_BOLD, color: SELL_TEAL, marginRight: 8 }}>
          {CURRENCY_SYMBOL}
        </Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="0"
          placeholderTextColor={colors.mute}
          keyboardType="decimal-pad"
          autoFocus
          style={
            {
              fontSize: 34,
              fontFamily: DISPLAY_BOLD,
              color: colors.ink,
              flex: 1,
              minWidth: 0,
              padding: 0,
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any
          }
        />
        <Text style={{ fontSize: 13, fontFamily: type.family.sansMedium, color: colors.mute, marginLeft: 8 }}>
          {CURRENCY_CODE}
        </Text>
      </View>
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
  return (
    <BottomSheet visible={visible} title="Colors" onClose={onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {ITEM_COLORS.map((c) => {
          const active = value === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                onChange(active ? null : c.id);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: active }}
              style={{ alignItems: 'center', width: 64 }}
            >
              <View
                style={({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: active ? 2 : 0,
                  borderColor: SELL_TEAL,
                  marginBottom: 6,
                } as any)}
              >
                <ColorSwatch colorId={c.id} size={active ? 30 : 34} />
              </View>
              <Text style={{ fontSize: 11.5, color: colors.ink, textAlign: 'center' }}>{c.label}</Text>
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {CATEGORIES.map((c) => {
          const active = cat === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
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
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: active ? colors.ink : colors.border,
                backgroundColor: active ? colors.ink : colors.surface,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Feather name={c.icon} size={13} color={active ? colors.background : colors.ink} />
              <Text style={{ fontSize: 13, fontFamily: DISPLAY_BOLD, color: active ? colors.background : colors.ink }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {subs.length > 8 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            height: 42,
            marginBottom: 12,
          }}
        >
          <Feather name="search" size={15} color={colors.mute} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${def?.label.toLowerCase() ?? ''}`}
            placeholderTextColor={colors.mute}
            style={{ flex: 1, minWidth: 0, fontSize: 14, color: colors.ink }}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {subs.map((s) => {
          const active = subcategory === s.id && category === cat;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                onChange(cat, s.id);
                onClose();
              }}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: active ? SELL_TEAL : colors.border,
                backgroundColor: active ? SELL_TEAL_SOFT : colors.surface,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: active ? DISPLAY_BOLD : type.family.sansMedium,
                  color: colors.ink,
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
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: radii.pill,
              backgroundColor: SELL_TEAL,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontFamily: DISPLAY_BOLD, color: colors.white }}>
              Use {def.label}
            </Text>
          </Pressable>
        ) : null}
        {def && def.subs.length > 0 && subs.length === 0 ? (
          <Text style={{ fontSize: 13, color: colors.mute, paddingVertical: 6 }}>No matches</Text>
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
  const [tags, setTags] = useState<string[]>(value);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (visible) {
      setTags(value);
      setDraft('');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFromDraft = () => {
    const raw = draft.trim().replace(/[,#]/g, '').toLowerCase();
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
      <Text style={{ fontSize: 12.5, color: colors.mute, marginBottom: 10 }}>
        Help buyers find this item. Up to 10.
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.md,
          padding: 10,
          minHeight: 46,
        }}
      >
        {tags.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTags((prev) => prev.filter((x) => x !== t))}
            style={{
              backgroundColor: SELL_TEAL,
              borderRadius: radii.pill,
              paddingHorizontal: 10,
              paddingVertical: 4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: DISPLAY_BOLD, color: '#FFFFFF' }}>#{t}</Text>
            <Feather name="x" size={11} color="#FFFFFF" />
          </Pressable>
        ))}
        <TextInput
          value={draft}
          onChangeText={(text) => {
            if (/[ ,]$/.test(text)) {
              addFromDraft();
            } else {
              setDraft(text);
            }
          }}
          onSubmitEditing={addFromDraft}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === 'Backspace' && draft.length === 0 && tags.length > 0) {
              setTags((prev) => prev.slice(0, -1));
            }
          }}
          placeholder={tags.length === 0 ? 'e.g. vintage denim oversized' : 'add tag…'}
          placeholderTextColor={colors.mute}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          style={
            {
              flexGrow: 1,
              minWidth: 80,
              fontSize: 14,
              color: colors.ink,
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
