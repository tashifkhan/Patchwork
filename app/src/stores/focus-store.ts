import { create } from 'zustand';

import type { LiveActivity } from 'expo-widgets';

import type { FocusActivityProps } from '@/widgets/FocusActivity';

interface FocusState {
  taskUid: string | null;
  taskTitle: string;
  startedAt: number | null;
  durationSeconds: number;
  paused: boolean;
  instance: LiveActivity<FocusActivityProps> | null;
  set: (partial: Partial<Omit<FocusState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  taskUid: null,
  taskTitle: '',
  startedAt: null,
  durationSeconds: 0,
  paused: false,
  instance: null,
  set: (partial) => set(partial),
  reset: () =>
    set({
      taskUid: null,
      taskTitle: '',
      startedAt: null,
      durationSeconds: 0,
      paused: false,
      instance: null,
    }),
}));
