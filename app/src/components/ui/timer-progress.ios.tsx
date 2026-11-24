import { Host, ProgressView } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { useMemo } from 'react';

import type { TimerProgressProps } from './timer-progress';

/** Native SwiftUI progress bar, tinted from the theme like the rest of the iOS controls. */
export function TimerProgress({ progress, color }: TimerProgressProps) {
  const modifiers = useMemo(() => [tint(color)], [color]);
  return (
    <Host matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }}>
      <ProgressView value={progress} modifiers={modifiers} />
    </Host>
  );
}
