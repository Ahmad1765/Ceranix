import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ceranix/previous_searches';
const DEFAULT_PREVIOUS_SEARCHES = ['Antiques & Design', 'Antikviteter', 'Bilar'];

export function useSearchHistory() {
  const [previousSearches, setPreviousSearches] = useState<string[]>(DEFAULT_PREVIOUS_SEARCHES);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (mounted) setPreviousSearches(parsed);
            return;
          }
        }
        // If nothing stored yet, initialize with defaults
        if (mounted) setPreviousSearches(DEFAULT_PREVIOUS_SEARCHES);
      } catch (err) {
        console.warn('[useSearchHistory] Failed to load previous searches', err);
      } finally {
        if (mounted) setIsLoaded(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const addSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    setPreviousSearches((prev) => {
      const filtered = prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 15);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch((e) =>
        console.warn('[useSearchHistory] Save error', e),
      );
      return updated;
    });
  }, []);

  const removeSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    setPreviousSearches((prev) => {
      const updated = prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch((e) =>
        console.warn('[useSearchHistory] Remove error', e),
      );
      return updated;
    });
  }, []);

  const clearAll = useCallback(async () => {
    setPreviousSearches([]);
    await AsyncStorage.removeItem(STORAGE_KEY).catch((e) =>
      console.warn('[useSearchHistory] Clear error', e),
    );
  }, []);

  return {
    previousSearches,
    isLoaded,
    addSearch,
    removeSearch,
    clearAll,
  };
}
