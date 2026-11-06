import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { createElement } from 'react';
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

/** iOS 26+: the system draws Liquid Glass bars, so headers stay transparent. */
export const IOS_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * The iOS 26 header: transparent, so UIKit draws its own glass with the scroll
 * edge effect and content scrolls under it. Every screen's main scroll view
 * must use `contentInsetAdjustmentBehavior="automatic"` to start below it.
 * Large titles work here: they were only invisible on a solid header.
 * (Older iOS keeps the solid themed header.)
 */
export const iosGlassHeaderOptions = {
  headerTransparent: true,
  headerStyle: { backgroundColor: 'transparent' },
  headerLargeStyle: { backgroundColor: 'transparent' },
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
export function themedStackScreenOptions(colors: ThemeColors, background: string = colors.bg) {
  if (IOS_GLASS) {
    return {
      ...stackScreenOptions,
      ...iosGlassHeaderOptions,
      contentStyle: { backgroundColor: background },
      headerTintColor: colors.accent,
      headerTitleStyle: { color: colors.text },
      headerLargeTitleStyle: { color: colors.text },
    };
  }
  return {
    ...stackScreenOptions,
    contentStyle: { backgroundColor: background },
    headerStyle: { backgroundColor: background },
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.text },
    headerLargeStyle: { backgroundColor: background },
    ...(Platform.OS === 'android'
      ? {
          // Hide the native up-arrow so only the circular headerLeft renders.
          headerBackVisible: false as const,
          // Rendered as an element, not passed as the render function itself:
          // the navigator calls `headerLeft(props)` inside its own SceneView
          // render, so a hook-using component passed directly would add hooks
          // to SceneView and crash ("Rendered more hooks…") whenever a screen
          // gains this option after mounting, e.g. a root-stack screen that
          // sets these themed options from inside itself.
          headerLeft: (props: Parameters<typeof HeaderBackButtonLeft>[0]) =>
            createElement(HeaderBackButtonLeft, props),
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
