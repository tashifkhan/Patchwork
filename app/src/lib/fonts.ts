import { Platform } from 'react-native';

import { useSettingsStore } from '@/stores/settings-store';

/**
 * Font choice: a few families every phone already has, plus any
 * .ttf/.otf the user imports. Imported files are copied into the app's
 * documents folder and loaded at launch.
 */

export interface CustomFont {
  id: string;
  name: string;
  uri: string;
}

export const BUILT_IN_FONTS: { id: string | null; label: string; family: string | undefined }[] = [
  { id: null, label: 'System', family: undefined },
  { id: 'serif', label: 'Serif', family: Platform.select({ ios: 'Georgia', android: 'serif' }) },
  { id: 'mono', label: 'Mono', family: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  {
    id: 'condensed',
    label: 'Condensed',
    family: Platform.select({ ios: 'AvenirNextCondensed-Regular', android: 'sans-serif-condensed' }),
  },
  { id: 'rounded', label: 'Rounded', family: Platform.select({ ios: 'Avenir Next', android: 'sans-serif-medium' }) },
];

export function fontFamilyFor(id: string | null, custom: CustomFont[]): string | undefined {
  if (!id) return undefined;
  const builtIn = BUILT_IN_FONTS.find((font) => font.id === id);
  if (builtIn) return builtIn.family;
  return custom.some((font) => font.id === id) ? id : undefined;
}

/** What `@/tw` Text applies: a family (unless the style sets one) and a size multiplier. */
export function useTypography() {
  const fontId = useSettingsStore((s) => s.fontFamily);
  const custom = useSettingsStore((s) => s.customFonts);
  const scale = useSettingsStore((s) => s.fontScale);
  return { family: fontFamilyFor(fontId, custom), scale };
}

let loaded = new Set<string>();

/** Registers imported fonts with the native font manager. Safe to call again. */
export async function loadCustomFonts(fonts: CustomFont[]) {
  const pending = fonts.filter((font) => !loaded.has(font.id));
  if (pending.length === 0) return;
  const Font = await import('expo-font');
  await Promise.all(
    pending.map(async (font) => {
      try {
        await Font.loadAsync({ [font.id]: font.uri });
        loaded = new Set(loaded).add(font.id);
      } catch {
        // A deleted or broken file: fall back to the system font.
      }
    })
  );
}

/** Picks a font file, copies it into the app and returns its entry. */
export async function importFontFile(): Promise<CustomFont | null> {
  const [DocumentPicker, { File, Directory, Paths }] = await Promise.all([
    import('expo-document-picker'),
    import('expo-file-system'),
  ]);
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['font/ttf', 'font/otf', 'application/x-font-ttf', 'application/x-font-otf', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  if (!/\.(ttf|otf)$/i.test(asset.name)) throw new Error('Pick a .ttf or .otf font file.');
  const folder = new Directory(Paths.document, 'fonts');
  if (!folder.exists) folder.create();
  const id = `Custom-${asset.name.replace(/\.(ttf|otf)$/i, '').replace(/[^A-Za-z0-9]+/g, '')}-${Date.now().toString(36)}`;
  const target = new File(folder, `${id}${asset.name.match(/\.(ttf|otf)$/i)![0].toLowerCase()}`);
  await new File(asset.uri).copy(target);
  const font: CustomFont = { id, name: asset.name.replace(/\.(ttf|otf)$/i, ''), uri: target.uri };
  await loadCustomFonts([font]);
  return font;
}
