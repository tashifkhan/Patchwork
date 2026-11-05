import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';
import { NAVIGATION_RAIL_WIDTH } from '@/hooks/use-adaptive-layout';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const DESTINATIONS: { route: string; label: string; icon: IconName; iconFocused: IconName }[] = [
  { route: '(tasks)', label: 'Tasks', icon: 'checkbox-marked-outline', iconFocused: 'format-list-checks' },
  { route: 'deck', label: 'Boards', icon: 'view-column-outline', iconFocused: 'view-column' },
  { route: 'search', label: 'Search', icon: 'magnify', iconFocused: 'magnify' },
  { route: 'settings', label: 'Settings', icon: 'cog-outline', iconFocused: 'cog' },
];

type RailProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  emitter: {
    emit: (event: { type: string; target?: string; canPreventDefault?: boolean }) => {
      defaultPrevented: boolean;
    };
  };
  navigateToTab: (routeKey: string) => void;
};

/**
 * Material 3 navigation rail for medium and wider Android windows: tablets,
 * an unfolded Pixel Fold or Galaxy Z Fold, and phones in landscape. The rail
 * replaces the bottom bar so content gets the full window height.
 *
 * Destinations sit at the top, each a 56x32 pill indicator over its label
 * (M3 Expressive collapsed rail). Unlike the bottom bar, every destination is
 * labeled, since there is room for it.
 */
export function NavigationRail({ state, emitter, navigateToTab }: RailProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const active = state.routes[state.index]?.name;

  return (
    <View
      accessibilityRole="tablist"
      style={{
        width: NAVIGATION_RAIL_WIDTH + insets.left,
        paddingLeft: insets.left,
        paddingTop: insets.top + 44,
        paddingBottom: insets.bottom + 16,
        backgroundColor: colors.bg,
        alignItems: 'center',
        gap: 12,
      }}>
      {DESTINATIONS.map((dest) => {
        const route = state.routes.find((r) => r.name === dest.route);
        if (!route) return null;
        const focused = active === dest.route;
        return (
          <Pressable
            key={dest.route}
            accessibilityRole="tab"
            accessibilityLabel={dest.label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              if (focused) haptics.tap();
              else haptics.selection();
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={{ width: NAVIGATION_RAIL_WIDTH, alignItems: 'center', gap: 4, paddingVertical: 4 }}>
            {({ pressed }) => (
              <>
                <View
                  style={{
                    width: 56,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: focused
                      ? colors.selectionBg
                      : pressed
                        ? colors.bg3
                        : 'transparent',
                  }}>
                  <MaterialCommunityIcons
                    name={focused ? dest.iconFocused : dest.icon}
                    size={24}
                    color={focused ? colors.onSelectionBg : colors.text2}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: focused ? '700' : '500',
                    color: focused ? colors.accent : colors.text2,
                  }}>
                  {dest.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
