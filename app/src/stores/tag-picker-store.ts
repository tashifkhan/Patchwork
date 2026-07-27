import { create } from 'zustand';

import { matchTagIgnoringCase, normalizeTags } from '@/lib/tags';

type ApplyTags = (tags: string[]) => void;

// Bridges the full-screen tag picker (/tags) back to whichever TaskForm opened
// it. The form passes its setter as `onApply`; the picker calls it live so
// selections flow straight back into the form's state.
interface TagPickerState {
  available: string[];
  selected: string[];
  onApply: ApplyTags | null;
  open: (available: string[], selected: string[], onApply: ApplyTags) => void;
  toggle: (tag: string) => void;
  addTag: (tag: string) => void;
  /**
   * Clears the bridge when the picker closes. No-ops unless `owner` is still
   * the active handler, so a picker unmounting *after* the next one has opened
   * can't wipe the newer form's selection.
   */
  release: (owner: ApplyTags | null) => void;
}

export const useTagPickerStore = create<TagPickerState>((set, get) => ({
  available: [],
  selected: [],
  onApply: null,
  open: (available, selected, onApply) =>
    set({
      available: normalizeTags(available),
      selected: normalizeTags(selected),
      onApply,
    }),
  toggle: (tag) => {
    const { selected } = get();
    const existing = matchTagIgnoringCase(selected, tag);
    const next = existing
      ? selected.filter((candidate) => candidate !== existing)
      : [...selected, tag];
    set({ selected: next });
    get().onApply?.(next);
  },
  addTag: (raw) => {
    const tag = normalizeTags([raw])[0];
    if (!tag) return;
    const { available, selected } = get();
    // Reuse an existing tag that differs only by case, so the user doesn't end
    // up with "work" and "Work" as two separate CalDAV categories.
    const canonical = matchTagIgnoringCase(available, tag) ?? tag;
    const nextAvailable = available.includes(canonical)
      ? available
      : [...available, canonical].sort((a, b) => a.localeCompare(b));
    const nextSelected = matchTagIgnoringCase(selected, canonical)
      ? selected
      : [...selected, canonical];
    set({ available: nextAvailable, selected: nextSelected });
    get().onApply?.(nextSelected);
  },
  release: (owner) => {
    if (get().onApply !== owner) return;
    set({ available: [], selected: [], onApply: null });
  },
}));
