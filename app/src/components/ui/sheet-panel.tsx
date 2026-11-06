import { Dimensions, Platform, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';

const IOS = Platform.OS === 'ios';

/**
 * Surface for the app's custom bottom sheets.
 *
 * Android: the Material 3 sheet, flush to the edges with 28dp top corners on
 * surfaceContainerLow.
 * iOS: the iOS 26 sheet shape, a card floating 8pt in from the edges with deep
 * continuous corners. It is deliberately opaque: these sheets live in a
 * separate modal window, so Liquid Glass has nothing to sample and renders
 * nearly clear, letting the list underneath bleed through the text.
 *
 * Render `background` as the panel's first child and spread `style` onto it.
 */
export function useSheetPanel(extraBottom = 12): { style: ViewStyle; background: React.ReactNode } {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  if (!IOS) {
    return {
      style: {
        backgroundColor: colors.bg2,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderCurve: 'continuous',
        paddingBottom: insets.bottom + extraBottom,
      },
      background: null,
    };
  }

  return {
    style: {
      marginHorizontal: 8,
      marginBottom: Math.max(insets.bottom - 14, 8),
      borderRadius: 38,
      borderCurve: 'continuous',
      overflow: 'hidden',
      paddingBottom: extraBottom + 8,
      // systemBackground (light) / secondarySystemBackground (dark): what iOS
      // uses for elevated sheets.
      backgroundColor: scheme === 'dark' ? colors.bg2 : colors.bg,
      boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
    },
    background: null,
  };
}

/**
 * Style for the root view inside a sheet's `Modal` (with
 * `statusBarTranslucent` and `navigationBarTranslucent`).
 *
 * Android lays the modal's root out at the old window size (above the
 * navigation bar) and only learns the full edge-to-edge size a few frames
 * later, so a `flex: 1` sheet parks above the tab bar, leaving a gap, and then
 * drops. Sizing the overlay to the physical screen up front pins the sheet to
 * the bottom edge from the first frame.
 */
export function sheetOverlayStyle(): ViewStyle {
  if (Platform.OS !== 'android') return { flex: 1 };
  const screen = Dimensions.get('screen');
  return { position: 'absolute', top: 0, left: 0, width: screen.width, height: screen.height };
}
