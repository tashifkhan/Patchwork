import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getApiBaseUrl, setApiBaseUrl } from '@/api/client';

export type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  proxyUrl: string;
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  defaultReminderMinutes: number;
  aiDefaultListId: string | null;
  hydrated: boolean;
  setProxyUrl: (url: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDefaultReminderMinutes: (minutes: number) => void;
  setAiDefaultListId: (listId: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      proxyUrl: getApiBaseUrl(),
      themeMode: 'system',
      notificationsEnabled: true,
      defaultReminderMinutes: 0,
      aiDefaultListId: null,
      hydrated: false,
      setProxyUrl: (url) => {
        setApiBaseUrl(url);
        set({ proxyUrl: url });
      },
      setThemeMode: (themeMode) => set({ themeMode }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setDefaultReminderMinutes: (defaultReminderMinutes) => set({ defaultReminderMinutes }),
      setAiDefaultListId: (aiDefaultListId) => set({ aiDefaultListId }),
    }),
    {
      name: 'caldav-todo-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ proxyUrl, themeMode, notificationsEnabled, defaultReminderMinutes, aiDefaultListId }) => ({
        proxyUrl,
        themeMode,
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
