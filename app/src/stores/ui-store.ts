import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { TaskRef } from '@/features/tasks/model';

/** Stored separately from the in-memory list filter so widgets can read it across cold starts. */
export const LAST_LIST_STORAGE_KEY = 'patchwork.last-list';

interface UiState {
  selectedListId: string | null;
  selectedTag: string | null;
  selectedBoardId: number | null;
  /**
   * One-shot request from Search: the Tasks screen opens this task in place
   * (Things-style card) the next time it renders, then clears it.
   */
  createListRequested: boolean;
  requestCreateList: (requested: boolean) => void;
  openTask: TaskRef | null;
  requestOpenTask: (ref: TaskRef | null) => void;
  setSelectedListId: (listId: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedBoardId: (boardId: number | null) => void;
  clearFilters: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedListId: null,
  selectedTag: null,
  selectedBoardId: null,
  createListRequested: false,
  requestCreateList: (createListRequested) => set({ createListRequested }),
  openTask: null,
  requestOpenTask: (openTask) => set({ openTask }),
  setSelectedListId: (selectedListId) => {
    set({ selectedListId });
    if (selectedListId) {
      AsyncStorage.setItem(LAST_LIST_STORAGE_KEY, selectedListId).catch(() => {});
    } else {
      AsyncStorage.removeItem(LAST_LIST_STORAGE_KEY).catch(() => {});
    }
  },
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setSelectedBoardId: (selectedBoardId) => set({ selectedBoardId }),
  clearFilters: () => set({ selectedListId: null, selectedTag: null }),
}));
