import React, { createContext, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, ThemeTokens, setActiveTheme } from '../lib/theme';

try {
  // Ensure react-native-css-interop runtime flag is permanently 'class' mode
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StyleSheet: InteropStyleSheet } = require('react-native-css-interop');
  if (InteropStyleSheet && typeof InteropStyleSheet.setFlag === 'function') {
    InteropStyleSheet.setFlag('darkMode', 'class');
  }
} catch {}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextData {
  theme: ThemeTokens;
  mode: ThemeMode;
  isDark: boolean;
  hydrated: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextData | undefined>(undefined);

/**
 * ThemeProvider: Dark Mode is disabled across the app.
 * Always renders in Light mode with consistent tokens and white/slate canvas.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode: ThemeMode = 'light';
  const isDark = false;
  const hydrated = true;
  const theme = lightTheme;

  // Keep static token references in sync with theme state
  setActiveTheme(lightTheme);

  useEffect(() => {
    setActiveTheme(lightTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = lightTheme.background;
      document.body.style.backgroundColor = lightTheme.background;
      document.documentElement.classList.remove('dark');
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { colorScheme } = require('nativewind');
      if (colorScheme && typeof colorScheme.set === 'function') {
        colorScheme.set('light');
      }
    } catch {}
  }, []);

  const setThemeMode = async (_newMode: ThemeMode) => {
    setActiveTheme(lightTheme);
    try {
      await AsyncStorage.setItem('@theme_mode', 'light');
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
