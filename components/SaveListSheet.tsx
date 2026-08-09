// Modal sheet for picking which save-list(s) a listing belongs to. Loads
// the user's lists, lets them toggle membership per-list with a checkmark,
// and create new lists inline.
//
// Mounting is cheap — the heavy fetch only runs when `visible` flips on.

import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Modal, StyleSheet, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { BlurView } from 'expo-blur';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  addToList,
  createSaveList,
  ensureSaveLists,
  getListsContaining,
  listSaveLists,
  removeFromList,
  type SaveList,
} from '@/lib/saves';
import { colors } from '@/lib/theme';

const IS_IOS = Platform.OS === 'ios';
const HAIRLINE = StyleSheet.hairlineWidth;
const { width } = Dimensions.get('window');

function tap(style: 'light' | 'medium' | 'selection' = 'selection') {
  if (!IS_IOS) return;
  if (style === 'selection') Haptics.selectionAsync();
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function SaveListSheet({
  visible,
  userId,
  listingId,
  onClose,
  onChanged,
}: {
  visible: boolean;
  userId: string;
  listingId: string;
  onClose: () => void;
  // Fires whenever membership changes so callers (cards, product page) can
  // refresh their "is saved" pill without round-tripping the network.
  onChanged?: (isSavedSomewhere: boolean) => void;
}) {
  const [lists, setLists] = useState<SaveList[]>([]);
  const [containedIn, setContainedIn] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyListId, setBusyListId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Seed the four starter lists for new users — idempotent so existing
      // users see no change.
      await ensureSaveLists(userId);
      const [ls, contained] = await Promise.all([
        listSaveLists(userId),
        getListsContaining(userId, listingId),
      ]);
      if (cancelled) return;
      setLists(ls);
      setContainedIn(contained);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, userId, listingId]);

  // Reset the inline-create UI whenever the sheet closes so it opens clean
  // next time.
  useEffect(() => {
    if (!visible) {
      setCreating(false);
      setNewName('');
    }
  }, [visible]);

  const handleToggleList = async (list: SaveList) => {
    if (busyListId) return;
    const isIn = containedIn.has(list.id);
    setBusyListId(list.id);
    // Optimistic flip
    const nextContained = new Set(containedIn);
    if (isIn) nextContained.delete(list.id);
    else nextContained.add(list.id);
    setContainedIn(nextContained);
    setLists((prev) =>
      prev.map((l) =>
        l.id === list.id
          ? { ...l, item_count: Math.max(0, (l.item_count ?? 0) + (isIn ? -1 : 1)) }
          : l,
      ),
    );
    tap('selection');
    const ok = isIn
      ? await removeFromList(list.id, listingId)
      : await addToList(list.id, listingId);
    if (!ok) {
      // Rollback
      setContainedIn(containedIn);
      setLists((prev) =>
        prev.map((l) =>
          l.id === list.id
            ? { ...l, item_count: Math.max(0, (l.item_count ?? 0) + (isIn ? 1 : -1)) }
            : l,
        ),
      );
    } else {
      onChanged?.(nextContained.size > 0);
    }
    setBusyListId(null);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (name.length === 0) return;
    const created = await createSaveList(userId, name);
    if (!created) return;
    // New list starts empty; immediately add this listing to it — matches
    // the user's intent ("create a list to put this in").
    const ok = await addToList(created.id, listingId);
    setLists((prev) => [
      ...prev,
      { ...created, item_count: ok ? 1 : 0 },
    ]);
    if (ok) {
      const next = new Set(containedIn);
      next.add(created.id);
      setContainedIn(next);
      onChanged?.(true);
    }
    setNewName('');
    setCreating(false);
    tap('light');
  };

  // "Save to list" header copy. When the listing is already in at least
  // one list we shift the prompt to make the toggle behavior obvious.
  const headerText = useMemo(() => {
    if (loading) return 'Save to list';
    return containedIn.size > 0 ? 'Save to lists' : 'Save to list';
  }, [loading, containedIn.size]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {IS_IOS ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        )}
        <Pressable
          onPress={() => {}}
          style={{
            width: width - 56,
            maxWidth: 360,
            maxHeight: '80%',
            backgroundColor: IS_IOS ? 'rgba(255,255,255,0.96)' : 'white',
            borderRadius: 18,
            paddingVertical: 6,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 16 },
            elevation: 12,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: 'rgba(15,15,15,0.62)',
              textAlign: 'center',
              paddingTop: 14,
              paddingBottom: 10,
              letterSpacing: 0.2,
            }}
          >
            {headerText}
          </Text>
          <View style={{ height: HAIRLINE, backgroundColor: 'rgba(15,15,15,0.08)', marginHorizontal: 12 }} />

          {loading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator color={colors.purple} />
            </View>
          ) : (
            <View>
              {lists.map((list, i) => {
                const isLast = i === lists.length - 1;
                const isIn = containedIn.has(list.id);
                const isBusy = busyListId === list.id;
                return (
                  <Pressable
                    key={list.id}
                    onPress={() => handleToggleList(list)}
                    disabled={isBusy}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      borderBottomWidth: isLast ? 0 : HAIRLINE,
                      borderBottomColor: 'rgba(15,15,15,0.08)',
                      opacity: pressed ? 0.55 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 22, marginRight: 12 }}>{list.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#0F0F0F' }}>
                        {list.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: 'rgba(15,15,15,0.62)', marginTop: 2 }}>
                        {list.item_count ?? 0} {list.item_count === 1 ? 'item' : 'items'}
                      </Text>
                    </View>
                    {isBusy ? (
                      <ActivityIndicator color={colors.purple} size="small" />
                    ) : isIn ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.purple} />
                    ) : (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 1.5,
                          borderColor: 'rgba(15,15,15,0.18)',
                        }}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ height: HAIRLINE, backgroundColor: 'rgba(15,15,15,0.08)', marginHorizontal: 12 }} />

          {creating ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 18,
                gap: 8,
              }}
            >
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="List name"
                placeholderTextColor="rgba(15,15,15,0.55)"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: '600',
                  color: '#0F0F0F',
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: 'rgba(15,15,15,0.05)',
                }}
              />
              <Pressable
                onPress={handleCreate}
                disabled={newName.trim().length === 0}
                style={({ pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: colors.purple,
                  opacity: newName.trim().length === 0 ? 0.4 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Add</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                tap('selection');
                setCreating(true);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 14,
                opacity: pressed ? 0.55 : 1,
              })}
            >
              <Feather name="plus" size={18} color={colors.purple} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.purple, marginLeft: 6 }}>
                Create new list
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
