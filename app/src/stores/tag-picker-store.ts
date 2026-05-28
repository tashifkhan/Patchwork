import { create } from 'zustand';

// Bridges the full-screen tag picker (/tags) back to whichever TaskForm opened
// it. The form passes its setter as `onApply`; the picker calls it live so
// selections flow straight back into the form's state.
interface TagPickerState {
  available: string[];
  selected: string[];
  onApply: ((tags: string[]) => void) | null;
  open: (available: string[], selected: string[], onApply: (tags: string[]) => void) => void;
  toggle: (tag: string) => void;
  addTag: (tag: string) => void;
  reset: () => void;
}

export const useTagPickerStore = create<TagPickerState>((set, get) => ({
  available: [],
  selected: [],
  onApply: null,
  open: (available, selected, onApply) => set({ available, selected: [...selected], onApply }),
  toggle: (tag) => {
    const selected = get().selected.includes(tag)
      ? get().selected.filter((t) => t !== tag)
      : [...get().selected, tag];
    set({ selected });
    get().onApply?.(selected);
  },
  addTag: (raw) => {
    const tag = raw.trim();
    if (!tag) return;
    const { available, selected } = get();
    const nextAvailable = available.includes(tag) ? available : [...available, tag].sort();
    const nextSelected = selected.includes(tag) ? selected : [...selected, tag];
    set({ available: nextAvailable, selected: nextSelected });
    get().onApply?.(nextSelected);
  },
  reset: () => set({ available: [], selected: [], onApply: null }),
}));
