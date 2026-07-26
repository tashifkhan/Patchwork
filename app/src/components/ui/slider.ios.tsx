import { Host, Slider as UniversalSlider } from '@expo/ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { useMemo } from 'react';

import { useTheme } from '@/components/theme/context';

import type { SliderProps } from './slider';

export type { SliderProps };

/**
 * SwiftUI slider tinted from the app theme.
 *
 * Without `tint` it paints itself in the system accent (iOS blue), which is
 * wrong as soon as the user picks any other palette.
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 1,
  step,
  disabled,
  height = 36,
}: SliderProps) {
  const { colors } = useTheme();
  const modifiers = useMemo(() => [tint(colors.accent)], [colors.accent]);

  return (
    <Host style={{ height }}>
      <UniversalSlider
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        modifiers={modifiers}
        onValueChange={onValueChange}
      />
    </Host>
  );
}
