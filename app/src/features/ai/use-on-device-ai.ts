import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  UNSUPPORTED_STATUS,
  addDownloadProgressListener,
  downloadLocalAi,
  getLocalAiStatus,
  isLocalAiLinked,
  type LocalAiStatus,
} from '../../../modules/patchwork-local-ai/src';
import { isOnDevice, onDeviceOffered, syncOnDevice, withOnDevice, withoutOnDevice } from '@/features/ai/on-device-ai';
import { useSettingsStore } from '@/stores/settings-store';

const STATUS_KEY = ['ai', 'on-device-status'] as const;

/**
 * Gemini Nano (Android) or Apple Intelligence (iOS) for the AI chain.
 *
 * `offered` is false on devices that can never run a local model, and the
 * settings screen hides the switch. It stays true while the model is in the
 * chain, so a restored backup on an older phone can still be switched off.
 */
export function useOnDeviceAi() {
  const queryClient = useQueryClient();
  const selections = useSettingsStore((s) => s.aiModelSelections);
  const setSelections = useSettingsStore((s) => s.setAiModelSelections);
  const enabled = selections.some(isOnDevice);
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null } | null>(null);

  const query = useQuery({
    queryKey: STATUS_KEY,
    queryFn: getLocalAiStatus,
    enabled: isLocalAiLinked(),
    staleTime: 60_000,
    // Poll while the platform downloads; the model becomes usable on its own.
    refetchInterval: (q) => (q.state.data?.state === 'downloading' ? 5_000 : false),
  });
  const status: LocalAiStatus = query.data ?? UNSUPPORTED_STATUS;

  // Coming back from Settings (Apple Intelligence just turned on) should show at once.
  useEffect(() => {
    if (!isLocalAiLinked()) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    });
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    const sub = addDownloadProgressListener(setProgress);
    return () => sub?.remove();
  }, []);

  // Keep the saved entry's abilities current (image input after an OS update).
  useEffect(() => {
    if (!query.data) return;
    const next = syncOnDevice(selections, query.data);
    if (next !== selections) setSelections(next);
  }, [query.data, selections, setSelections]);

  const download = useMutation({
    mutationFn: downloadLocalAi,
    onMutate: () => setProgress(null),
    onSettled: (data) => {
      setProgress(null);
      if (data) queryClient.setQueryData(STATUS_KEY, data);
      else queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  function setEnabled(on: boolean) {
    const current = useSettingsStore.getState().aiModelSelections;
    if (!on) {
      setSelections(withoutOnDevice(current));
      return;
    }
    setSelections(withOnDevice(current, status));
    // Turning it on is the request to fetch the model.
    if (status.state === 'downloadable' && !download.isPending) download.mutate();
  }

  const live: LocalAiStatus =
    download.isPending || progress
      ? {
          ...status,
          state: 'downloading',
          downloaded: progress?.downloaded ?? null,
          total: progress?.total ?? null,
        }
      : status;

  return {
    status: live,
    offered: onDeviceOffered(status) || enabled,
    enabled,
    setEnabled,
    download: () => download.mutate(),
    downloading: download.isPending,
    checking: query.isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
  };
}
