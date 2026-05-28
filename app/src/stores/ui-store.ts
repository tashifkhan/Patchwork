import { create } from 'zustand';

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
  setSelectedListId: (selectedListId) => set({ selectedListId }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setSelectedBoardId: (selectedBoardId) => set({ selectedBoardId }),
  clearFilters: () => set({ selectedListId: null, selectedTag: null }),
}));
