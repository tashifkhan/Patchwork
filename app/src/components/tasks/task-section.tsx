import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Text, View } from '@/tw';

/** Collapsible group heading ("TODAY · 3") used by the Tasks screen buckets. */
export function Section({
  title,
  count,
  collapsed,
  onToggle,
  icon,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Optional leading glyph, e.g. GitHub for the issues section. */
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="pt-4">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${title}, ${count} items`}
        hitSlop={8}
        style={({ pressed }) => ({
          opacity: pressed ? 0.6 : 1,
          minHeight: 44,
          justifyContent: 'center',
        })}>
        <View className="flex-row items-center justify-between py-2">
          <View className="flex-row items-center gap-1.5">
            {icon ? <MaterialCommunityIcons name={icon} size={16} color={colors.text2} /> : null}
            <Text className="text-sf-text-2 text-sm font-semibold uppercase">
              {title} · {count}
            </Text>
          </View>
          <MaterialCommunityIcons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={20}
            color={colors.text2}
          />
        </View>
      </Pressable>
      {collapsed ? null : <View className="pt-1">{children}</View>}
    </View>
  );
}
