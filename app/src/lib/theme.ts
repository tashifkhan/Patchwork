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

import { paletteById, type ColorPalette } from '@/lib/palettes';

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
  /** Alias for error/danger actions (same as red). */
  danger: string;
  /** Soft surface used behind circular settings icons (M3 primaryContainer). */
  primaryContainer: string;
  /** Content on primaryContainer. */
  onPrimaryContainer: string;
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
  danger: '#FF3B30',
  primaryContainer: '#D6E4FF',
  onPrimaryContainer: '#003A8C',
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
  danger: '#FF453A',
  primaryContainer: '#003A8C',
  onPrimaryContainer: '#D6E4FF',
};

function withAccent(base: ThemeColors, accent?: string | null): ThemeColors {
  if (!accent) return base;
  const dark = base.bg === APPLE_DARK.bg || base.bg === '#000000';
  return {
    ...base,
    accent,
    onSelectionBg: accent,
    // Soft tint of the surface — mostly bg, a little accent (M3 primaryContainer).
    primaryContainer: mixHex(base.bg, accent, dark ? 0.22 : 0.14),
    onPrimaryContainer: dark
      ? mixHex(accent, '#FFFFFF', 0.28)
      : mixHex(accent, '#000000', 0.42),
    selectionBg: mixHex(base.bg2, accent, dark ? 0.26 : 0.14),
  };
}

export function appleColors(
  scheme: SchemeName,
  accent?: string | null,
  paletteId?: string | null
): ThemeColors {
  const palette = paletteById(paletteId);
  if (palette) {
    return colorsFromPalette(palette, scheme);
  }
  const base = scheme === 'dark' ? APPLE_DARK : APPLE_LIGHT;
  return withAccent(base, accent);
}

/** Build ThemeColors from a fixed curated palette (Paisa-style). */
export function colorsFromPalette(palette: ColorPalette, scheme: SchemeName): ThemeColors {
  const dark = scheme === 'dark';
  const accent = dark ? palette.primaryDark : palette.primaryLight;
  const bg = dark ? palette.backgroundDark : palette.backgroundLight;
  const bg2 = dark ? palette.surfaceDark : palette.surfaceLight;
  const bg3 = dark ? palette.elevatedDark : palette.elevatedLight;
  const text = dark ? '#E6E1E5' : '#1C1B1F';
  const text2 = dark ? '#CAC4D0' : '#49454F';
  // Containers stay mostly surface-colored with a light accent wash so
  // picking Forest/Ocean/etc. tints chrome instead of flooding it solid green/blue.
  const primaryContainer = mixHex(bg, accent, dark ? 0.22 : 0.14);
  const selectionBg = mixHex(bg2, accent, dark ? 0.26 : 0.14);
  return {
    accent,
    green: dark ? '#7FD98C' : '#2E7D32',
    red: dark ? '#FFB4AB' : '#BA1A1A',
    orange: dark ? '#FFB95C' : '#E8730C',
    yellow: dark ? '#FFE066' : '#C9A200',
    purple: dark ? '#D0BCFF' : '#6750A4',
    gray: dark ? '#938F99' : '#79747E',
    gray2: dark ? '#49454F' : '#CAC4D0',
    gray3: dark ? '#2B2930' : '#E7E0EC',
    text,
    text2,
    text3: dark ? '#938F99' : '#79747E',
    bg,
    bg2,
    bg3,
    separator: dark ? 'rgba(147,143,153,0.4)' : 'rgba(121,116,126,0.35)',
    onAccent: isLightColor(accent) ? '#1C1B1F' : '#FFFFFF',
    selectionBg,
    onSelectionBg: accent,
    danger: dark ? '#FFB4AB' : '#BA1A1A',
    primaryContainer,
    onPrimaryContainer: dark
      ? mixHex(accent, '#FFFFFF', 0.28)
      : mixHex(accent, '#000000', 0.42),
  };
}

/**
 * Pure-black AMOLED surfaces (mirrors Paisa `toAmoled`). Floors base surfaces
 * to black while keeping subtle step elevation so cards stay legible.
 */
export function pureBlackColors(c: ThemeColors): ThemeColors {
  const bg = '#000000';
  const bg2 = '#0D0D0D';
  const bg3 = '#1A1A1A';
  return {
    ...c,
    bg,
    bg2,
    bg3,
    separator: 'rgba(120,120,128,0.28)',
    // Re-tint containers from pure black so they don't keep a muddy palette wash.
    primaryContainer: mixHex(bg, c.accent, 0.2),
    selectionBg: mixHex(bg2, c.accent, 0.24),
  };
}

