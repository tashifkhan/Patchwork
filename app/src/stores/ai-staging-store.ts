import { create } from 'zustand';

import type { AiGeneratedTask } from '@/api/types';

// Holds AI-parsed tasks pending user review. Nothing here is ever saved to
// Nextcloud automatically — the user edits this list then explicitly commits.
interface AiStagingState {
  staged: AiGeneratedTask[];
  setStaged: (tasks: AiGeneratedTask[]) => void;
  updateTask: (index: number, patch: Partial<AiGeneratedTask>) => void;
  removeTask: (index: number) => void;
  clear: () => void;
}

export const useAiStagingStore = create<AiStagingState>((set) => ({
  staged: [],
  setStaged: (staged) => set({ staged }),
  updateTask: (index, patch) =>
    set((state) => ({
      staged: state.staged.map((task, i) => (i === index ? { ...task, ...patch } : task)),
    })),
  removeTask: (index) =>
    set((state) => ({ staged: state.staged.filter((_, i) => i !== index) })),
  clear: () => set({ staged: [] }),
}));
