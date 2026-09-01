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
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
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

  // Persist to AsyncStorage whenever previousSearches changes after initial load
  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(previousSearches)).catch((e) =>
      console.warn('[useSearchHistory] Save error', e),
    );
  }, [previousSearches, isLoaded]);

  const addSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    setPreviousSearches((prev) => {
      const filtered = prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
      return [trimmed, ...filtered].slice(0, 15);
    });
  }, []);

  const removeSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    setPreviousSearches((prev) => prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase()));
  }, []);

  const clearAll = useCallback(() => {
    setPreviousSearches([]);
  }, []);

  return {
    previousSearches,
    isLoaded,
    addSearch,
    removeSearch,
    clearAll,
  };
}
