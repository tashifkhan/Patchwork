/**
 * Curated Material 3–style color palettes (inspired by Paisa / m3.material.io).
 * Each entry provides a seed color plus light/dark surface tints used when
 * wallpaper dynamic color is off, or as fixed accents on iOS.
 */

export interface ColorPalette {
  id: string;
  label: string;
  /** Seed / primary accent shown in the swatch. */
  seed: string;
  primaryLight: string;
  primaryDark: string;
  backgroundLight: string;
  backgroundDark: string;
  surfaceLight: string;
  surfaceDark: string;
  elevatedLight: string;
  elevatedDark: string;
  /**
   * Optional neutrals (text, borders, tracks). Without them a palette uses
   * Material's cool grays, which look off against warm surfaces like Paper.
   */
  neutrals?: { light: PaletteNeutrals; dark: PaletteNeutrals };
  /** Text on the accent, when the automatic black/white pick isn't right. */
  onPrimaryLight?: string;
  onPrimaryDark?: string;
}

export interface PaletteNeutrals {
  text: string;
  text2: string;
  text3: string;
  /** Mid gray: grabbers, inactive glyphs. */
  gray: string;
  /** Borders and outlines. */
  gray2: string;
  /** Tracks and subtle fills. */
  gray3: string;
  separator: string;
}

/**
 * The app's default look, from taf.sh (src/styles/global.css): warm paper
 * cream with a deep teal accent in light, near-black ink with a bright teal
 * in dark.
 */
export const PAPER_PALETTE: ColorPalette = {
  id: 'paper',
  label: 'Paper',
  seed: '#0F7A6C',
  primaryLight: '#0F7A6C',
  primaryDark: '#4FD1C5',
  backgroundLight: '#F6F1E9',
  backgroundDark: '#0E0D0D',
  surfaceLight: '#FDFAF4',
  surfaceDark: '#151313',
  elevatedLight: '#FFFDF8',
  elevatedDark: '#1C1A1A',
  onPrimaryLight: '#FFFFFF',
  onPrimaryDark: '#04211F',
  neutrals: {
    light: {
      text: '#171615',
      text2: '#5F5956',
      text3: '#857F7B',
      gray: '#857F7B',
      gray2: '#DED4C5',
      gray3: '#ECE5DA',
      separator: '#DED4C5',
    },
    dark: {
      text: '#F2F1F0',
      text2: '#A19C9B',
      text3: '#77716F',
      gray: '#77716F',
      gray2: '#3B3737',
      gray3: '#242121',
      separator: '#2C2828',
    },
  },
};

