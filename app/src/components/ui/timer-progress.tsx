import { View } from 'react-native';

export interface TimerProgressProps {
  /** 0–1, or null for an indeterminate (stopwatch) indicator. */
  progress: number | null;
  color: string;
  trackColor: string;
}

/**
 * Focus timer progress. Web fallback: a plain bar. Android draws the M3
 * Expressive wavy indicator, iOS the native SwiftUI linear progress view.
 */
export function TimerProgress({ progress, color, trackColor }: TimerProgressProps) {
  return (
    <View style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: trackColor, overflow: 'hidden' }}>
      <View style={{ width: `${(progress ?? 0) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}
