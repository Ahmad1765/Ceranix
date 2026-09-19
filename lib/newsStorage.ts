import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ceranix_opened_news_items';
export const MAX_OPENED_NEWS_ITEMS = 500;

const listeners = new Set<(ids: Set<string>) => void>();
let cachedOpenedIds: Set<string> | null = null;

async function loadOpenedIds(): Promise<Set<string>> {
  if (cachedOpenedIds) return cachedOpenedIds;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const trimmed = arr.length > MAX_OPENED_NEWS_ITEMS ? arr.slice(-MAX_OPENED_NEWS_ITEMS) : arr;
        cachedOpenedIds = new Set(trimmed);
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
  const currentSet = await loadOpenedIds();
  if (currentSet.has(id)) return;

  const items = Array.from(currentSet);
  items.push(id);
  const trimmed = items.length > MAX_OPENED_NEWS_ITEMS ? items.slice(-MAX_OPENED_NEWS_ITEMS) : items;

  cachedOpenedIds = new Set(trimmed);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[newsStorage] failed to persist opened item', e);
  }
  listeners.forEach((listener) => listener(cachedOpenedIds!));
}

export function _resetOpenedNewsIdsForTesting(): void {
  cachedOpenedIds = null;
  listeners.clear();
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
