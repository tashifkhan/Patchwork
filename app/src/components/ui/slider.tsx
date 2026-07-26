import { Host, Slider as UniversalSlider } from '@expo/ui';

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Increment size, e.g. `5` over `0..60` gives 0, 5, … 60. */
  step?: number;
  disabled?: boolean;
  /** Height of the native host. */
  height?: number;
}

/**
 * Themed slider.
 *
 * The platform files carry the tinting: `.android` uses the Compose M3 slider
 * with explicit `colors` (the universal one paints itself from the system
 * Material You palette, which ignores the app's chosen accent), and `.ios`
 * applies a SwiftUI `tint`. This base file is the untinted web/fallback.
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
  return (
    <Host style={{ height }}>
      <UniversalSlider
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={onValueChange}
      />
    </Host>
  );
}