/**
 * Stronger text / outline contrast for accessibility (Paisa high-contrast mode).
 */
export function highContrastColors(c: ThemeColors, scheme: SchemeName): ThemeColors {
  if (scheme === 'dark') {
    return {
      ...c,
      text: '#FFFFFF',
      text2: '#E8E0EC',
      text3: '#D0C4D8',
      separator: 'rgba(208,196,216,0.5)',
    };
  }
  return {
    ...c,
    text: '#000000',
    text2: '#2C2C2C',
    text3: '#424242',
    separator: 'rgba(66,66,66,0.45)',
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
  primaryContainer?: string;
  onPrimaryContainer?: string;
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
export function materialColors(raw: MaterialPalette, scheme: SchemeName): ThemeColors {
  // `@expo/ui` hands colors back as `#RRGGBBAA`. Screens build tints by
  // appending an alpha byte (`${colors.green}18`), which turns an 8-digit hex
  // into an invalid 10-digit one, so drop the redundant opaque alpha here.
  const m = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, opaqueHex(value)])
  ) as unknown as MaterialPalette;
  const dark = scheme === 'dark';
  const primaryContainer = tonalContainer(
    m.primaryContainer ?? m.primary,
    m.primary,
    m.background,
    scheme
  );
  const selection = tonalContainer(m.secondaryContainer, m.primary, m.surfaceContainer, scheme);
  return {
    accent: m.primary,
    green: dark ? '#7FD98C' : '#2E7D32',
    red: m.error,
    orange: dark ? '#FFB95C' : '#E8730C',
    yellow: dark ? '#FFE066' : '#C9A200',
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
    selectionBg: selection.container,
    onSelectionBg: selection.replaced ? selection.content : m.onSecondaryContainer,
    danger: m.error,
    primaryContainer: primaryContainer.container,
    onPrimaryContainer: primaryContainer.replaced
      ? primaryContainer.content
      : (m.onPrimaryContainer ?? m.onSecondaryContainer),
  };
}

/**
 * Material You containers sit near tone 90 in light mode and tone 30 in dark.
 * Some system palettes (the Android 15 emulator's, for one) return mid-tone
 * containers instead, which turns the nav pill and every tonal chip into a
 * flat slate with no visible accent. When the system container is on the wrong
 * side of mid-grey for the scheme, rebuild it as an accent wash over the
 * surface, which is what a tonal container is meant to look like.
 */
function tonalContainer(
  container: string,
  accent: string,
  surface: string,
  scheme: SchemeName
): { container: string; content: string; replaced: boolean } {
  const lum = luminance(container);
  const dark = scheme === 'dark';
  const wrongTone = lum == null ? false : dark ? lum > 0.42 : lum < 0.62;
  if (!wrongTone) return { container, content: accent, replaced: false };
  return {
    container: mixHex(surface, accent, dark ? 0.32 : 0.16),
    content: dark ? mixHex(accent, '#FFFFFF', 0.55) : mixHex(accent, '#000000', 0.15),
    replaced: true,
  };
}

/** `#RRGGBBFF` → `#RRGGBB`. Translucent values keep their alpha. */
function opaqueHex(value: string): string {
  if (typeof value !== 'string') return value;
  if (/^#[0-9a-fA-F]{8}$/.test(value) && value.slice(7).toUpperCase() === 'FF') {
    return value.slice(0, 7);
  }
  return value;
}

function luminance(hex: string): number | null {
  const p = parseHex(hex);
  if (!p) return null;
  return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
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

// ── helpers ──────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.replace('#', '').slice(0, 6);
  if (raw.length !== 6) return null;
  const n = Number.parseInt(raw, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Mix `a` toward `b` by `amount` (0 = a, 1 = b). */
function mixHex(a: string, b: string, amount: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const t = Math.max(0, Math.min(1, amount));
  return toHex(
    pa[0] + (pb[0] - pa[0]) * t,
    pa[1] + (pb[1] - pa[1]) * t,
    pa[2] + (pb[2] - pa[2]) * t
  );
}

function isLightColor(hex: string): boolean {
  const p = parseHex(hex);
  if (!p) return false;
  // Relative luminance approximation
  const l = (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
  return l > 0.65;
}
