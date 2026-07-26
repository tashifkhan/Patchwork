import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, TextInput as RNTextInput } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolate,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import {
  FLOATING_TAB_BAR_HEIGHT,
  FLOATING_TAB_BAR_MARGIN,
  FLOATING_TAB_CIRCLE,
} from '@/lib/tab-bar';
import { useTabBarChromeStore } from '@/stores/tab-bar-chrome-store';
import { Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type TabBarState = {
  index: number;
  routes: { key: string; name: string }[];
};

type TabBarNavigation = {
  emit: (event: {
    type: string;
    target?: string;
    canPreventDefault?: boolean;
  }) => { defaultPrevented: boolean };
  navigate: (name: string) => void;
};

const MAIN_TABS: {
  route: string;
  label: string;
  icon: IconName;
  iconFocused: IconName;
}[] = [
  { route: '(tasks)', label: 'Tasks', icon: 'checkbox-marked-outline', iconFocused: 'format-list-checks' },
  { route: 'deck', label: 'Boards', icon: 'view-column-outline', iconFocused: 'view-column' },
  { route: 'ai', label: 'AI', icon: 'creation-outline', iconFocused: 'creation' },
  { route: 'settings', label: 'Settings', icon: 'cog-outline', iconFocused: 'cog' },
];

const SEARCH_ROUTE = 'search';
const TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };
/** Pill resize + label reveal when the selection moves between tabs. */
const SELECT_DURATION = 240;

export type IosFloatingTabBarProps = {
  state: TabBarState;
  navigation: TabBarNavigation;
};

/**
 * iOS 26–style floating tab chrome for Android:
 * - Expanded: capsule with main tabs + separate search circle
 * - Search focused: mini home circle + search field pill
 * - Scroll minimized: mini active-tab circle + search circle
 */
