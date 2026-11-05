import { useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { addFoldListener, getFold, type FoldInfo } from '../../modules/patchwork-window/src';

/**
 * Material 3 window size classes (dp widths). iOS uses the same numbers in
 * points: an iPhone is compact, an iPad in a narrow Split View or Slide Over
 * is compact or medium, a full-screen iPad is expanded or large.
 */
export type WidthClass = 'compact' | 'medium' | 'expanded' | 'large';

export function widthClassOf(width: number): WidthClass {
  if (width < 600) return 'compact';
  if (width < 840) return 'medium';
  if (width < 1200) return 'expanded';
  return 'large';
}

/**
 * Width at which list + detail sit side by side. Lower than M3's 840dp
 * "expanded" so the inner screens of book-style foldables (Pixel Fold, Galaxy
 * Z Fold: about 700 to 760dp wide) and an iPad mini in portrait (744pt) get
 * two panes, like Gmail and Files do on those devices.
 */
export const TWO_PANE_MIN_WIDTH = 700;

/** M3 Expressive collapsed navigation rail width (dp). */
export const NAVIGATION_RAIL_WIDTH = 96;

/** Comfortable reading width for a single column of rows on a big screen. */
export const READABLE_MAX_WIDTH = 720;

// One shared subscription to the native fold stream, however many screens ask.
let currentFold: FoldInfo | null = getFold();
const listeners = new Set<() => void>();
let subscription: ReturnType<typeof addFoldListener> = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!subscription) {
    subscription = addFoldListener((fold) => {
      currentFold = fold;
      for (const l of listeners) l();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.remove();
      subscription = null;
    }
  };
}

/** The window's fold on Android foldables; always null on iOS and web. */
export function useFold(): FoldInfo | null {
  return useSyncExternalStore(subscribe, () => currentFold, () => null);
}

export interface AdaptiveLayout {
  width: number;
  height: number;
  widthClass: WidthClass;
  landscape: boolean;
  fold: FoldInfo | null;
  /** Show list and detail side by side. */
  twoPane: boolean;
  /**
   * Width of the leading (list) pane when `twoPane`. On a foldable with a
   * vertical hinge it ends exactly at the hinge so no row is cut in half.
   */
  listPaneWidth: number;
  /** Gap between panes: the hinge width when it hides content, else 0. */
  hingeGap: number;
  /** Tabletop posture: half-opened with a horizontal hinge. */
  tabletop: boolean;
  /** Android: navigation rail instead of a bottom bar. */
  navigationRail: boolean;
}

/** Window-size and posture facts every screen lays itself out from. */
export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height } = useWindowDimensions();
  const fold = useFold();
  const widthClass = widthClassOf(width);

  const navigationRail = Platform.OS === 'android' && widthClass !== 'compact';
  // Any vertical fold in the window. A fully open Pixel Fold reports its fold
  // as not separating (the screen is continuous), but when the window is
  // wide enough for two panes the fold is still the natural divider.
  const verticalFold = fold?.orientation === 'vertical' ? fold : null;
  const twoPane = (verticalFold?.isSeparating ?? false) || width >= TWO_PANE_MIN_WIDTH;
  const verticalHinge = twoPane ? verticalFold : null;

  let listPaneWidth: number;
  let hingeGap = 0;
  const hingePane = verticalHinge
    ? verticalHinge.bounds.x - (navigationRail ? NAVIGATION_RAIL_WIDTH : 0)
    : 0;
  // Use the fold only if it leaves the list a usable width.
  if (verticalHinge && hingePane >= 280) {
    // Book posture or a flat fold with a real hinge: the hinge is the divider.
    // Bounds are window-relative and the rail sits at the window's leading
    // edge, so the list pane is what's left between the rail and the hinge.
    listPaneWidth = hingePane;
    hingeGap = verticalHinge.occludes ? verticalHinge.bounds.width : 0;
  } else {
    // M3 list-detail: a fixed list pane, the detail takes the rest.
    listPaneWidth = widthClass === 'large' ? 412 : widthClass === 'expanded' ? 380 : 340;
  }

  return {
    width,
    height,
    widthClass,
    landscape: width > height,
    fold,
    twoPane,
    listPaneWidth,
    hingeGap,
    tabletop: fold?.state === 'halfOpened' && fold.orientation === 'horizontal',
    navigationRail,
  };
}
