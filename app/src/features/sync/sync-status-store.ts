import { create } from 'zustand';

interface SyncStatusState {
  deckWarnings: string[];
  lastDeckSyncAt: number | null;
  setDeckSync: (warnings: string[]) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  deckWarnings: [],
  lastDeckSyncAt: null,
  setDeckSync: (deckWarnings) => set({ deckWarnings, lastDeckSyncAt: Date.now() }),
}));
