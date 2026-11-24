import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { FloatingTabBar, type FloatingTabBarProps } from '@/components/floating-tab-bar';
import { Frost, FrostTarget, FrostTargetProvider } from '@/components/ui/frost';
import { NavigationRail } from '@/components/navigation-rail';
import { useTheme } from '@/components/theme/context';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { haptics } from '@/lib/haptics';
import { useFloatingTabBar } from '@/lib/tab-bar';
import { useSettingsStore } from '@/stores/settings-store';
import { useTabBarChromeStore } from '@/stores/tab-bar-chrome-store';

/**
 * The floating bar is frosted glass, and expo-blur on Android can only blur
 * what sits inside a BlurTargetView. A tab bar rendered by the navigator would
 * sit inside the screens it should blur, so the navigator hands its props out
 * through this store and the bar is drawn next to it instead.
 */
const useFloatingBarProps = create<{ props: FloatingTabBarProps | null }>(() => ({ props: null }));

function FloatingBarBridge({ state, emitter, navigateToTab }: FloatingTabBarProps) {
  useEffect(() => {
    useFloatingBarProps.setState({ props: { state, emitter, navigateToTab } });
  }, [state, emitter, navigateToTab]);
  useEffect(() => () => useFloatingBarProps.setState({ props: null }), []);
  return null;
}

const FLOATING_SCREENS = ['(tasks)', 'deck', 'settings', 'search'] as const;

// iOS shows the filled symbol for the selected tab, like the system apps.
const NATIVE_TABS = [
  { name: '(tasks)', label: 'Tasks', sf: { default: 'checklist', selected: 'checklist' }, md: 'checklist' },
  {
    name: 'deck',
    label: 'Boards',
    sf: { default: 'rectangle.split.3x1', selected: 'rectangle.split.3x1.fill' },
    md: 'view_column',
  },
  { name: 'settings', label: 'Settings', sf: { default: 'gearshape', selected: 'gearshape.fill' }, md: 'settings' },
  {
    name: 'search',
    label: 'Search',
    sf: { default: 'magnifyingglass', selected: 'magnifyingglass' },
    md: 'search',
    role: 'search',
  },
] as const;

export default function AppTabs() {
  const floating = useFloatingTabBar();
  const { navigationRail } = useAdaptiveLayout();

  // Switching navigators remounts tabs; key keeps state consistent per mode.
  // Medium and wider Android windows (tablets, unfolded foldables, landscape)
  // get a side rail; the bottom bar and the floating pill are for phones.
  if (navigationRail) {
    return <RailTabs key="rail-tabs" />;
  }
  if (Platform.OS === 'android' && floating) {
    return <FloatingTabs key="floating-tabs" />;
  }

  return <MaterialNativeTabs key="native-tabs" />;
}

function MaterialNativeTabs() {
  const { colors } = useTheme();
  const inactiveColor = colors.text2;
  const tabBarLabels = useSettingsStore((s) => s.tabBarLabels);
  const boardsTab = useSettingsStore((s) => s.boardsTab);
  const searchTab = useSettingsStore((s) => s.searchTab);
  const hidden = (name: string) => (name === 'deck' && !boardsTab) || (name === 'search' && !searchTab);

  if (Platform.OS === 'ios') {
    // The system tab bar: Liquid Glass on iOS 26+, with the app accent as the
    // only tint. A custom background or blur here would turn the glass off.
    return (
      <NativeTabs minimizeBehavior="onScrollDown" sidebarAdaptable tintColor={colors.accent}>
        {NATIVE_TABS.map((tab) => (
          <NativeTabs.Trigger
            key={tab.name}
            name={tab.name}
            hidden={hidden(tab.name)}
            role={'role' in tab ? tab.role : undefined}
            listeners={{ tabPress: () => haptics.selection() }}>
            <NativeTabs.Trigger.Icon sf={tab.sf} />
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      // iPad (and large iPhones in landscape on iOS 27): the tab bar can turn
      // into the system sidebar, like Files and Music.
      sidebarAdaptable
      // By default only the selected destination is labeled: unselected tabs
      // are bare icons and the label animates in under the pill. "Navbar
      // labels" in Look and feel labels every tab.
      // (Android-only knob; iOS always labels its native tab bar.)
      labelVisibilityMode={tabBarLabels ? 'labeled' : 'selected'}
      backgroundColor={colors.bg2}
      tintColor={colors.accent}
      iconColor={{ default: inactiveColor, selected: colors.onSelectionBg }}
      indicatorColor={colors.selectionBg}
      rippleColor={colors.gray3}
      shadowColor={colors.separator}
      labelStyle={{
        default: { color: inactiveColor, fontSize: 12, fontWeight: '500' },
        selected: { color: colors.accent, fontSize: 12, fontWeight: '500' },
      }}>
      {NATIVE_TABS.map((tab) => (
        <NativeTabs.Trigger
          key={tab.name}
          name={tab.name}
          hidden={hidden(tab.name)}
          role={'role' in tab ? tab.role : undefined}
          // The native bar owns the pill/label animation; we only add the
          // selection tick so switching destinations feels physical.
          listeners={{ tabPress: () => haptics.selection() }}>
          <NativeTabs.Trigger.Icon md={tab.md} />
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

/**
 * JS Tabs + custom Google Photos–style floating chrome (capsule + separate search).
 * NativeTabs cannot render this layout on Android.
 */
function FloatingTabs() {
  const { colors } = useTheme();
  const target = useRef<View | null>(null);
  const bar = useFloatingBarProps((s) => s.props);

  return (
    <FrostTargetProvider target={target}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <FrostTarget target={target} style={{ flex: 1, backgroundColor: colors.bg }}>
          <Tabs
      tabBar={(props) => (
        <FloatingBarBridge
          state={props.state}
          emitter={props.emitter}
          navigateToTab={props.navigateToTab}
        />
      )}
      screenOptions={{
        headerShown: false,
        // Hide the default bar shell — we render absolute floating chrome.
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: 0,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      {FLOATING_SCREENS.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ title: name }} />
      ))}
          </Tabs>
        </FrostTarget>
        <StatusBarFrost />
        {bar ? <FloatingTabBar {...bar} /> : null}
      </View>
    </FrostTargetProvider>
  );
}

/**
 * Frosted glass behind the status bar, so rows scrolling up under the clock
 * blur instead of colliding with it. It frosts in once the screen scrolls.
 */
function StatusBarFrost() {
  const insets = useSafeAreaInsets();
  const scrolled = useTabBarChromeStore((s) => s.lastScrollY > 8);
  const style = useAnimatedStyle(() => ({ opacity: withTiming(scrolled ? 1 : 0, { duration: 180 }) }), [scrolled]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, overflow: 'hidden' }, style]}>
      <Frost strength={0.5} />
    </Animated.View>
  );
}

/** JS Tabs with the Material 3 navigation rail on the leading edge. */
function RailTabs() {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => (
        <NavigationRail
          state={props.state}
          emitter={props.emitter}
          navigateToTab={props.navigateToTab}
        />
      )}
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'left',
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      {FLOATING_SCREENS.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ title: name }} />
      ))}
    </Tabs>
  );
}
