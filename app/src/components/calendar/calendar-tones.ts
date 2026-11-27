import type { ThemeColors } from '@/lib/theme';
import { mixHex } from '@/lib/theme';

/**
 * A phone calendar event's colours on Android: a soft wash of its calendar's
 * colour, so events read as "from your calendar" next to the to-dos' list tones.
 */
export function eventTone(colors: ThemeColors, dark: boolean, color: string | null) {
  const base = color && /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7) : colors.gray;
  return {
    fill: mixHex(colors.bg2, base, dark ? 0.32 : 0.22),
    ink: dark ? mixHex(base, '#FFFFFF', 0.55) : mixHex(base, '#000000', 0.5),
  };
}
