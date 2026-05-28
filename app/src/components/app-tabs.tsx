import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useTheme } from '@/components/theme/context';

export default function AppTabs() {
  const { colors, scheme } = useTheme();
  const inactiveColor = colors.text2;

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      backgroundColor={colors.bg2}
      tintColor={colors.accent}
      iconColor={{ default: inactiveColor, selected: colors.onSelectionBg }}
      indicatorColor={colors.selectionBg}
      rippleColor={colors.gray3}
      shadowColor={colors.separator}
      blurEffect={Platform.OS === 'ios' ? (scheme === 'dark' ? 'systemMaterialDark' : 'systemMaterialLight') : undefined}
      labelStyle={{
        default: { color: inactiveColor, fontSize: 12, fontWeight: '500' },
        selected: { color: colors.accent, fontSize: 12, fontWeight: '500' },
      }}>
      <NativeTabs.Trigger name="(tasks)">
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
        <NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="deck">
        <NativeTabs.Trigger.Icon sf="rectangle.split.3x1" md="view_column" />
        <NativeTabs.Trigger.Label>Boards</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="ai">
        <NativeTabs.Trigger.Icon sf="sparkles" md="auto_awesome" />
        <NativeTabs.Trigger.Label>Import</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gear" md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
