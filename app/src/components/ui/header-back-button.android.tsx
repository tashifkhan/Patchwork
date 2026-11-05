import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View, type ColorValue } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { haptics } from '@/lib/haptics';

/** M3 standard icon-button container (40dp). */
const SIZE = 40;
/** Material arrow size inside the circle. */
const ICON = 22;

/**
 * Android header back button: an M3 *filled tonal* icon button (40dp,
 * `surfaceContainerHigh` fill, no outline ring) used as `headerLeft` on every
 * stack screen that can go back. Corners tighten while pressed, the M3
 * Expressive shape-morph cue. Neutral on-surface ink, never the accent, so it
 * reads as chrome rather than a primary action.
 */
export function HeaderBackButtonLeft({
  canGoBack,
}: {
  canGoBack?: boolean;
  tintColor?: ColorValue;
  label?: string;
  href?: string;
  backgroundColor?: ColorValue;
}): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();

  const { twoPane } = useAdaptiveLayout();
  // A page opened straight from a link or notification can sit alone in its
  // stack. Still offer a way out: back to the tab's main screen. Not in the
  // Settings split view: the hub is already on screen beside the page.
  const splitSettings = twoPane && pathname.startsWith('/settings');
  const fallback = canGoBack || splitSettings ? null : tabRootFor(pathname);
  if (!canGoBack && !fallback) return null;

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        // `canGoBack` is this stack's answer; router.canGoBack() also counts
        // tab history and would jump to another tab.
        if (canGoBack) router.back();
        else if (fallback) router.replace(fallback);
      }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={6}
      android_ripple={{ color: colors.separator, borderless: false }}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        marginRight: 12,
        borderRadius: pressed ? 12 : SIZE / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg3,
      })}>
      <View pointerEvents="none">
        <MaterialCommunityIcons name="arrow-left" size={ICON} color={colors.text} />
      </View>
    </Pressable>
  );
}

const TAB_ROOTS = ['/deck', '/settings', '/search'];

/** The main screen of the tab that owns `pathname`, or null if it is one. */
function tabRootFor(pathname: string): Href | null {
  if (pathname === '/' || TAB_ROOTS.includes(pathname)) return null;
  const root = TAB_ROOTS.find((candidate) => pathname.startsWith(`${candidate}/`));
  return (root ?? '/') as Href;
}
