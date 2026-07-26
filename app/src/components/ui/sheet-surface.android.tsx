import {
  Host,
  ModalBottomSheet,
  type ModalBottomSheetRef,
  RNHostView,
} from '@expo/ui/jetpack-compose';
import { router } from 'expo-router';
import { useCallback, useRef, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { Text } from '@/tw';

export interface SheetSurfaceProps {
  children: ReactNode;
  /** Material bottom sheet headline (M3 headlineSmall). */
  title?: string;
  /** Supporting line under the title (M3 bodyMedium). */
  subtitle?: string;
  /** Extra bottom padding for keyboards / FABs. Default uses safe area. */
  bottomInset?: number;
  /**
   * When true (default) the sheet opens fully expanded — right for tall
   * scrolling forms.
   *
   * Only pass `false` for content that comfortably fits in half the screen
   * (a spinner, a short confirmation). Compose lays `RNHostView` out against
   * the *fully expanded* height, so with the partial detent anything past the
   * detent is clipped and cannot be scrolled to.
   */
  skipPartiallyExpanded?: boolean;
}

/**
 * Android Material 3 modal bottom sheet via `@expo/ui/jetpack-compose`.
 *
 * Host + ModalBottomSheet owns the scrim, drag handle, shape, and dismiss
 * gestures (swipe / back / outside) — the same stack Paisa uses with Compose
 * `ModalBottomSheet`. Route presentation must be `transparentModal` so the
 * previous screen shows under the scrim (see `sheetScreenOptions`).
 *
 * Content is RN via `RNHostView` so forms keep TextInput / ScrollView behavior.
 */
export function SheetSurface({
  children,
  title,
  subtitle,
  bottomInset,
  skipPartiallyExpanded = true,
}: SheetSurfaceProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const closedRef = useRef(false);
  const padBottom = bottomInset ?? Math.max(insets.bottom, 20);

  const dismiss = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    haptics.impact('light');
    if (router.canGoBack()) {
      router.back();
    }
  }, []);

  return (
    // Transparent host screen — ModalBottomSheet paints scrim + surface.
    <View style={{ flex: 1, backgroundColor: 'transparent' }} pointerEvents="box-none">
      {/*
        Host mirrors @expo/ui community bottom-sheet: absolute, width-locked,
        pointerEvents none so the Compose ModalBottomSheet window owns hits.
      */}
      <Host
        style={{ position: 'absolute', width }}
        pointerEvents="none"
        // Force the sheet to follow the in-app theme (palette / AMOLED /
        // light-in-dark-OS), not the OS-level color scheme.
        colorScheme={colors.bg === '#000000' || isDark(colors.bg) ? 'dark' : 'light'}
        ignoreSafeAreaKeyboardInsets>
        <ModalBottomSheet
          ref={sheetRef}
          onDismissRequest={dismiss}
          skipPartiallyExpanded={skipPartiallyExpanded}
          showDragHandle
          sheetGesturesEnabled
          // M3 modal sheets sit on surfaceContainerLow — one step above the
          // scrimmed screen behind so the edge of the sheet is readable.
          containerColor={colors.bg3}
          contentColor={colors.text}
          // M3 scrim: 32% black over the screen behind the sheet.
          scrimColor="rgba(0,0,0,0.32)"
          properties={{
            shouldDismissOnBackPress: true,
            shouldDismissOnClickOutside: true,
          }}>
          {/*
            flexGrow/height:0 is the trick from @expo/ui's community
            bottom-sheet: it gives the RN subtree a concrete height so child
            ScrollViews can scroll to their end. A fixed height instead just
            clips the content — it does not shrink the Compose sheet.
          */}
          <RNHostView>
            <View style={{ flexGrow: 1, height: 0 }}>
              {title ? (
                <View
                  style={{
                    paddingHorizontal: 24,
                    paddingTop: 8,
                    paddingBottom: subtitle ? 4 : 16,
                  }}>
                  {/* M3 headlineSmall — matches Paisa's sheet headline. */}
                  <Text
                    className="text-sf-text"
                    accessibilityRole="header"
                    style={{ fontSize: 24, fontWeight: '600', lineHeight: 32 }}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text
                      className="text-sf-text-2"
                      style={{ fontSize: 14, lineHeight: 20, marginTop: 4, letterSpacing: 0.25 }}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={{ flex: 1, paddingBottom: padBottom }}>{children}</View>
            </View>
          </RNHostView>
        </ModalBottomSheet>
      </Host>
    </View>
  );
}

/** Rough luminance check so the Compose sheet matches our resolved theme. */
function isDark(hex: string): boolean {
  const raw = hex.replace('#', '').slice(0, 6);
  if (raw.length !== 6) return true;
  const n = Number.parseInt(raw, 16);
  if (Number.isNaN(n)) return true;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
