import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export type FoldState = 'flat' | 'halfOpened';

export interface FoldInfo {
  /** `flat` when fully open, `halfOpened` in book or tabletop posture. */
  state: FoldState;
  /** `vertical` hinge = book (left/right panes); `horizontal` = tabletop. */
  orientation: 'vertical' | 'horizontal';
  /** The fold splits the window into two logical areas. */
  isSeparating: boolean;
  /** The hinge hides content (a physical gap), so nothing may sit under it. */
  occludes: boolean;
  /** Window-relative hinge rectangle in dp. */
  bounds: { x: number; y: number; width: number; height: number };
}

type NativeModule = {
  getFold(): FoldInfo | null;
  addListener(event: 'onFoldChange', listener: (e: { fold: FoldInfo | null }) => void): EventSubscription;
};

// Optional so a dev client built before this module existed keeps running;
// it just never reports a fold.
const native = requireOptionalNativeModule<NativeModule>('PatchworkWindow');

export function getFold(): FoldInfo | null {
  return native?.getFold() ?? null;
}

export function addFoldListener(listener: (fold: FoldInfo | null) => void): EventSubscription | null {
  return native?.addListener('onFoldChange', (e) => listener(e.fold)) ?? null;
}
