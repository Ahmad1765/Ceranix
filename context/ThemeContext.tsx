import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, ThemeTokens, setActiveTheme } from '../lib/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextData {
  theme: ThemeTokens;
  mode: ThemeMode;
  isDark: boolean;
  hydrated: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextData | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');
  const [hydrated, setHydrated] = useState(false);

  // Load saved preference on startup
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem('@theme_mode')
      .then((savedMode) => {
        if (!mounted) return;
        if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
          setMode(savedMode);
        }
      })
      .catch((e) => {
        console.warn('[ThemeContext] Failed to load theme mode', e);
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const isDark = mode === 'system' ? systemColorScheme === 'dark' : mode === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  // Keep static token references in sync with theme state
  setActiveTheme(theme);
  useEffect(() => {
    setActiveTheme(theme);
    if (typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = theme.background;
      document.body.style.backgroundColor = theme.background;
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme, isDark]);

  const setThemeMode = async (newMode: ThemeMode) => {
    const nextIsDark = newMode === 'system' ? systemColorScheme === 'dark' : newMode === 'dark';
    setActiveTheme(nextIsDark ? darkTheme : lightTheme);
    setMode(newMode);
    try {
      await AsyncStorage.setItem('@theme_mode', newMode);
    } catch (e) {
      console.warn('[ThemeContext] Failed to save theme mode', e);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, isDark, hydrated, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