export function IosFloatingTabBar({ state, navigation }: IosFloatingTabBarProps) {
  const { colors, scheme } = useTheme();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const minimized = useTabBarChromeStore((s) => s.minimized);
  const expand = useTabBarChromeStore((s) => s.expand);
  const searchQuery = useTabBarChromeStore((s) => s.floatingSearchQuery);
  const setSearchQuery = useTabBarChromeStore((s) => s.setFloatingSearchQuery);

  const activeRoute = state.routes[state.index]?.name ?? '(tasks)';
  const searchFocused = activeRoute === SEARCH_ROUTE;
  // When search is open, always use the search layout (image #2).
  const compact = searchFocused || minimized;

  const progress = useSharedValue(compact ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(compact ? 1 : 0, TIMING);
  }, [compact, progress]);

  // Expand when the user switches among main tabs.
  useEffect(() => {
    if (!searchFocused) expand();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on route change
  }, [activeRoute]);

  const bottom = Math.max(insets.bottom, 10) + FLOATING_TAB_BAR_MARGIN;

  // Android is edge-to-edge from API 35 on, so `adjustResize` no longer shrinks
  // the window — an absolutely positioned bar would sit *under* the keyboard.
  // Lift it by the keyboard height, minus the bottom inset we already pad by
  // (the keyboard covers the gesture bar area it occupied).
  const keyboard = useAnimatedKeyboard();
  const keyboardStyle = useAnimatedStyle(() => {
    const lift = Math.max(0, keyboard.height.value - insets.bottom);
    return { transform: [{ translateY: -lift }] };
  });
  const surface = isDark ? 'rgba(44,44,46,0.92)' : 'rgba(242,242,247,0.94)';
  const surfaceBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const selectionFill = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)';
  const inactive = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.72)';
  const accent = colors.accent;

  const activeMain = useMemo(() => {
    const match = MAIN_TABS.find((t) => t.route === activeRoute);
    return match ?? MAIN_TABS[0];
  }, [activeRoute]);

  const returnRoute = useMemo(() => {
    if (activeRoute !== SEARCH_ROUTE) return activeRoute;
    for (let i = state.index - 1; i >= 0; i--) {
      const name = state.routes[i]?.name;
      if (name && name !== SEARCH_ROUTE) return name;
    }
    return '(tasks)';
  }, [activeRoute, state.index, state.routes]);

  const returnTab = MAIN_TABS.find((t) => t.route === returnRoute) ?? MAIN_TABS[0];

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.55, 1], [1, 0, 0]),
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, 0.88]) },
      { translateY: interpolate(progress.value, [0, 1], [0, 8]) },
    ],
  }));

  const compactStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.45, 1], [0, 0, 1]),
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.88, 1]) },
      { translateY: interpolate(progress.value, [0, 1], [8, 0]) },
    ],
  }));

  const goTo = (routeName: string) => {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    // Selection tick when the destination changes, a lighter tap when the
    // user re-presses the tab they are already on.
    if (routeName === activeRoute) haptics.tap();
    else haptics.selection();
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(routeName);
    }
    if (routeName !== SEARCH_ROUTE) expand();
  };

  const shell = {
    backgroundColor: surface,
    borderColor: surfaceBorder,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: isDark ? '0 10px 28px rgba(0,0,0,0.5)' : '0 10px 28px rgba(0,0,0,0.14)',
  } as const;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: FLOATING_TAB_BAR_MARGIN,
          paddingBottom: bottom,
        },
        keyboardStyle,
      ]}>
      <View
        style={{ height: FLOATING_TAB_BAR_HEIGHT, position: 'relative' }}
        pointerEvents="box-none">
        {/* Expanded: capsule + search circle (image #1) */}
        <Animated.View
          style={[styles.layer, expandedStyle]}
          pointerEvents={compact ? 'none' : 'box-none'}>
          <View style={[styles.capsule, shell]}>
            {MAIN_TABS.map((tab) => {
              const focused = activeRoute === tab.route;
              return (
                // Only the selected tab is labeled; the pill grows to fit the
                // label and the siblings shrink back to bare icons.
                <Animated.View key={tab.route} layout={LinearTransition.duration(SELECT_DURATION)}>
                  <Pressable
                    onPress={() => goTo(tab.route)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={tab.label}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.75 : 1,
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                      height: 40,
                      paddingHorizontal: focused ? 14 : 12,
                      borderRadius: 999,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: focused ? 6 : 0,
                      backgroundColor: focused ? selectionFill : 'transparent',
                    })}>
                    <MaterialCommunityIcons
                      name={focused ? tab.iconFocused : tab.icon}
                      size={22}
                      color={focused ? accent : inactive}
                    />
                    {focused ? (
                      <Animated.View
                        entering={FadeIn.duration(SELECT_DURATION)}
                        exiting={FadeOut.duration(120)}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: accent,
                            includeFontPadding: false,
                          }}
                          numberOfLines={1}>
                          {tab.label}
                        </Text>
                      </Animated.View>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          <Pressable
            onPress={() => goTo(SEARCH_ROUTE)}
            accessibilityRole="tab"
            accessibilityState={{ selected: searchFocused }}
            accessibilityLabel="Search"
            style={({ pressed }) => [styles.circle, shell, { opacity: pressed ? 0.8 : 1 }]}>
            <MaterialCommunityIcons name="magnify" size={24} color={inactive} />
          </Pressable>
        </Animated.View>

        {/* Compact: mini circle + search circle/field (image #2) */}
        <Animated.View
          style={[
            styles.layer,
            compactStyle,
            // Scroll-minimized keeps search on the trailing edge like the expanded bar.
            !searchFocused ? { justifyContent: 'space-between' } : null,
          ]}
          pointerEvents={compact ? 'box-none' : 'none'}>
          <Pressable
            onPress={() => {
              if (searchFocused) goTo(returnRoute);
              else expand();
            }}
            accessibilityRole="button"
            accessibilityLabel={searchFocused ? `Back to ${returnTab.label}` : 'Expand tabs'}
            style={({ pressed }) => [styles.circle, shell, { opacity: pressed ? 0.8 : 1 }]}>
            <MaterialCommunityIcons
              name={searchFocused ? returnTab.iconFocused : activeMain.iconFocused}
              size={22}
              color={inactive}
            />
          </Pressable>

          {searchFocused ? (
            <View style={[styles.searchPill, shell, { flex: 1 }]}>
              <MaterialCommunityIcons name="magnify" size={20} color={colors.text3} />
              <RNTextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search tasks, cards, issues"
                placeholderTextColor={colors.text3}
                returnKeyType="search"
                autoFocus
                style={{
                  flex: 1,
                  color: colors.text,
                  fontSize: 16,
                  paddingVertical: 0,
                  includeFontPadding: false,
                }}
              />
              {searchQuery ? (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  hitSlop={10}
                  accessibilityLabel="Clear search">
                  <MaterialCommunityIcons name="close-circle" size={18} color={colors.text2} />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Pressable
              onPress={() => goTo(SEARCH_ROUTE)}
              accessibilityRole="tab"
              accessibilityLabel="Search"
              style={({ pressed }) => [styles.circle, shell, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialCommunityIcons name="magnify" size={24} color={inactive} />
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Both chrome variants stack in the same 56dp slot and cross-fade, so each
  // one must be pinned to the slot — laid out in flow they would sit one row
  // apart and the second would fall off the bottom of the screen.
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    height: FLOATING_TAB_BAR_HEIGHT,
    borderRadius: FLOATING_TAB_BAR_HEIGHT / 2,
    borderCurve: 'continuous',
    paddingHorizontal: 4,
  },
  circle: {
    width: FLOATING_TAB_CIRCLE,
    height: FLOATING_TAB_CIRCLE,
    borderRadius: FLOATING_TAB_CIRCLE / 2,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPill: {
    height: FLOATING_TAB_CIRCLE,
    borderRadius: FLOATING_TAB_CIRCLE / 2,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
});
