import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getApiBaseUrl, setApiBaseUrl } from '@/api/client';
import { DEFAULT_AI_MODELS, type AiCustomProvider, type AiModelSelection, type AiProviderId } from '@/lib/ai-models';

export type ThemeMode = 'light' | 'dark' | 'system';
export type GitHubMode = 'public' | 'private';

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
  aiModelSelections: AiModelSelection[];
  aiBaseUrlOverrides: Partial<Record<AiProviderId, string>>;
  aiCustomProviders: AiCustomProvider[];
  hydrated: boolean;
  githubRepos: string[];
  githubConnected: boolean;
  githubMode: GitHubMode;
  setProxyUrl: (url: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setDynamicColor: (enabled: boolean) => void;
  setAccentColor: (color: string | null) => void;
  setPureBlack: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDefaultReminderMinutes: (minutes: number) => void;
  setAiDefaultListId: (listId: string | null) => void;
  setAiModelSelections: (selections: AiModelSelection[]) => void;
  setAiBaseUrlOverride: (providerId: AiProviderId, baseUrl: string) => void;
  upsertAiCustomProvider: (provider: AiCustomProvider) => void;
  removeAiCustomProvider: (providerId: string) => void;
  setGitHubRepos: (repos: string[]) => void;
  setGitHubConnected: (connected: boolean) => void;
  setGitHubMode: (mode: GitHubMode) => void;
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
      aiModelSelections: DEFAULT_AI_MODELS,
      aiBaseUrlOverrides: {},
      aiCustomProviders: [],
      hydrated: false,
      githubRepos: [],
      githubConnected: false,
      githubMode: 'public',
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
      setAiModelSelections: (aiModelSelections) => set({ aiModelSelections }),
      setAiBaseUrlOverride: (providerId, baseUrl) =>
        set((state) => ({
          aiBaseUrlOverrides: { ...state.aiBaseUrlOverrides, [providerId]: baseUrl.trim() },
        })),
      upsertAiCustomProvider: (provider) =>
        set((state) => {
          const existing = state.aiCustomProviders.findIndex((entry) => entry.id === provider.id);
          const next = [...state.aiCustomProviders];
          if (existing >= 0) next[existing] = provider;
          else next.push(provider);
          return { aiCustomProviders: next };
        }),
      removeAiCustomProvider: (providerId) =>
        set((state) => ({
          aiCustomProviders: state.aiCustomProviders.filter((entry) => entry.id !== providerId),
          aiModelSelections: state.aiModelSelections.filter((selection) => selection.providerId !== providerId),
        })),
      setGitHubRepos: (githubRepos) => set({ githubRepos }),
      setGitHubConnected: (githubConnected) => set({ githubConnected }),
      setGitHubMode: (githubMode) => set({ githubMode }),
    }),
    {
      name: 'patchwork-settings',
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
        aiModelSelections,
        aiBaseUrlOverrides,
        aiCustomProviders,
        githubRepos,
        githubConnected,
        githubMode,
      }) => ({
        proxyUrl,
        themeMode,
        dynamicColor,
        accentColor,
        pureBlack,
        notificationsEnabled,
        defaultReminderMinutes,
        aiDefaultListId,
        aiModelSelections,
        aiBaseUrlOverrides,
        aiCustomProviders,
        githubRepos,
        githubConnected,
        githubMode,
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
