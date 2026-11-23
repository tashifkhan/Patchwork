import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput as RNTextInput,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  interpolate,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettingsStore } from '@/stores/settings-store';
import { useTheme } from '@/components/theme/context';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { CAN_FROST, Frost, useFrostTarget } from '@/components/ui/frost';
import { haptics } from '@/lib/haptics';
import { EXPRESSIVE } from '@/lib/motion';
import { mixHex } from '@/lib/theme';
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

/** The tab navigator's event emitter (Expo Router 58 passes this, not `navigation`). */
type TabBarEmitter = {
  emit: (event: {
    type: string;
    target?: string;
    canPreventDefault?: boolean;
  }) => { defaultPrevented: boolean };
};

/** What a tab's icon does when its tab is tapped. One small move each, picked to suit the glyph. */
type IconMotion = 'hop' | 'wiggle' | 'turn';

const MAIN_TABS: {
  route: string;
  label: string;
  icon: IconName;
  iconFocused: IconName;
  motion: IconMotion;
}[] = [
  { route: '(tasks)', label: 'Tasks', icon: 'checkbox-marked-outline', iconFocused: 'format-list-checks', motion: 'hop' },
  { route: 'deck', label: 'Boards', icon: 'view-column-outline', iconFocused: 'view-column', motion: 'wiggle' },
  { route: 'settings', label: 'Settings', icon: 'cog-outline', iconFocused: 'cog', motion: 'turn' },
];

const SEARCH_ROUTE = 'search';
const TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };
/** Paisa's settle spring (dampingRatio 0.8, StiffnessMediumLow) for the label opening and the tabs making room. */
const SETTLE = LinearTransition.springify().damping(32).stiffness(400).mass(1);

export type FloatingTabBarProps = {
  state: TabBarState;
  emitter: TabBarEmitter;
  navigateToTab: (routeKey: string) => void;
};

/**
 * Floating tab chrome for Android, after Paisa's floating navbar:
 * - Expanded: a capsule that hugs its tabs, centered, with search as its own
 *   circle beside it. Every tab is an icon; the selected one sits on a pill
 *   and opens its label beside the icon.
 * - Search focused: mini home circle + search field pill
 * - Scroll minimized: mini active-tab circle + search circle
 *
 * Its motion follows the dock in Expressive Clock: one pill slides between
 * the tabs, the capsule gives under a finger and lights up there, and each
 * icon makes its own small move when tapped.
 */
