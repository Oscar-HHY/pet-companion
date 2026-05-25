import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@pet_companion_settings';

export type Language = 'zh' | 'en';

// Sentinel value used when the user hasn't explicitly picked a theme yet.
// In that case we follow the system color scheme.
export const THEME_AUTO = 'auto';
const DEFAULT_LIGHT_BG = '#f8f6f6';
const DEFAULT_DARK_BG = '#221310';

export interface SettingsState {
  themeBackground: string;
  language: Language;
  fontSizeMultiplier: number;
}

// Dark background detection: parse hex and compute relative luminance
function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.45;
}

interface SettingsContextType extends SettingsState {
  /** The user's raw selection ('auto' or a hex color). Use in SettingsScreen for the picker. */
  themeBackgroundSetting: string;
  setThemeBackground: (color: string) => void;
  setLanguage: (lang: Language) => void;
  setFontSizeMultiplier: (multiplier: number) => void;
  loaded: boolean;
  isDark: boolean;
  themeTextColor: string;
  themeSecondaryText: string;
  themeCardBg: string;
}

const defaultSettings: SettingsState = {
  themeBackground: THEME_AUTO,
  language: 'zh',
  fontSizeMultiplier: 1.0,
};

export const SettingsContext = createContext<SettingsContextType>({
  ...defaultSettings,
  themeBackgroundSetting: THEME_AUTO,
  setThemeBackground: () => {},
  setLanguage: () => {},
  setFontSizeMultiplier: () => {},
  loaded: false,
  isDark: false,
  themeTextColor: '#0f172a',
  themeSecondaryText: '#64748b',
  themeCardBg: '#ffffff',
});

export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const systemScheme = useColorScheme();

  const resolvedThemeBackground = useMemo(() => {
    if (settings.themeBackground === THEME_AUTO) {
      return systemScheme === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
    }
    return settings.themeBackground;
  }, [settings.themeBackground, systemScheme]);

  const isDark = useMemo(() => isDarkColor(resolvedThemeBackground), [resolvedThemeBackground]);
  const themeTextColor = isDark ? '#f1f5f9' : '#0f172a';
  const themeSecondaryText = isDark ? '#94a3b8' : '#64748b';
  const themeCardBg = isDark ? '#1e1e1e' : '#ffffff';

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SettingsState>;
          setSettings((prev) => ({ ...prev, ...parsed }));
        }
      } catch (e) {
        console.warn('[Settings] load failed:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next: SettingsState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('[Settings] save failed:', e);
    }
  }, []);

  const setThemeBackground = useCallback((color: string) => {
    setSettings((prev) => {
      const next = { ...prev, themeBackground: color };
      persist(next);
      return next;
    });
  }, [persist]);

  const setLanguage = useCallback((lang: Language) => {
    setSettings((prev) => {
      const next = { ...prev, language: lang };
      persist(next);
      return next;
    });
  }, [persist]);

  const setFontSizeMultiplier = useCallback((multiplier: number) => {
    setSettings((prev) => {
      const next = { ...prev, fontSizeMultiplier: multiplier };
      persist(next);
      return next;
    });
  }, [persist]);

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        themeBackground: resolvedThemeBackground,
        themeBackgroundSetting: settings.themeBackground,
        setThemeBackground,
        setLanguage,
        setFontSizeMultiplier,
        loaded,
        isDark,
        themeTextColor,
        themeSecondaryText,
        themeCardBg,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
