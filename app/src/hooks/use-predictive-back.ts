import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

import { addBackGestureListener, claimBack, releaseBack } from '../../modules/patchwork-window/src';

let nextId = 1;

export interface PredictiveBackHandlers {
  /** The swipe moved. `progress` runs 0 to 1. */
  onProgress?: (progress: number, edge: 'left' | 'right') => void;
  /** The finger went back the other way and let go: restore. */
  onCancel?: () => void;
  /** Back happened (gesture finished, or the 3-button back). */
  onBack: () => void;
}

/**
 * Android predictive back for an in-app surface, like the FAB menu. While
 * `active`, the system back gesture belongs to this surface: it gets the
 * swipe's progress to animate with, then either a cancel or the back.
 *
 * Progress needs Android 14+. Older Android, and dev clients built before
 * the native side existed, still get `onBack` through BackHandler.
 */
export function usePredictiveBack(active: boolean, handlers: PredictiveBackHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!active || Platform.OS !== 'android') return;
    const id = nextId++;
    let released = false;
    let fallback: { remove: () => void } | null = null;

    const gesture = addBackGestureListener((e) => {
      if (e.id !== id) return;
      if (e.phase === 'started' || e.phase === 'progress') ref.current.onProgress?.(e.progress, e.edge);
      else if (e.phase === 'cancelled') ref.current.onCancel?.();
      else ref.current.onBack();
    });

    void claimBack(id).then((claimed) => {
      if (claimed || released) return;
      gesture?.remove();
      fallback = BackHandler.addEventListener('hardwareBackPress', () => {
        ref.current.onBack();
        return true;
      });
    });

    return () => {
      released = true;
      gesture?.remove();
      fallback?.remove();
      releaseBack(id);
    };
  }, [active]);
}
