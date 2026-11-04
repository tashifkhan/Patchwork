import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

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
  openTaskUid: string | null;
  requestOpenTask: (uid: string | null) => void;
  setSelectedListId: (listId: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedBoardId: (boardId: number | null) => void;
  clearFilters: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedListId: null,
  selectedTag: null,
  selectedBoardId: null,
  openTaskUid: null,
  requestOpenTask: (openTaskUid) => set({ openTaskUid }),
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
