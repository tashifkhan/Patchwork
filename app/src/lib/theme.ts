/**
 * Concrete color tokens injected at runtime via react-native-css's
 * `VariableContextProvider`. We do NOT rely on CSS `light-dark()` /
 * `platformColor()` resolving through Tailwind's `@theme` var indirection —
 * that chain does not resolve reliably in this stack, which left neutral text
 * rendering near-black on dark backgrounds. Instead the active scheme (and, on
 * Android, the Material You wallpaper palette) is resolved in JS and pushed in
 * as real color strings so every `text-sf-*` / `bg-sf-*` utility and every
 * `useCSSVariable('--sf-*')` read gets a guaranteed-visible value.
 */

export type SchemeName = 'light' | 'dark';

export interface ThemeColors {
  /** Accent / primary. Mapped to the `--sf-blue` slot used across the app. */
  accent: string;
  green: string;
  red: string;
  orange: string;
  yellow: string;
  purple: string;
  gray: string;
  gray2: string;
  gray3: string;
  /** Primary label color. */
  text: string;
  /** Secondary label color. */
  text2: string;
  /** Tertiary label color. */
  text3: string;
  /** Screen background. */
  bg: string;
  /** Grouped / card background. */
  bg2: string;
  /** Elevated background. */
  bg3: string;
  separator: string;
  /** Foreground color to use on top of `accent` (white on iOS, onPrimary on Android). */
  onAccent: string;
  /** Background of a selected control container — the tab-bar pill (M3 secondaryContainer). */
  selectionBg: string;
  /** Content color on top of `selectionBg`. */
  onSelectionBg: string;
}

// Apple system colors (resolved values, not platformColor) so they render
// correctly regardless of how the CSS layer resolves color-scheme.
const APPLE_LIGHT: ThemeColors = {
  accent: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  purple: '#AF52DE',
  gray: '#8E8E93',
  gray2: '#AEAEB2',
  gray3: '#C7C7CC',
  text: '#000000',
  text2: 'rgba(60,60,67,0.6)',
  text3: 'rgba(60,60,67,0.3)',
  bg: '#FFFFFF',
  bg2: '#F2F2F7',
  bg3: '#FFFFFF',
  separator: 'rgba(60,60,67,0.29)',
  onAccent: '#FFFFFF',
  selectionBg: '#E5E5EA',
  onSelectionBg: '#007AFF',
};

const APPLE_DARK: ThemeColors = {
  accent: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  purple: '#BF5AF2',
  gray: '#8E8E93',
  gray2: '#636366',
  gray3: '#48484A',
  text: '#FFFFFF',
  text2: 'rgba(235,235,245,0.6)',
  text3: 'rgba(235,235,245,0.3)',
  bg: '#000000',
  bg2: '#1C1C1E',
  bg3: '#2C2C2E',
  separator: 'rgba(84,84,88,0.6)',
  onAccent: '#FFFFFF',
  selectionBg: '#3A3A3C',
  onSelectionBg: '#0A84FF',
};

export function appleColors(scheme: SchemeName, accent?: string | null): ThemeColors {
  const base = scheme === 'dark' ? APPLE_DARK : APPLE_LIGHT;
  // The selected-tab content tint follows the active accent on iOS.
  return accent ? { ...base, accent, onSelectionBg: accent } : base;
}

/**
 * Push the dark-mode surfaces to true black for AMOLED displays. The accent,
 * text, and semantic colors are left untouched so the dynamic palette still
 * reads correctly; only the background stack and separator collapse toward
 * #000 with a hair of separation between layers so cards stay legible.
 */
export function pureBlackColors(c: ThemeColors): ThemeColors {
  return {
    ...c,
    bg: '#000000',
    bg2: '#0B0B0D',
    bg3: '#161618',
    separator: 'rgba(120,120,128,0.30)',
  };
}

/**
 * Subset of `@expo/ui/jetpack-compose`'s MaterialColors that we consume.
 * Declared locally so this module is import-safe on every platform (the
 * jetpack-compose runtime only exists on Android).
 */
export interface MaterialPalette {
  primary: string;
  onPrimary: string;
  error: string;
  tertiary: string;
  /** Wallpaper-derived tint used for the navigation-bar selected pill. */
  secondaryContainer: string;
  onSecondaryContainer: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  background: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  surfaceVariant: string;
}

/** Map a Material 3 (Material You) palette onto our semantic theme tokens. */
export function materialColors(m: MaterialPalette, scheme: SchemeName): ThemeColors {
  // Keep success/warning semantics readable since Material 3 has no dedicated
  // green/orange role; the rest follow the dynamic palette.
  return {
    accent: m.primary,
    green: scheme === 'dark' ? '#7FD98C' : '#2E7D32',
    red: m.error,
    orange: scheme === 'dark' ? '#FFB95C' : '#E8730C',
    yellow: scheme === 'dark' ? '#FFE066' : '#C9A200',
    purple: m.tertiary,
    gray: m.outline,
    gray2: m.outlineVariant,
    gray3: m.surfaceVariant,
    text: m.onSurface,
    text2: m.onSurfaceVariant,
    text3: m.outline,
    bg: m.background,
    bg2: m.surfaceContainer,
    bg3: m.surfaceContainerHigh,
    separator: m.outlineVariant,
    onAccent: m.onPrimary,
    selectionBg: m.secondaryContainer,
    onSelectionBg: m.onSecondaryContainer,
  };
}

/**
 * Flatten ThemeColors into the CSS-variable map consumed by react-native-css.
 * We set both the raw `--sf-*` tokens (read by `useCSSVariable`) and the
 * Tailwind `--color-sf-*` tokens (read by the generated `text-sf-*`/`bg-sf-*`
 * utilities) to the same concrete values, collapsing the broken var->var->fn
 * indirection into a single direct lookup.
 */
export function themeVariables(c: ThemeColors): Record<`--${string}`, string> {
  const map: Record<string, string> = {
    'sf-blue': c.accent,
    'sf-green': c.green,
    'sf-red': c.red,
    'sf-orange': c.orange,
    'sf-yellow': c.yellow,
    'sf-purple': c.purple,
    'sf-gray': c.gray,
    'sf-gray-2': c.gray2,
    'sf-gray-3': c.gray3,
    'sf-text': c.text,
    'sf-text-2': c.text2,
    'sf-text-3': c.text3,
    'sf-bg': c.bg,
    'sf-bg-2': c.bg2,
    'sf-bg-3': c.bg3,
    'sf-separator': c.separator,
    'sf-on-accent': c.onAccent,
    'sf-selection': c.selectionBg,
    'sf-on-selection': c.onSelectionBg,
  };

  const out: Record<`--${string}`, string> = {};
  for (const [key, value] of Object.entries(map)) {
    out[`--${key}`] = value;
    out[`--color-${key}`] = value;
  }
  return out;
}
