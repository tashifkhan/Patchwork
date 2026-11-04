import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getApiBaseUrl, setApiBaseUrl } from '@/api/client';
import { DEFAULT_AI_MODELS, type AiCustomProvider, type AiModelSelection, type AiProviderId } from '@/lib/ai-models';
import { assertSafeAiBaseUrl } from '@/lib/secure-url';
import type {
  GitHubIssueScope,
  GitHubIssueState,
  GitHubRepositorySelection,
} from '@/features/github/types';

export type ThemeMode = 'light' | 'dark' | 'system';
export type { GitHubIssueScope, GitHubIssueState } from '@/features/github/types';

interface SettingsState {
  proxyUrl: string;
  themeMode: ThemeMode;
  /** Android only: derive the palette from the device wallpaper (Material You). */
  dynamicColor: boolean;
  /** Custom accent color. On iOS overrides the system blue; on Android seeds the palette when dynamicColor is off. */
  accentColor: string | null;
  /** Fixed curated palette id (Paisa-style). Null = default/system accent. */
  colorPalette: string | null;
  /** Pure-black (AMOLED) surfaces in dark mode. */
  pureBlack: boolean;
  /** Stronger text and outline contrast. */
  highContrast: boolean;
  /**
   * Android only: use the floating pill navbar instead of the
   * edge-to-edge Material 3 bottom navigation.
   */
  floatingTabBar: boolean;
  /** Master switch for all touch feedback (see `@/lib/haptics`). */
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  defaultReminderMinutes: number;
  aiDefaultListId: string | null;
  aiModelSelections: AiModelSelection[];
  aiBaseUrlOverrides: Partial<Record<AiProviderId, string>>;
  aiCustomProviders: AiCustomProvider[];
  hydrated: boolean;
  githubRepositories: GitHubRepositorySelection[];
  /** Private-mode issue filter (assigned / created / mentioned / all). */
  githubIssueScope: GitHubIssueScope;
  /** Open / closed / all issues. */
  githubIssueState: GitHubIssueState;
  setProxyUrl: (url: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setDynamicColor: (enabled: boolean) => void;
  setAccentColor: (color: string | null) => void;
  setColorPalette: (paletteId: string | null) => void;
  setPureBlack: (enabled: boolean) => void;
  setHighContrast: (enabled: boolean) => void;
  setFloatingTabBar: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDefaultReminderMinutes: (minutes: number) => void;
  setAiDefaultListId: (listId: string | null) => void;
  setAiModelSelections: (selections: AiModelSelection[]) => void;
  setAiBaseUrlOverride: (providerId: AiProviderId, baseUrl: string) => void;
  upsertAiCustomProvider: (provider: AiCustomProvider) => void;
  removeAiCustomProvider: (providerId: string) => void;
  setGitHubRepositories: (repositories: GitHubRepositorySelection[]) => void;
  setGitHubIssueScope: (scope: GitHubIssueScope) => void;
  setGitHubIssueState: (state: GitHubIssueState) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      proxyUrl: getApiBaseUrl(),
      themeMode: 'system',
      dynamicColor: true,
      accentColor: null,
      colorPalette: null,
      pureBlack: false,
      highContrast: false,
      floatingTabBar: false,
      hapticsEnabled: true,
      notificationsEnabled: true,
      defaultReminderMinutes: 0,
      aiDefaultListId: null,
      aiModelSelections: DEFAULT_AI_MODELS,
      aiBaseUrlOverrides: {},
      aiCustomProviders: [],
      hydrated: false,
      githubRepositories: [],
      githubIssueScope: 'assigned',
      githubIssueState: 'all',
      setProxyUrl: (url) => {
        setApiBaseUrl(url);
        set({ proxyUrl: url });
      },
      setThemeMode: (themeMode) => set({ themeMode }),
      setDynamicColor: (dynamicColor) => set({ dynamicColor }),
      setAccentColor: (accentColor) => set({ accentColor, colorPalette: null }),
      setColorPalette: (colorPalette) =>
        set({
          colorPalette,
          // Picking a named palette turns off free-form accent and (on Android) dynamic wallpaper.
          accentColor: null,
          ...(colorPalette ? { dynamicColor: false } : {}),
        }),
      setPureBlack: (pureBlack) => set({ pureBlack }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setFloatingTabBar: (floatingTabBar) => set({ floatingTabBar }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setDefaultReminderMinutes: (defaultReminderMinutes) => set({ defaultReminderMinutes }),
      setAiDefaultListId: (aiDefaultListId) => set({ aiDefaultListId }),
      setAiModelSelections: (aiModelSelections) => set({ aiModelSelections }),
      // Store raw while typing; ai.native.ts validates before sending API keys.
      setAiBaseUrlOverride: (providerId, baseUrl) =>
        set((state) => ({
          aiBaseUrlOverrides: { ...state.aiBaseUrlOverrides, [providerId]: baseUrl.trim() },
        })),
      upsertAiCustomProvider: (provider) =>
        set((state) => {
          const safeProvider = {
            ...provider,
            name: provider.name.trim(),
            baseUrl: assertSafeAiBaseUrl(provider.baseUrl),
          };
          const existing = state.aiCustomProviders.findIndex((entry) => entry.id === safeProvider.id);
          const next = [...state.aiCustomProviders];
          if (existing >= 0) next[existing] = safeProvider;
          else next.push(safeProvider);
          return { aiCustomProviders: next };
        }),
      removeAiCustomProvider: (providerId) =>
        set((state) => ({
          aiCustomProviders: state.aiCustomProviders.filter((entry) => entry.id !== providerId),
          aiModelSelections: state.aiModelSelections.filter((selection) => selection.providerId !== providerId),
        })),
      setGitHubRepositories: (githubRepositories) => set({ githubRepositories }),
      setGitHubIssueScope: (githubIssueScope) => set({ githubIssueScope }),
      setGitHubIssueState: (githubIssueState) => set({ githubIssueState }),
    }),
    {
      name: 'patchwork-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        proxyUrl,
        themeMode,
        dynamicColor,
        accentColor,
        colorPalette,
        pureBlack,
        highContrast,
        floatingTabBar,
        hapticsEnabled,
        notificationsEnabled,
        defaultReminderMinutes,
        aiDefaultListId,
        aiModelSelections,
        aiBaseUrlOverrides,
        aiCustomProviders,
        githubRepositories,
        githubIssueScope,
        githubIssueState,
      }) => ({
        proxyUrl,
        themeMode,
        dynamicColor,
        accentColor,
        colorPalette,
        pureBlack,
        highContrast,
        floatingTabBar,
        hapticsEnabled,
        notificationsEnabled,
        defaultReminderMinutes,
        aiDefaultListId,
        aiModelSelections,
        aiBaseUrlOverrides,
        aiCustomProviders,
        githubRepositories,
        githubIssueScope,
        githubIssueState,
      }),
      version: 2,
      migrate: (persistedState, version) => {
        const persisted = (persistedState ?? {}) as Record<string, unknown>;
        if (version < 2 && !Array.isArray(persisted.githubRepositories)) {
          const oldRepos = Array.isArray(persisted.githubRepos)
            ? persisted.githubRepos.filter((value): value is string => typeof value === 'string')
            : [];
          persisted.githubRepositories = oldRepos.map((fullName) => ({
            id: null,
            fullName,
          }));
        }
        delete persisted.githubRepos;
        delete persisted.githubConnected;
        delete persisted.githubMode;
        return persisted as unknown as SettingsState;
      },
      onRehydrateStorage: () => (state) => {
        if (state?.proxyUrl) {
          setApiBaseUrl(state.proxyUrl);
        }
        useSettingsStore.setState({ hydrated: true });
      },
    }
  )
);
