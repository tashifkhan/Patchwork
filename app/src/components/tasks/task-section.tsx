import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable } from 'react-native';

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
  if (Platform.OS === 'ios') {
    // Things: a bold sentence-case heading over a hairline, count in gray.
    return (
      <View style={{ paddingTop: 22 }}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={`${title}, ${count} items`}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 36, justifyContent: 'flex-end' })}>
          <View className="flex-row items-center" style={{ gap: 6, paddingBottom: 6 }}>
            {icon ? <MaterialCommunityIcons name={icon} size={17} color={colors.text} /> : null}
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.accent }}>{title}</Text>
            <Text style={{ fontSize: 15, color: colors.text3, fontVariant: ['tabular-nums'] }}>{count}</Text>
            <View style={{ flex: 1 }} />
            <SymbolView
              name={collapsed ? 'chevron.right' : 'chevron.down'}
              size={13}
              weight="semibold"
              tintColor={colors.text3}
            />
          </View>
          <View style={{ height: 0.5, backgroundColor: colors.separator }} />
        </Pressable>
        {collapsed ? null : <View style={{ paddingTop: 4 }}>{children}</View>}
      </View>
    );
  }
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
