import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { Platform, Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useTabBarContentPadding, useTabBarMinimizeOnScroll } from '@/lib/tab-bar';
import { ScrollView, Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Minimum tappable row height (Material / Apple HIG). */
const ROW_MIN_HEIGHT = 56;

/** Scroll container shared by every settings screen. */
export function SettingsScreen({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const paddingBottom = useTabBarContentPadding(48);
  const onTabBarScroll = useTabBarMinimizeOnScroll();
  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      scrollEventThrottle={16}
      onScroll={onTabBarScroll}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom, gap: 20 }}>
      {children}
    </ScrollView>
  );
}

/**
 * A rounded, elevated card that visually groups a cluster of rows.
 * Paisa-inspired: large continuous corners (24dp), surfaceContainerLow fill,
 * 2dp gap between visual groups. On iOS 26+ uses liquid glass.
 */
export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-2">
      {title ? (
        <Text
          className="px-3 text-xs font-semibold uppercase tracking-wide"
          style={{ color: colors.accent }}>
          {title}
        </Text>
      ) : null}
      <GlassSurface radius={24}>{children}</GlassSurface>
    </View>
  );
}

/** Tinted circular icon used at the start of a settings row (Paisa SettingsItemIcon). */
export function SettingsItemIcon({
  icon,
  containerColor,
  contentColor,
}: {
  icon: IconName;
  containerColor?: string;
  contentColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      className="h-11 w-11 items-center justify-center rounded-full"
      style={{ backgroundColor: containerColor ?? colors.primaryContainer }}>
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={contentColor ?? colors.onPrimaryContainer}
      />
    </View>
  );
}

/** A Material navigation/action row: leading icon, title, optional subtitle + trailing. */
export function SettingsRow({
  icon,
  iconColor,
  iconContainerColor,
  leading,
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
  iconContainerColor?: string;
  /** Custom leading element, used instead of `icon` (e.g. a provider avatar). */
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  danger?: boolean;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const tint = danger ? colors.danger : (iconColor ?? colors.onPrimaryContainer);
  const titleColor = danger ? colors.danger : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      android_ripple={onPress ? { color: colors.separator } : undefined}
      style={({ pressed }) => ({
        minHeight: ROW_MIN_HEIGHT,
        backgroundColor: selected
          ? colors.selectionBg
          : pressed && Platform.OS !== 'android'
            ? colors.bg3
            : 'transparent',
      })}>
      <View
        className="flex-row items-center gap-3 px-4 py-3"
        style={{ minHeight: ROW_MIN_HEIGHT }}>
        {leading ?? null}
        {!leading && icon ? (
          <SettingsItemIcon
            icon={icon}
            containerColor={
              danger
                ? `${colors.danger}22`
                : iconContainerColor ?? (selected ? colors.selectionBg : colors.primaryContainer)
            }
            contentColor={selected ? colors.onSelectionBg : tint}
          />
        ) : null}
        <View className="flex-1 gap-0.5">
          <Text
            className="text-base font-semibold"
            style={{ color: selected ? colors.onSelectionBg : titleColor }}
            numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-sm" style={{ color: colors.text2 }} numberOfLines={2}>
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

/** Hairline separator between rows inside a group (inset past the circular icon). */
export function RowSeparator() {
  return <View className="bg-sf-separator ml-[68px] h-px" />;
}
