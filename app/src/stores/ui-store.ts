import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/** Stored separately from the in-memory list filter so widgets can read it across cold starts. */
export const LAST_LIST_STORAGE_KEY = 'caldav-todo.last-list';

interface UiState {
  selectedListId: string | null;
  selectedTag: string | null;
  selectedBoardId: number | null;
  setSelectedListId: (listId: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedBoardId: (boardId: number | null) => void;
  clearFilters: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedListId: null,
  selectedTag: null,
  selectedBoardId: null,
  setSelectedListId: (selectedListId) => {
    set({ selectedListId });
    if (selectedListId) {
      AsyncStorage.setItem(LAST_LIST_STORAGE_KEY, selectedListId).catch(() => {});
    }
  },
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setSelectedBoardId: (selectedBoardId) => set({ selectedBoardId }),
  clearFilters: () => set({ selectedListId: null, selectedTag: null }),
}));
