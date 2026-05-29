// Shared native stack header options. Large titles everywhere; a solid (themed)
// header — not transparent/blurred — so the title renders reliably regardless of
// whether the screen's root is a scroll view (transparent + blur large titles
// were dropping the title on scroll-rooted screens). The header background and
// title color come from the navigation theme (see components/theme/shell).
export const stackScreenOptions = {
  headerLargeTitle: true,
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
} as const;

/**
 * Platform-aware defaults for `presentation: 'formSheet'` screens.
 *
 * - iOS: `contentStyle.backgroundColor = transparent` so iOS 26+ paints the
 *   sheet with the system liquid-glass material. Older releases fall back to
 *   the standard sheet chrome automatically.
 * - Android: react-native-screens' formSheet renders a Material 3 modal
 *   bottom sheet. We bump elevation a touch so the surface separates from the
 *   scrim, and lean on `SheetSurface` for the drag handle / rounded top.
 *
 * Pass an array of detents (0-1) — defaults to a half/full sheet.
 */
export function sheetScreenOptions(
  detents: number[] = [0.5, 1.0],
  title?: string,
) {
  const ios = process.env.EXPO_OS === 'ios';
  return {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetAllowedDetents: detents,
    sheetCornerRadius: 28,
    sheetElevation: 24,
    headerLargeTitle: false,
    // iOS: transparent so iOS 26+ paints the sheet with the system liquid-glass
    // material. Android: keep the themed surface — `SheetSurface` paints a
    // Material 3 surfaceContainerHigh background with a drag handle.
    contentStyle: ios ? { backgroundColor: 'transparent' as const } : undefined,
    ...(title ? { title } : {}),
  };
}
