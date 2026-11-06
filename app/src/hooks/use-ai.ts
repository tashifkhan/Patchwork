import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import { RELAYROOM_DEFAULT_URL, fetchRelayroomCatalog, type RelayroomModel } from '@/api/relayroom';
import {
  AI_PROVIDERS,
  buildProvidersWithCustom,
  loadAiProviders,
  type AiProviderId,
  type AiProviderInfo,
} from '@/lib/ai-models';
import { getAiApiKey } from '@/lib/credentials';
import { assertSafeAiBaseUrl } from '@/lib/secure-url';
import { queryKeys } from '@/lib/query-client';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * models.dev catalog + the user's custom OpenAI-compatible providers.
 *
 * Shared through react-query so the overview screen and the per-provider
 * detail screen read one cached catalog instead of each re-fetching ~600
 * models on mount.
 */
export function useAiCatalog() {
  const customProviders = useSettingsStore((s) => s.aiCustomProviders);
  const query = useQuery({
    queryKey: queryKeys.aiCatalog,
    // Never rejects — falls back to the AsyncStorage cache, then to defaults.
    queryFn: loadAiProviders,
    staleTime: 6 * 60 * 60_000,
    gcTime: Infinity,
  });

  const relay = useRelayroomCatalog();
  const catalogBase = query.data?.providers ?? AI_PROVIDERS;
  // RelayRoom's models come live from the gateway, not from models.dev.
  const base = useMemo(
    () =>
      catalogBase.map((provider) =>
        provider.id === 'relayroom' ? { ...provider, models: (relay.data ?? []).map(toModelInfo) } : provider
      ),
    [catalogBase, relay.data]
  );
  const providers = useMemo(
    () => buildProvidersWithCustom(base, customProviders),
    [base, customProviders]
  );

  return {
    /** Catalog providers plus the user's custom endpoints. */
    providers,
    /** Catalog providers only — what the "N models" total counts. */
    base,
    source: query.data?.source ?? 'fallback',
    error: query.data?.error,
    fetchedAt: query.data?.fetchedAt,
    loading: query.isFetching || relay.isFetching,
    refresh: () => Promise.all([query.refetch(), relay.refetch()]),
    /** RelayRoom gateway catalog status, for its provider screen. */
    relayroom: {
      error: relay.error instanceof Error ? relay.error.message : null,
      loading: relay.isFetching,
      configured: relay.data != null,
    },
  };
}

/** Which providers currently have an API key in the device keychain. */
export function useAiKeys(providers: AiProviderInfo[]) {
  const ids = providers.map((provider) => provider.id);
  const query = useQuery({
    queryKey: [...queryKeys.aiKeys, ids.join(',')],
    queryFn: async () => {
      const entries = await Promise.all(
        ids.map(async (id) => [id, Boolean(await getAiApiKey(id))] as const)
      );
      return Object.fromEntries(entries) as Record<AiProviderId, boolean>;
    },
    enabled: Platform.OS !== 'web' && ids.length > 0,
    staleTime: 30_000,
  });

  return query.data ?? ({} as Record<AiProviderId, boolean>);
}

/** Call after saving or clearing a key so key-presence badges refresh. */
export function useInvalidateAiKeys() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.aiKeys });
}

/** The RelayRoom gateway URL in use: the saved override or the local default. */
export function useRelayroomBaseUrl() {
  const override = useSettingsStore((s) => s.aiBaseUrlOverrides.relayroom);
  return override?.trim() || RELAYROOM_DEFAULT_URL;
}

/**
 * Aliases plus every configured provider's live models, straight from your
 * gateway. Disabled until a gateway key is saved.
 */
export function useRelayroomCatalog() {
  const baseUrl = useRelayroomBaseUrl();
  const keys = useAiKeys(RELAYROOM_ONLY);
  const hasKey = !!keys.relayroom;
  return useQuery({
    queryKey: [...queryKeys.aiCatalog, 'relayroom', baseUrl, hasKey],
    queryFn: async () => {
      const apiKey = await getAiApiKey('relayroom');
      if (!apiKey) return [];
      return fetchRelayroomCatalog({ baseUrl: assertSafeAiBaseUrl(baseUrl), apiKey });
    },
    enabled: Platform.OS !== 'web' && hasKey,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

const RELAYROOM_ONLY = AI_PROVIDERS.filter((provider) => provider.id === 'relayroom');

function toModelInfo(model: RelayroomModel) {
  return {
    id: model.id,
    name: model.alias ? `${model.name} (alias)` : model.name,
    input: model.input,
    output: model.output,
    reasoning: model.reasoning,
    toolCall: model.tools,
    contextWindow: model.contextWindow,
    modes: model.modes,
    providerName: model.alias ? (model.routedTo ? `→ ${model.routedTo}` : 'Alias') : model.providerName,
    alias: model.alias,
  };
}
