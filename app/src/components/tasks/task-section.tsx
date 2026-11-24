import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { TurningChevron, useSpringValue } from '@/components/ui/motion';
import { RollingNumber } from '@/components/ui/rolling-number';
import { COLLAPSE_OUT, EXPAND_IN, expandLayout } from '@/lib/motion';
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
      <Animated.View layout={expandLayout()} style={{ paddingTop: 22 }}>
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
            <RollingNumber value={count} style={{ fontSize: 15, color: colors.text3 }} />
            <View style={{ flex: 1 }} />
            {/* Things' disclosure arrow, turning instead of swapping glyphs. */}
            <TurningSymbol open={!collapsed} color={colors.text3} />
          </View>
          <View style={{ height: 0.5, backgroundColor: colors.separator }} />
        </Pressable>
        {collapsed ? null : (
          <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT} style={{ paddingTop: 4 }}>
            {children}
          </Animated.View>
        )}
      </Animated.View>
    );
  }
  return (
    <Animated.View layout={expandLayout()} style={{ paddingTop: 16 }}>
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
            <Text className="text-sf-text-2 text-sm font-semibold">{title} ·</Text>
            <RollingNumber
              value={count}
              style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text2 }}
            />
          </View>
          <TurningChevron expanded={!collapsed} color={colors.text2} />
        </View>
      </Pressable>
      {collapsed ? null : (
        <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT} style={{ paddingTop: 4 }}>
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

function TurningSymbol({ open, color }: { open: boolean; color: string }) {
  const turn = useSpringValue(open ? 90 : 0, 'arrow');
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <Animated.View style={style}>
      <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={color} />
    </Animated.View>
  );
}
