import { Host, Slider as ComposeSlider } from '@expo/ui/jetpack-compose';

import { useTheme } from '@/components/theme/context';

import type { SliderProps } from './slider';

export type { SliderProps };

/**
 * Material 3 slider tinted from the app theme.
 *
 * The universal `@expo/ui` slider renders with Compose's own color scheme, so
 * it stays Material You lavender no matter which palette the user picked. The
 * jetpack-compose slider takes `colors` (M3 `SliderDefaults.colors()`), which
 * is the only way to pull it onto the app accent.
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

  // Compose counts the ticks *between* the endpoints, not the increment.
  const steps = step && step > 0 ? Math.max(0, Math.round((max - min) / step) - 1) : 0;

  return (
    <Host style={{ height }}>
      <ComposeSlider
        value={value}
        min={min}
        max={max}
        steps={steps}
        enabled={!disabled}
        colors={{
          thumbColor: colors.accent,
          activeTrackColor: colors.accent,
          inactiveTrackColor: colors.gray3,
          activeTickColor: colors.onAccent,
          inactiveTickColor: colors.text3,
        }}
        onValueChange={(v) => onValueChange(step && step > 0 ? Math.round(v / step) * step : v)}
      />
    </Host>
  );
}
