import { argbFromHex, hexFromArgb, Hct, TonalPalette } from '@material/material-color-utilities';

import type { ColorPalette } from '@/lib/palettes';
import { colorsFromPalette, type SchemeName, type SurfaceLadder, type ThemeColors, withLadder } from '@/lib/theme';

/**
 * Android's Material 3 tone-based surfaces for the curated palettes.
 *
 * Every surface is a fixed tone of one neutral palette, taken from the
 * palette's background hue with its chroma capped, so Paper stays warm,
 * Nord stays blue-grey, and every palette gets the same steps. Elevation
 * comes from tone: a container sits a few tones off the screen instead of
 * casting a shadow.
 */

type Mode = 'light' | 'dark' | 'black';

/** Tones per role, from the M3 spec. Pure black shifts the dark ladder down. */
const TONES: Record<Mode, Record<keyof SurfaceLadder, number>> = {
  light: {
    surface: 98,
    surfaceDim: 87,
    surfaceBright: 98,
    surfaceContainerLowest: 100,
    surfaceContainerLow: 96,
    surfaceContainer: 94,
    surfaceContainerHigh: 92,
    surfaceContainerHighest: 90,
  },
  dark: {
    surface: 6,
    surfaceDim: 6,
    surfaceBright: 24,
    surfaceContainerLowest: 4,
    surfaceContainerLow: 10,
    surfaceContainer: 12,
    surfaceContainerHigh: 17,
    surfaceContainerHighest: 22,
  },
  black: {
    surface: 0,
    surfaceDim: 0,
    surfaceBright: 17,
    surfaceContainerLowest: 0,
    surfaceContainerLow: 4,
    surfaceContainer: 6,
    surfaceContainerHigh: 10,
    surfaceContainerHighest: 14,
  },
};

/** Surfaces keep a hint of the palette's hue, never a wash. */
const MAX_NEUTRAL_CHROMA = 6;
/** M3's secondary palette chroma: a calm version of the accent hue. */
const SECONDARY_CHROMA = 16;
/**
 * Dark containers sit on a near-black surface, where M3's chroma reads as a
 * bright slab. They stay soft: enough hue to read as the palette, no more.
 */
const DARK_PRIMARY_CONTAINER_CHROMA = 20;
const DARK_SECONDARY_CHROMA = 10;

function hct(hex: string) {
  return Hct.fromInt(argbFromHex(hex));
}

function ladderOf(neutral: TonalPalette, mode: Mode): SurfaceLadder {
  const tones = TONES[mode];
  const out = {} as SurfaceLadder;
  for (const role of Object.keys(tones) as (keyof SurfaceLadder)[]) {
    out[role] = hexFromArgb(neutral.tone(tones[role]));
  }
  return out;
}

/** The neutral palette behind a surface colour: its hue, chroma capped. */
function neutralFrom(hex: string): TonalPalette {
  const color = hct(hex);
  return TonalPalette.fromHueAndChroma(color.hue, Math.min(color.chroma, MAX_NEUTRAL_CHROMA));
}

/**
 * Primary and secondary containers from the accent's own hue, at the tones M3
 * uses (90 and 10 in light, 30 and 90 in dark). They replace the old mixes of
 * the accent into the background.
 */
function tonalContainers(accent: string, dark: boolean) {
  const color = hct(accent);
  // A grey accent (Monochrome) has no real hue, so it keeps its own low
  // chroma rather than being boosted into an arbitrary colour.
  const lightChroma = color.chroma < 8 ? color.chroma : Math.max(color.chroma, 36);
  const primary = TonalPalette.fromHueAndChroma(
    color.hue,
    dark ? Math.min(color.chroma, DARK_PRIMARY_CONTAINER_CHROMA) : lightChroma,
  );
  const secondary = TonalPalette.fromHueAndChroma(
    color.hue,
    Math.min(color.chroma, dark ? DARK_SECONDARY_CHROMA : SECONDARY_CHROMA),
  );
  const [container, onContainer] = dark ? [30, 90] : [90, 10];
  return {
    primaryContainer: hexFromArgb(primary.tone(container)),
    onPrimaryContainer: hexFromArgb(primary.tone(onContainer)),
    selectionBg: hexFromArgb(secondary.tone(container)),
    onSelectionBg: hexFromArgb(secondary.tone(onContainer)),
  };
}

/**
 * A curated palette on Android. The hand-picked accent and text colours stay;
 * the surfaces and the accent containers are generated.
 */
export function tonalColorsFromPalette(palette: ColorPalette, scheme: SchemeName): ThemeColors {
  const dark = scheme === 'dark';
  const base = colorsFromPalette(palette, scheme);
  // The light background carries the palette's intended hue more reliably
  // than the near-black dark one.
  const neutral = neutralFrom(palette.backgroundLight);
  return withLadder({ ...base, ...tonalContainers(base.accent, dark) }, ladderOf(neutral, dark ? 'dark' : 'light'));
}

/**
 * Android pure black: the same neutral hue, with the dark ladder moved down so
 * the screen is #000 and containers still step up by tone.
 */
export function tonalPureBlack(c: ThemeColors): ThemeColors {
  return withLadder(
    { ...c, separator: 'rgba(120,120,128,0.28)' },
    ladderOf(neutralFrom(c.surfaceContainerHighest), 'black')
  );
}
