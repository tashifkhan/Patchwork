import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { FloatingTabBar } from '@/components/floating-tab-bar';
import { NavigationRail } from '@/components/navigation-rail';
import { useTheme } from '@/components/theme/context';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { haptics } from '@/lib/haptics';
import { useFloatingTabBar } from '@/lib/tab-bar';
import { useSettingsStore } from '@/stores/settings-store';

const FLOATING_SCREENS = ['(tasks)', 'deck', 'settings', 'search'] as const;

const NATIVE_TABS = [
  { name: '(tasks)', label: 'Tasks', sf: 'checklist', md: 'checklist' },
  { name: 'deck', label: 'Boards', sf: 'rectangle.split.3x1', md: 'view_column' },
  { name: 'settings', label: 'Settings', sf: 'gear', md: 'settings' },
  { name: 'search', label: 'Search', sf: 'magnifyingglass', md: 'search', role: 'search' },
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
  const { colors, scheme } = useTheme();
  const inactiveColor = colors.text2;
  const tabBarLabels = useSettingsStore((s) => s.tabBarLabels);

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
      blurEffect={
        Platform.OS === 'ios'
          ? scheme === 'dark'
            ? 'systemMaterialDark'
            : 'systemMaterialLight'
          : undefined
      }
      labelStyle={{
        default: { color: inactiveColor, fontSize: 12, fontWeight: '500' },
        selected: { color: colors.accent, fontSize: 12, fontWeight: '500' },
      }}>
      {NATIVE_TABS.map((tab) => (
        <NativeTabs.Trigger
          key={tab.name}
          name={tab.name}
          role={'role' in tab ? tab.role : undefined}
          // The native bar owns the pill/label animation; we only add the
          // selection tick so switching destinations feels physical.
          listeners={{ tabPress: () => haptics.selection() }}>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
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

  return (
    <Tabs
      tabBar={(props) => (
        <FloatingTabBar
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
