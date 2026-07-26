import { useCallback } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettingsStore } from '@/stores/settings-store';
import { useTabBarChromeStore } from '@/stores/tab-bar-chrome-store';

/** Height of the floating capsule (icon + label). */
export const FLOATING_TAB_BAR_HEIGHT = 56;
/** Diameter of the separate search / mini circle (matches capsule height). */
export const FLOATING_TAB_CIRCLE = 56;
/** Horizontal / bottom margin around the floating chrome. */
export const FLOATING_TAB_BAR_MARGIN = 14;

/** True when Android is using the iOS-style floating tab bar. */
export function useFloatingTabBar(): boolean {
  const floatingTabBar = useSettingsStore((s) => s.floatingTabBar);
  return Platform.OS === 'android' && floatingTabBar;
}

/**
 * Bottom offset for FABs and other chrome that sit above the tab bar.
 * With Material NativeTabs the screen is already inset, so only a small gap
 * is needed. With the floating absolute bar, content fills the window and
 * chrome must clear the pill + system nav inset.
 */
export function useTabBarFabOffset(gap = 12): number {
  const floating = useFloatingTabBar();
  const insets = useSafeAreaInsets();
  if (floating) {
    return insets.bottom + FLOATING_TAB_BAR_MARGIN + FLOATING_TAB_BAR_HEIGHT + gap;
  }
  return 16;
}

/**
 * Extra bottom padding for scroll content so the last items clear the
 * floating pill. Native Material tabs already inset the scene.
 */
export function useTabBarContentPadding(base = 48): number {
  const floating = useFloatingTabBar();
  const insets = useSafeAreaInsets();
  if (floating) {
    return base + insets.bottom + FLOATING_TAB_BAR_MARGIN + FLOATING_TAB_BAR_HEIGHT;
  }
  return base;
}

/**
 * Attach to root ScrollView / FlatList / SectionList `onScroll` so the
 * floating bar can minimize on scroll-down like iOS 26.
 */
export function useTabBarMinimizeOnScroll() {
  const floating = useFloatingTabBar();
  const reportScroll = useTabBarChromeStore((s) => s.reportScroll);

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!floating) return;
      reportScroll(event.nativeEvent.contentOffset.y);
    },
    [floating, reportScroll]
  );
}
