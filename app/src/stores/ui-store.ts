import { create } from 'zustand';

interface UiState {
  selectedListId: string | null;
  selectedTag: string | null;
  setSelectedListId: (listId: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  clearFilters: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedListId: null,
  selectedTag: null,
  setSelectedListId: (selectedListId) => set({ selectedListId }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  clearFilters: () => set({ selectedListId: null, selectedTag: null }),
}));
