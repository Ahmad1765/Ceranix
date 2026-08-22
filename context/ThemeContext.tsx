import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, ThemeTokens } from '../lib/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextData {
  theme: ThemeTokens;
  mode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextData | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  // Load saved preference on startup
  useEffect(() => {
    AsyncStorage.getItem('@theme_mode').then((savedMode) => {
      if (savedMode && (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system')) {
        setMode(savedMode as ThemeMode);
      }
    });
  }, []);

  const setThemeMode = async (newMode: ThemeMode) => {
    setMode(newMode);
    await AsyncStorage.setItem('@theme_mode', newMode);
  };

  const isDark = mode === 'system' ? systemColorScheme === 'dark' : mode === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, mode, isDark, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