export function FloatingTabBar({ state, emitter, navigateToTab }: FloatingTabBarProps) {
  const { colors, scheme } = useTheme();
  const boardsTab = useSettingsStore((s) => s.boardsTab);
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

  // Where each tab sits in the capsule, so one pill can slide between them.
  const [spans, setSpans] = useState<Record<string, { x: number; width: number }>>({});
  // Bumped on every tap, so an icon replays its move on the tab you're already on too.
  const [taps, setTaps] = useState(0);
  const pillLeft = useSharedValue(0);
  const pillRight = useSharedValue(0);
  const pillShown = useSharedValue(0);
  const activeSpan = spans[activeRoute];
  const activeX = activeSpan?.x;
  const activeWidth = activeSpan?.width;
  useEffect(() => {
    // Search isn't in the capsule: the pill fades where it was.
    if (activeX === undefined || activeWidth === undefined) {
      pillShown.set(withTiming(0, { duration: 160 }));
      return;
    }
    const left = activeX;
    const right = activeX + activeWidth;
    if (pillShown.get() === 0 && pillRight.get() === 0) {
      // First placement: appear in place.
      pillLeft.set(left);
      pillRight.set(right);
    } else {
      // The edge facing the new tab leads and the other follows, so the pill
      // stretches a little on the way over.
      const forward = left > pillLeft.get();
      const lead = { ...EXPRESSIVE.indicatorLead, reduceMotion: ReduceMotion.System };
      const trail = { ...EXPRESSIVE.indicatorTrail, reduceMotion: ReduceMotion.System };
      pillLeft.set(withSpring(left, forward ? trail : lead));
      pillRight.set(withSpring(right, forward ? lead : trail));
    }
    pillShown.set(withTiming(1, { duration: 160 }));
  }, [activeX, activeWidth, pillLeft, pillRight, pillShown]);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillShown.value,
    left: pillLeft.value,
    width: Math.max(0, pillRight.value - pillLeft.value),
  }));

  const capsulePress = useElasticPress({ maxStretch: 0.04, pressedScale: 0.97 });

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
  // the window and an absolutely positioned bar would sit *under* the keyboard.
  // On Search the bar holds the query field, so it rides on top of the
  // keyboard. Everywhere else it gets out of the way while the user types,
  // like Google Photos, instead of covering the field they're typing into.
  const keyboard = useAnimatedKeyboard();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const hideForKeyboard = keyboardOpen && !searchFocused;
  const keyboardStyle = useAnimatedStyle(() => {
    if (searchFocused) {
      const lift = Math.max(0, keyboard.height.value - insets.bottom);
      return { opacity: 1, transform: [{ translateY: -lift }] };
    }
    // Slide down and fade as the keyboard rises; this tracks the keyboard
    // frame by frame, so there is no gap or jump.
    const shown = keyboard.height.value > 1 ? 0 : 1;
    return {
      opacity: withTiming(shown, { duration: 160 }),
      transform: [
        { translateY: withTiming(shown ? 0 : 32, { duration: 180 }) },
        { scale: withTiming(shown ? 1 : 0.92, { duration: 180 }) },
      ],
    };
  }, [searchFocused]);
  // Paisa: a little of the accent over a raised surface, so the bar belongs
  // to the palette without turning into a tinted slab. The selected tab's
  // pill is the stronger tonal fill; the other icons are muted.
  const surface = mixHex(colors.bg3, colors.accent, isDark ? 0.1 : 0.08);
  const selectionFill = colors.selectionBg;
  const onSelection = colors.onSelectionBg;
  const inactive = colors.text2;

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
    setTaps((n) => n + 1);
    const event = emitter.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (routeName !== activeRoute && !event.defaultPrevented) {
      navigateToTab(route.key);
    }
    if (routeName !== SEARCH_ROUTE) expand();
  };

  // Frosted like Paisa's bar: the screen blurs through a wash of the bar's
  // colour, and a bright edge marks the glass where a shadow would show through.
  // Without blur it is a solid bar with a shadow, coloured by the accent on
  // light themes (a coloured shadow can't be seen on a dark screen).
  const frostTarget = useFrostTarget();
  const frosted = CAN_FROST && frostTarget != null;
  const shell = frosted
    ? ({
        overflow: 'hidden',
        borderWidth: 1.25,
        borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)',
      } as const)
    : ({
        backgroundColor: surface,
        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.45)' : `0 8px 24px ${alpha(colors.accent, 0.24)}`,
      } as const);
  const frost = frosted ? <Frost tint={surface} strength={isDark ? 0.55 : 0.6} intensity={70} /> : null;
  // White light on dark themes, the accent on light ones, where white wouldn't show.
  const glowColor = isDark ? 'rgba(255,255,255,0.16)' : alpha(colors.accent, 0.16);

  return (
    <Animated.View
      pointerEvents={hideForKeyboard ? 'none' : 'box-none'}
      accessibilityElementsHidden={hideForKeyboard}
      importantForAccessibility={hideForKeyboard ? 'no-hide-descendants' : 'auto'}
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
          style={[styles.layer, styles.centered, expandedStyle]}
          pointerEvents={compact ? 'none' : 'box-none'}>
          <Animated.View
            {...capsulePress.handlers}
            style={[styles.capsule, shell, capsulePress.style]}>
            {frost}
            <PressGlow press={capsulePress} color={glowColor} radius={FLOATING_TAB_BAR_HEIGHT / 2} />
            <Animated.View
              pointerEvents="none"
              style={[styles.pill, { backgroundColor: selectionFill }, pillStyle]}
            />
            {MAIN_TABS.filter((tab) => boardsTab || tab.route !== 'deck').map((tab) => {
              const focused = activeRoute === tab.route;
              return (
                // Every tab is an icon. The selected one sits on the pill and
                // opens its label beside the icon; its neighbours make room.
                <Animated.View
                  key={tab.route}
                  layout={SETTLE}
                  onLayout={(event) => {
                    const { x, width } = event.nativeEvent.layout;
                    setSpans((prev) =>
                      prev[tab.route]?.x === x && prev[tab.route]?.width === width
                        ? prev
                        : { ...prev, [tab.route]: { x, width } }
                    );
                  }}>
                  <Pressable
                    onPress={() => goTo(tab.route)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={tab.label}
                    style={{
                      // The capsule gives and lights up under the finger, so
                      // a tab doesn't dim or shrink on top of that.
                      height: FLOATING_TAB_BAR_HEIGHT - 16,
                      paddingHorizontal: focused ? 18 : 14,
                      borderRadius: 999,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <TabGlyph motion={tab.motion} taps={focused ? taps : 0} selected={focused}>
                      <MaterialCommunityIcons
                        name={focused ? tab.iconFocused : tab.icon}
                        size={24}
                        color={focused ? onSelection : inactive}
                      />
                    </TabGlyph>
                    {focused ? (
                      <Animated.View
                        entering={FadeIn.duration(220)}
                        exiting={FadeOut.duration(100)}
                        style={{ paddingLeft: 8 }}>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: '600',
                            color: onSelection,
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
          </Animated.View>

          <ElasticCircle style={[styles.circle, shell]} glowColor={glowColor} frost={frost}>
            <Pressable
              onPress={() => goTo(SEARCH_ROUTE)}
              accessibilityRole="tab"
              accessibilityState={{ selected: searchFocused }}
              accessibilityLabel="Search"
              style={styles.circleHit}>
              <MaterialCommunityIcons name="magnify" size={24} color={inactive} />
            </Pressable>
          </ElasticCircle>
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
          <ElasticCircle style={[styles.circle, shell]} glowColor={glowColor} frost={frost}>
            <Pressable
              onPress={() => {
                if (searchFocused) goTo(returnRoute);
                else expand();
              }}
              accessibilityRole="button"
              accessibilityLabel={searchFocused ? `Back to ${returnTab.label}` : 'Expand tabs'}
              style={styles.circleHit}>
              <MaterialCommunityIcons
                name={searchFocused ? returnTab.iconFocused : activeMain.iconFocused}
                size={22}
                color={inactive}
              />
            </Pressable>
          </ElasticCircle>

          {searchFocused ? (
            <View style={[styles.searchPill, shell, { flex: 1 }]}>
              {frost}
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
            <ElasticCircle style={[styles.circle, shell]} glowColor={glowColor} frost={frost}>
              <Pressable
                onPress={() => goTo(SEARCH_ROUTE)}
                accessibilityRole="tab"
                accessibilityLabel="Search"
                style={styles.circleHit}>
                <MaterialCommunityIcons name="magnify" size={24} color={inactive} />
              </Pressable>
            </ElasticCircle>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** A round button that gives under a finger and lights up where it's touched. */
function ElasticCircle({
  children,
  style,
  glowColor,
  frost,
}: {
  children: ReactNode;
  style: StyleProp<ViewStyle>;
  glowColor: string;
  /** Frosted backdrop, drawn under everything else. */
  frost?: ReactNode;
}) {
  const press = useElasticPress({ maxStretch: 0.08, maxTranslate: 2, pressedScale: 0.94 });
  return (
    <Animated.View {...press.handlers} style={[style, press.style]}>
      {frost}
      <PressGlow press={press} color={glowColor} radius={FLOATING_TAB_CIRCLE / 2} size={28} />
      {children}
    </Animated.View>
  );
}

/** Plays a tab icon's move each time [taps] changes. Timings are Expressive Clock's. */
function TabGlyph({
  motion,
  taps,
  selected,
  children,
}: {
  motion: IconMotion;
  taps: number;
  selected: boolean;
  children: ReactNode;
}) {
  // Icons you aren't on sit a touch smaller, as in Paisa.
  const size = useSharedValue(selected ? 1 : 0.94);
  useEffect(() => {
    size.set(withTiming(selected ? 1 : 0.94, { duration: 180 }));
  }, [selected, size]);
  const turn = useSharedValue(0);
  const hop = useSharedValue(0);
  useEffect(() => {
    if (taps === 0) return;
    const reduce = { reduceMotion: ReduceMotion.System };
    if (motion === 'wiggle') {
      turn.set(
        withSequence(
          withTiming(-5, { duration: 65, ...reduce }),
          withTiming(5, { duration: 85, ...reduce }),
          withTiming(-3, { duration: 65, ...reduce }),
          withTiming(0, { duration: 65, ...reduce })
        )
      );
    } else if (motion === 'turn') {
      // A finished half turn of a cog looks the same as none, so snapping back doesn't show.
      turn.set(
        withSequence(withTiming(180, { duration: 320, ...reduce }), withTiming(0, { duration: 0 }))
      );
    } else {
      hop.set(
        withSequence(
          withTiming(1, { duration: 110, ...reduce }),
          withSpring(0, { damping: 20, stiffness: 500, ...reduce })
        )
      );
    }
  }, [taps, motion, turn, hop]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -3 * hop.value },
      { rotate: `${turn.value}deg` },
      { scale: size.value },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** `#RGB` or `#RRGGBB` as an rgba() string. Anything else comes back unchanged. */
function alpha(color: string, opacity: number): string {
  let hex = color.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) hex = `#${[...hex.slice(1)].map((c) => c + c).join('')}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return color;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
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
  // Paisa's bar hugs its tabs and sits centered; search rides beside it.
  centered: {
    justifyContent: 'center',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: FLOATING_TAB_BAR_HEIGHT,
    borderRadius: FLOATING_TAB_BAR_HEIGHT / 2,
    borderCurve: 'continuous',
    paddingHorizontal: 8,
  },
  pill: {
    position: 'absolute',
    top: 8,
    height: FLOATING_TAB_BAR_HEIGHT - 16,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  circleHit: {
    width: FLOATING_TAB_CIRCLE,
    height: FLOATING_TAB_CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
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
