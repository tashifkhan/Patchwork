import { Platform } from 'react-native';

import { HeaderBackButtonLeft } from '@/components/ui/header-back-button';
import type { ThemeColors } from '@/lib/theme';

// Shared native stack header options. Large titles everywhere; a solid (themed)
// header — not transparent/blurred — so the title renders reliably regardless of
// whether the screen's root is a scroll view (transparent + blur large titles
// were dropping the title on scroll-rooted screens).
export const stackScreenOptions = {
  headerLargeTitle: true,
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
};

/**
 * Themed stack options. Always prefer this over bare `stackScreenOptions` so
 * screen chrome (content + header) tracks dark/light mode instead of falling
 * back to the system default white background.
 *
 * On Android the bare toolbar navigation icon is replaced with a circular
 * Material icon button (`HeaderBackButtonLeft`) so every stack back control
 * matches the rest of the circular chrome.
 */
export function themedStackScreenOptions(colors: ThemeColors) {
  return {
    ...stackScreenOptions,
    contentStyle: { backgroundColor: colors.bg },
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.text },
    headerLargeStyle: { backgroundColor: colors.bg },
    ...(Platform.OS === 'android'
      ? {
          // Hide the native up-arrow so only the circular headerLeft renders.
          headerBackVisible: false as const,
          headerLeft: HeaderBackButtonLeft,
        }
      : null),
  };
}

/**
 * Platform-aware defaults for sheet screens.
 *
 * - iOS: system `formSheet` with liquid-glass-friendly transparent content and
 *   grabber. Detents come from `detents` (0–1).
 * - Android: transparent host route so `@expo/ui/jetpack-compose`
 *   `ModalBottomSheet` (in `SheetSurface`) owns the Material 3 sheet, scrim,
 *   drag handle, and dismiss gestures — matching Paisa's Compose bottomsheet.
 *   Animation is disabled on the stack so only the native sheet animates.
 *
 * Prefer taller first detent on iOS for forms so fields aren't cramped.
 */
export function sheetScreenOptions(
  detents: number[] = [0.72, 1.0],
  title?: string,
) {
  const ios = process.env.EXPO_OS === 'ios';

  if (!ios) {
    return {
      // Transparent host — ModalBottomSheet draws the real Material sheet.
      presentation: 'transparentModal' as const,
      animation: 'none' as const,
      headerShown: false,
      contentStyle: { backgroundColor: 'transparent' as const },
      // Keep the previous screen interactive under the Compose scrim's hit test.
      // (Scrim itself captures outside taps via shouldDismissOnClickOutside.)
    };
  }

  return {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetAllowedDetents: detents,
    sheetCornerRadius: 28,
    sheetElevation: 24,
    // Keep the dimmed scrim under all detents so the sheet feels modal.
    sheetLargestUndimmedDetentIndex: -1 as const,
    // Expand to full when keyboard opens so form fields stay visible.
    sheetExpandsWhenScrolledToEdge: true,
    headerLargeTitle: false,
    headerShadowVisible: false,
    headerShown: Boolean(title),
    contentStyle: { backgroundColor: 'transparent' as const },
    ...(title ? { title } : {}),
  };
}
