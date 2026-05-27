import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getApiBaseUrl, setApiBaseUrl } from '@/api/client';

export type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  proxyUrl: string;
  themeMode: ThemeMode;
  /** Android only: derive the palette from the device wallpaper (Material You). */
  dynamicColor: boolean;
  /** Custom accent color. On iOS overrides the system blue; on Android seeds the palette when dynamicColor is off. */
  accentColor: string | null;
  /** Android only: force pure-black (AMOLED) surfaces in dark mode to save power and deepen contrast. */
  pureBlack: boolean;
  notificationsEnabled: boolean;
  defaultReminderMinutes: number;
  aiDefaultListId: string | null;
  hydrated: boolean;
  setProxyUrl: (url: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setDynamicColor: (enabled: boolean) => void;
  setAccentColor: (color: string | null) => void;
  setPureBlack: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDefaultReminderMinutes: (minutes: number) => void;
  setAiDefaultListId: (listId: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      proxyUrl: getApiBaseUrl(),
      themeMode: 'system',
      dynamicColor: true,
      accentColor: null,
      pureBlack: false,
      notificationsEnabled: true,
      defaultReminderMinutes: 0,
      aiDefaultListId: null,
      hydrated: false,
      setProxyUrl: (url) => {
        setApiBaseUrl(url);
        set({ proxyUrl: url });
      },
      setThemeMode: (themeMode) => set({ themeMode }),
      setDynamicColor: (dynamicColor) => set({ dynamicColor }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setPureBlack: (pureBlack) => set({ pureBlack }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setDefaultReminderMinutes: (defaultReminderMinutes) => set({ defaultReminderMinutes }),
      setAiDefaultListId: (aiDefaultListId) => set({ aiDefaultListId }),
    }),
    {
      name: 'caldav-todo-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        proxyUrl,
        themeMode,
        dynamicColor,
        accentColor,
        pureBlack,
        notificationsEnabled,
        defaultReminderMinutes,
        aiDefaultListId,
      }) => ({
        proxyUrl,
        themeMode,
        dynamicColor,
        accentColor,
        pureBlack,
        notificationsEnabled,
        defaultReminderMinutes,
        aiDefaultListId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.proxyUrl) {
          setApiBaseUrl(state.proxyUrl);
        }
        useSettingsStore.setState({ hydrated: true });
      },
    }
  )
);
