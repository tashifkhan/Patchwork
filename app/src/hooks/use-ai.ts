import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import {
  AI_PROVIDERS,
  buildProvidersWithCustom,
  loadAiProviders,
  type AiProviderId,
  type AiProviderInfo,
} from '@/lib/ai-models';
import { getAiApiKey } from '@/lib/credentials';
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

  const base = query.data?.providers ?? AI_PROVIDERS;
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
    loading: query.isFetching,
    refresh: () => query.refetch(),
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
