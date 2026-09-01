import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ceranix/previous_searches';
export const DEFAULT_PREVIOUS_SEARCHES = ['Vintage', 'Sneakers', 'Jackets'];

let memoryHistory: string[] = [...DEFAULT_PREVIOUS_SEARCHES];
let isHydrated = false;
let hydrationPromise: Promise<string[]> | null = null;
const subscribers = new Set<(history: string[]) => void>();

function notifySubscribers(next: string[]) {
  memoryHistory = next;
  isHydrated = true;
  subscribers.forEach((fn) => fn(next));
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((e) =>
    console.warn('[useSearchHistory] Failed to persist search history', e),
  );
}

async function hydrateHistory(): Promise<string[]> {
  if (isHydrated) return memoryHistory;
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (isHydrated) {
          return memoryHistory;
        }
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            memoryHistory = parsed;
            isHydrated = true;
            return parsed;
          }
        }
      } catch (err) {
        console.warn('[useSearchHistory] Failed to load search history', err);
      }
      if (!isHydrated) {
        isHydrated = true;
      }
      return memoryHistory;
    })();
  }
  return hydrationPromise;
}

// Pre-hydrate on module evaluation
hydrateHistory();

export function useSearchHistory() {
  const [previousSearches, setPreviousSearches] = useState<string[]>(memoryHistory);
  const [isLoaded, setIsLoaded] = useState(isHydrated);

  useEffect(() => {
    let mounted = true;
    const handleChange = (history: string[]) => {
      if (mounted) setPreviousSearches(history);
    };
    subscribers.add(handleChange);

    hydrateHistory().then((history) => {
      if (mounted) {
        setPreviousSearches(history);
        setIsLoaded(true);
      }
    });

    return () => {
      mounted = false;
      subscribers.delete(handleChange);
    };
  }, []);

  const addSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    const filtered = memoryHistory.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...filtered].slice(0, 15);
    notifySubscribers(next);
  }, []);

  const removeSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    const next = memoryHistory.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
    notifySubscribers(next);
  }, []);

  const clearAll = useCallback(() => {
    notifySubscribers([]);
  }, []);

  return {
    previousSearches,
    isLoaded,
    addSearch,
    removeSearch,
    clearAll,
  };
}
