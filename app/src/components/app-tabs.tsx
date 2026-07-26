import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { IosFloatingTabBar } from '@/components/ios-floating-tab-bar';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { useFloatingTabBar } from '@/lib/tab-bar';

const FLOATING_SCREENS = ['(tasks)', 'deck', 'ai', 'settings', 'search'] as const;

const NATIVE_TABS = [
  { name: '(tasks)', label: 'Tasks', sf: 'checklist', md: 'checklist' },
  { name: 'deck', label: 'Boards', sf: 'rectangle.split.3x1', md: 'view_column' },
  { name: 'ai', label: 'AI', sf: 'sparkles', md: 'auto_awesome' },
  { name: 'settings', label: 'Settings', sf: 'gear', md: 'settings' },
  { name: 'search', label: 'Search', sf: 'magnifyingglass', md: 'search', role: 'search' },
] as const;

export default function AppTabs() {
  const floating = useFloatingTabBar();

  // Switching navigators remounts tabs; key keeps state consistent per mode.
  if (Platform.OS === 'android' && floating) {
    return <FloatingTabs key="floating-tabs" />;
  }

  return <MaterialNativeTabs key="native-tabs" />;
}

function MaterialNativeTabs() {
  const { colors, scheme } = useTheme();
  const inactiveColor = colors.text2;

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      // Only the selected destination is labeled: unselected tabs are bare
      // icons and the label animates in under the pill as it slides across.
      // (Android-only knob; iOS always labels its native tab bar.)
      labelVisibilityMode="selected"
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
 * JS Tabs + custom iOS 26–style floating chrome (capsule + separate search).
 * NativeTabs cannot render this layout on Android.
 */
function FloatingTabs() {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <IosFloatingTabBar state={props.state} navigation={props.navigation} />}
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
