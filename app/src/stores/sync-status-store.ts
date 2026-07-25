import { create } from 'zustand';

interface SyncStatusState {
  taskWarnings: string[];
  deckWarnings: string[];
  lastTaskSyncAt: number | null;
  lastDeckSyncAt: number | null;
  setTaskSync: (warnings: string[]) => void;
  setDeckSync: (warnings: string[]) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  taskWarnings: [],
  deckWarnings: [],
  lastTaskSyncAt: null,
  lastDeckSyncAt: null,
  setTaskSync: (taskWarnings) => set({ taskWarnings, lastTaskSyncAt: Date.now() }),
  setDeckSync: (deckWarnings) => set({ deckWarnings, lastDeckSyncAt: Date.now() }),
}));
