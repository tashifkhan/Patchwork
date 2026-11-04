import { create } from 'zustand';

/**
 * Chrome state for the Android floating navbar:
 * scroll-driven minimize + search field text when Search is active.
 */
interface TabBarChromeState {
  minimized: boolean;
  lastScrollY: number;
  floatingSearchQuery: string;
  setMinimized: (minimized: boolean) => void;
  expand: () => void;
  /** Feed vertical scroll offsets from tab root screens. */
  reportScroll: (y: number) => void;
  setFloatingSearchQuery: (query: string) => void;
}

export const useTabBarChromeStore = create<TabBarChromeState>((set, get) => ({
  minimized: false,
  lastScrollY: 0,
  floatingSearchQuery: '',
  setMinimized: (minimized) => set({ minimized }),
  expand: () => set({ minimized: false }),
  reportScroll: (y) => {
    const { lastScrollY, minimized } = get();
    const dy = y - lastScrollY;

    // Near top always expand.
    if (y < 20) {
      if (minimized || lastScrollY !== y) set({ minimized: false, lastScrollY: y });
      return;
    }

    // Threshold avoids jitter from small bounces.
    if (dy > 8 && !minimized) {
      set({ minimized: true, lastScrollY: y });
    } else if (dy < -8 && minimized) {
      set({ minimized: false, lastScrollY: y });
    } else {
      set({ lastScrollY: y });
    }
  },
  setFloatingSearchQuery: (floatingSearchQuery) => set({ floatingSearchQuery }),
}));
