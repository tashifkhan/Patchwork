import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type ComponentProps } from 'react';
import { Platform, Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { ScrollView, Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Scroll container shared by every settings screen. */
export function SettingsScreen({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 48, gap: 18 }}>
      {children}
    </ScrollView>
  );
}

/**
 * A rounded, elevated card that visually groups a cluster of rows. On iOS 26+
 * the surface is rendered as liquid glass; everywhere else it falls back to
 * the themed grouped-background tint with a subtle shadow.
 */
export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  return (
    <View className="gap-1.5">
      {title ? (
        <Text className="text-sf-text-2 px-4 text-xs font-semibold uppercase tracking-wide">
          {title}
        </Text>
      ) : null}
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={scheme}
          style={{
            borderRadius: 24,
            borderCurve: 'continuous',
            overflow: 'hidden',
          }}>
          {children}
        </GlassView>
      ) : (
        <View
          className="bg-sf-bg-2 overflow-hidden rounded-3xl"
          style={{ borderCurve: 'continuous', boxShadow: `0 1px 3px ${colors.separator}` }}>
          {children}
        </View>
      )}
    </View>
  );
}

/** A Material navigation/action row: leading icon, title, optional subtitle + trailing. */
export function SettingsRow({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
  trailing,
  showChevron,
  danger,
  selected,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  danger?: boolean;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const tint = danger ? colors.red : (iconColor ?? colors.text2);
  const titleColor = danger ? 'text-sf-red' : 'text-sf-text';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: colors.gray3 } : undefined}
      style={({ pressed }) => ({
        backgroundColor:
          selected
            ? colors.selectionBg
            : pressed && Platform.OS !== 'android'
              ? colors.bg3
              : 'transparent',
      })}>
      <View className="min-h-[56px] flex-row items-center gap-4 px-4 py-2.5">
        {icon ? (
          <MaterialCommunityIcons name={icon} size={24} color={selected ? colors.onSelectionBg : tint} />
        ) : null}
        <View className="flex-1">
          <Text className={`${titleColor} text-base`} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-sf-text-2 text-sm" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
        {showChevron ? (
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.text3} />
        ) : null}
      </View>
    </Pressable>
  );
}

/** Hairline separator between rows inside a group (inset to align with text). */
export function RowSeparator() {
  return <View className="bg-sf-separator ml-[60px] h-px" />;
}
