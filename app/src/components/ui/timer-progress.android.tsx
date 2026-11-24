import { Host, LinearWavyProgressIndicator } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import type { TimerProgressProps } from './timer-progress';

/**
 * M3 Expressive wavy linear indicator. Determinate while a block counts
 * down; without `progress` it's the indeterminate wave, which reads as
 * "running" for the stopwatch.
 */
export function TimerProgress({ progress, color, trackColor }: TimerProgressProps) {
  return (
    <Host style={{ alignSelf: 'stretch', height: 16 }}>
      <LinearWavyProgressIndicator
        progress={progress ?? undefined}
        color={color}
        trackColor={trackColor}
        modifiers={[fillMaxWidth()]}
      />
    </Host>
  );
}
