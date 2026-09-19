import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ceranix_opened_news_items';

const listeners = new Set<(ids: Set<string>) => void>();
let cachedOpenedIds: Set<string> | null = null;

async function loadOpenedIds(): Promise<Set<string>> {
  if (cachedOpenedIds) return cachedOpenedIds;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        cachedOpenedIds = new Set(arr);
        return cachedOpenedIds;
      }
    }
  } catch (e) {
    console.warn('[newsStorage] failed to load opened items', e);
  }
  cachedOpenedIds = new Set();
  return cachedOpenedIds;
}

export async function markNewsItemOpened(id: string): Promise<void> {
  if (!id) return;
  const set = await loadOpenedIds();
  if (set.has(id)) return;
  set.add(id);
  cachedOpenedIds = new Set(set);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('[newsStorage] failed to persist opened item', e);
  }
  listeners.forEach((listener) => listener(cachedOpenedIds!));
}

export function useOpenedNewsIds(): {
  openedIds: Set<string>;
  markOpened: (id: string) => Promise<void>;
  isOpened: (id: string) => boolean;
} {
  const [openedIds, setOpenedIds] = useState<Set<string>>(cachedOpenedIds ?? new Set());

  useEffect(() => {
    let mounted = true;
    loadOpenedIds().then((ids) => {
      if (mounted) setOpenedIds(new Set(ids));
    });

    const handler = (newSet: Set<string>) => {
      if (mounted) setOpenedIds(new Set(newSet));
    };

    listeners.add(handler);
    return () => {
      mounted = false;
      listeners.delete(handler);
    };
  }, []);

  const markOpened = useCallback(async (id: string) => {
    await markNewsItemOpened(id);
  }, []);

  const isOpened = useCallback((id: string) => openedIds.has(id), [openedIds]);

  return { openedIds, markOpened, isOpened };
}