export const COLOR_PALETTES: ColorPalette[] = [
  PAPER_PALETTE,
  {
    id: 'ocean',
    label: 'Ocean',
    seed: '#006064',
    primaryLight: '#006064',
    primaryDark: '#4DD0E1',
    backgroundLight: '#F0FFFF',
    backgroundDark: '#0A1A1C',
    surfaceLight: '#E0F7FA',
    surfaceDark: '#122628',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#1A3336',
  },
  {
    id: 'lavender',
    label: 'Lavender',
    seed: '#7C5AB8',
    primaryLight: '#7C5AB8',
    primaryDark: '#CFBCFF',
    backgroundLight: '#FCF8FF',
    backgroundDark: '#16121A',
    surfaceLight: '#F0E8FF',
    surfaceDark: '#221C2A',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#2C2436',
  },
  {
    id: 'forest',
    label: 'Forest',
    seed: '#0B6E4F',
    primaryLight: '#1B5E20',
    primaryDark: '#66BB6A',
    backgroundLight: '#F1F8E9',
    backgroundDark: '#0D1A0D',
    surfaceLight: '#E8F5E9',
    surfaceDark: '#142414',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#1C301C',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    seed: '#E65100',
    primaryLight: '#E65100',
    primaryDark: '#FF9E80',
    backgroundLight: '#FFF5F0',
    backgroundDark: '#1A120D',
    surfaceLight: '#FFEDE4',
    surfaceDark: '#261A12',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#322418',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    seed: '#0D47A1',
    primaryLight: '#0D47A1',
    primaryDark: '#90CAF9',
    backgroundLight: '#F5F9FF',
    backgroundDark: '#0D1117',
    surfaceLight: '#E8F0FE',
    surfaceDark: '#161B22',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#21262D',
  },
  {
    id: 'rose_pine',
    label: 'Rose Pine',
    seed: '#907AA9',
    primaryLight: '#907AA9',
    primaryDark: '#C4A7E7',
    backgroundLight: '#FAF4ED',
    backgroundDark: '#232136',
    surfaceLight: '#F2E9E1',
    surfaceDark: '#2A273F',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#393552',
  },
  {
    id: 'nord',
    label: 'Nord',
    seed: '#5E81AC',
    primaryLight: '#5E81AC',
    primaryDark: '#88C0D0',
    backgroundLight: '#ECEFF4',
    backgroundDark: '#2E3440',
    surfaceLight: '#E5E9F0',
    surfaceDark: '#3B4252',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#434C5E',
  },
  {
    id: 'dracula',
    label: 'Dracula',
    seed: '#6272A4',
    primaryLight: '#6272A4',
    primaryDark: '#BD93F9',
    backgroundLight: '#F8F8F2',
    backgroundDark: '#282A36',
    surfaceLight: '#EDEDF0',
    surfaceDark: '#343746',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#44475A',
  },
  {
    id: 'teal',
    label: 'Teal',
    seed: '#006B5D',
    primaryLight: '#006B5D',
    primaryDark: '#6EDBC4',
    backgroundLight: '#F7F9F8',
    backgroundDark: '#1A1C1B',
    surfaceLight: '#E6F2EF',
    surfaceDark: '#242826',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#2E3431',
  },
  {
    id: 'coral',
    label: 'Coral',
    seed: '#FF5252',
    primaryLight: '#E53935',
    primaryDark: '#FF8A80',
    backgroundLight: '#FFF5F5',
    backgroundDark: '#1A1010',
    surfaceLight: '#FFEBEE',
    surfaceDark: '#261616',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#321C1C',
  },
  {
    id: 'amber',
    label: 'Amber',
    seed: '#FF8F00',
    primaryLight: '#FF8F00',
    primaryDark: '#FFCA28',
    backgroundLight: '#FFFBF0',
    backgroundDark: '#1A1508',
    surfaceLight: '#FFF3D6',
    surfaceDark: '#261E0C',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#322814',
  },
  {
    id: 'slate',
    label: 'Slate',
    seed: '#455A64',
    primaryLight: '#455A64',
    primaryDark: '#90A4AE',
    backgroundLight: '#F5F7F8',
    backgroundDark: '#151A1C',
    surfaceLight: '#ECEFF1',
    surfaceDark: '#1E2528',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#283033',
  },
  {
    id: 'violet',
    label: 'Violet',
    seed: '#6A1B9A',
    primaryLight: '#6A1B9A',
    primaryDark: '#CE93D8',
    backgroundLight: '#FCF5FF',
    backgroundDark: '#150D1A',
    surfaceLight: '#F3E5F5',
    surfaceDark: '#1F1526',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#2A1C33',
  },
  {
    id: 'monochrome',
    label: 'Monochrome',
    seed: '#424242',
    primaryLight: '#212121',
    primaryDark: '#E0E0E0',
    backgroundLight: '#FAFAFA',
    backgroundDark: '#0A0A0A',
    surfaceLight: '#F0F0F0',
    surfaceDark: '#141414',
    elevatedLight: '#FFFFFF',
    elevatedDark: '#1E1E1E',
  },
];

export function paletteById(id: string | null | undefined): ColorPalette | null {
  if (!id) return null;
  return COLOR_PALETTES.find((p) => p.id === id) ?? null;
}
