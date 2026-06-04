import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radii } from '@/lib/theme';
import { createSavedSearch } from '@/lib/savedSearches';
import { useToast } from '@/lib/toast';
import { useInputFocus } from '@/lib/useInputFocus';
import type { Category, Gender } from '@/types';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'clothing', label: 'Clothing' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'bags', label: 'Bags' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'electronics', label: 'Tech' },
  { id: 'beauty', label: 'Beauty' },
  { id: 'other', label: 'Other' },
];

interface Props {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function DropAlertSheet({ visible, userId, onClose, onCreated }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [gender, setGender] = useState<Gender>('all');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const queryFocus = useInputFocus();

  const reset = useCallback(() => {
    setQuery('');
    setCategory(null);
    setGender('all');
    setNotify(true);
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;
    reset();
    onClose();
  }, [reset, onClose, saving]);

  const handleCreate = useCallback(async () => {
    const q = query.trim();
    if (!q && !category) {
      toast.show('Add a brand or pick a category', { variant: 'info', icon: 'alert-circle' });
      return;
    }
    setSaving(true);
    try {
      const row = await createSavedSearch({
        userId,
        query: q || null,
        category,
        gender: gender === 'all' ? null : gender,
        notify,
      });
      if (!row) {
        toast.show("Couldn't create the alert", { variant: 'default', icon: 'alert-triangle' });
        return;
      }
      toast.show(notify ? 'Alert created — we\'ll ping you' : 'Filter added', {
        variant: 'success',
        icon: 'bell',
      });
      reset();
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [query, category, gender, notify, userId, toast, reset, onCreated, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <Pressable
        onPress={handleClose}
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.white,
            borderTopLeftRadius: radii['3xl'],
            borderTopRightRadius: radii['3xl'],
            paddingTop: 12,
            paddingBottom: 32,
            paddingHorizontal: 20,
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
              marginBottom: 16,
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 }}>
                Create drop alert
              </Text>
              <Text style={{ fontSize: 13, color: colors.muteSoft, marginTop: 4 }}>
                Get notified when matching items appear.
              </Text>
            </View>
            <Pressable
              hitSlop={10}
              onPress={handleClose}
              style={({ pressed }) => ({
                padding: 4,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="x" size={20} color={colors.muteSoft} />
            </Pressable>
          </View>

          {/* Brand/keyword input */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink, marginTop: 20, marginBottom: 8, letterSpacing: 0.3 }}>
            BRAND OR KEYWORD
          </Text>
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: radii.md,
              paddingHorizontal: 14,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              ...queryFocus.borderProps('transparent'),
            }}
          >
            <Feather name="search" size={16} color={colors.muteSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={queryFocus.onFocus}
              onBlur={queryFocus.onBlur}
              placeholder="e.g. Nike, vintage tee"
              placeholderTextColor={colors.muteSoft}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              style={{
                flex: 1,
                marginLeft: 10,
                fontSize: 14,
                color: colors.ink,
                padding: 0,
              }}
            />
          </View>

          {/* Category */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink, marginTop: 18, marginBottom: 8, letterSpacing: 0.3 }}>
            CATEGORY
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          >
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(active ? null : c.id)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.ink : colors.hairline,
                    backgroundColor: active ? colors.panel : colors.white,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: active ? '700' : '600', color: colors.ink }}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Gender */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink, marginTop: 18, marginBottom: 8, letterSpacing: 0.3 }}>
            FOR
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['all', 'men', 'women', 'unisex'] as const).map((g) => {
              const active = gender === g;
              return (
                <Pressable
                  key={g}
                  onPress={() => setGender(g)}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.ink : colors.hairline,
                    backgroundColor: active ? colors.panel : colors.white,
                    alignItems: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: active ? '700' : '600',
                      color: colors.ink,
                      textTransform: 'capitalize',
                    }}
                  >
                    {g === 'all' ? 'Anyone' : g}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Notify toggle */}
          <Pressable
            onPress={() => setNotify(!notify)}
            style={({ pressed }) => ({
              marginTop: 22,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: notify ? colors.purpleSoft : colors.panel,
              flexDirection: 'row',
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: notify ? colors.purple : colors.white,
                borderWidth: notify ? 0 : 1,
                borderColor: colors.hairline,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <Feather name="bell" size={14} color={notify ? colors.white : colors.muteSoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.ink }}>
                Notify me on new matches
              </Text>
              <Text style={{ fontSize: 12, color: colors.muteSoft, marginTop: 2 }}>
                {notify ? 'Push when fresh listings hit your filters' : 'Just save the filter without pings'}
              </Text>
            </View>
            <View
              style={{
                width: 36,
                height: 22,
                borderRadius: 11,
                backgroundColor: notify ? colors.purple : colors.hairline,
                padding: 2,
                alignItems: notify ? 'flex-end' : 'flex-start',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.white,
                }}
              />
            </View>
          </Pressable>

          {/* CTA */}
          <Pressable
            onPress={handleCreate}
            disabled={saving}
            style={({ pressed }) => ({
              marginTop: 18,
              paddingVertical: 14,
              borderRadius: radii.pill,
              backgroundColor: colors.ink,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.white, letterSpacing: -0.1 }}>
                Create alert
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
