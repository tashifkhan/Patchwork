import { Platform } from 'react-native';

import { listTone } from '@/lib/smart-lists';
import { mixHex, type ThemeColors, withAlpha } from '@/lib/theme';

/** iOS system colours handed to columns in order, pink, orange, blue, purple as in the reference boards. */
const IOS_COLUMN = ['#FF2D55', '#FF9500', '#32ADE6', '#AF52DE', '#34C759', '#5856D6', '#FFCC00'];

/**
 * A column's soft tint and its dot. Android takes them from the theme's
 * Material You roles (so the wallpaper colours the board); iOS uses the
 * system colours washed out, the way Reminders tints its lists.
 */
export function columnTone(colors: ThemeColors, dark: boolean, index: number): { bg: string; dot: string } {
  if (Platform.OS === 'ios') {
    const color = IOS_COLUMN[index % IOS_COLUMN.length];
    return { bg: withAlpha(color, dark ? 0.2 : 0.13), dot: color };
  }
  const tone = listTone(colors, dark, index);
  return { bg: tone.fill, dot: tone.ink };
}

/** Priority chip colours: red for high, amber for medium, green for low. */
export function priorityTone(name: string | undefined, colors: ThemeColors, dark: boolean): { bg: string; ink: string } | null {
  if (!name) return null;
  const key = name.toLowerCase();
  const base = /high|critical|blocker|urgent/.test(key)
    ? colors.red
    : /medium|normal/.test(key)
      ? colors.orange
      : /low|minor|trivial/.test(key)
        ? colors.green
        : colors.accent;
  return {
    bg: withAlpha(base, dark ? 0.24 : 0.14),
    ink: dark ? mixHex(base, '#FFFFFF', 0.35) : mixHex(base, '#000000', 0.35),
  };
}
