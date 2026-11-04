import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  Children,
  Fragment,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  type TextInputProps,
} from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTabBarContentPadding, useTabBarMinimizeOnScroll } from '@/lib/tab-bar';
import type { SchemeName, ThemeColors } from '@/lib/theme';
import { ScrollView, Text, TextInput, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const IOS = Platform.OS === 'ios';
const ANDROID = Platform.OS === 'android';

/** True on iOS, where settings pages use the inset-grouped Apple layout. */
export const SETTINGS_IOS = IOS;

/*
 * Two native looks behind one API, following the split in t3code's mobile app
 * (apps/mobile/src/components/ui/ListSection, ListRowLayout):
 *
 * iOS 26: inset grouped list. Opaque cells with 26pt continuous corners on the
 * grouped background, SF Symbols in accent-colored tiles, hairline separators inset
 * to the title, trailing value + chevron. Liquid Glass belongs to the chrome
 * (nav bar, tab bar, switches, segmented controls), not to the cells. That is
 * how Apple's own Settings app draws it.
 *
 * Android: Material 3 Expressive segmented list, as in Android 16 Settings.
 * Every row is its own surfaceContainer card, 2dp apart, with 24dp outer and
 * 4dp inner corners. Tonal icon circles, supporting text below the title, no
 * dividers or chevrons, ripple feedback, Compose switches and sliders.
 */

/** iOS 26 inset-grouped corner radius. */
const IOS_GROUP_RADIUS = 26;
/** Android 16 settings segment corners. */
const ANDROID_OUTER_RADIUS = 24;
const ANDROID_INNER_RADIUS = 4;
const ANDROID_SEGMENT_GAP = 2;

/** Leading edge of row titles on iOS: 16 padding + 30 tile + 14 gap. */
const IOS_TITLE_INSET = 60;

/* ------------------------------------------------------------------------ */
/* Colors                                                                    */
/* ------------------------------------------------------------------------ */

export interface SettingsColors {
  /** Screen and header background. */
  screen: string;
  /** Group / segment fill. */
  cell: string;
  /** Pressed-row highlight on iOS. */
  pressed: string;
  /** Text field / inset well fill that reads against `cell`. */
  field: string;
}

export function settingsColors(colors: ThemeColors, scheme: SchemeName): SettingsColors {
  if (IOS) {
    // systemGroupedBackground / secondarySystemGroupedBackground. Light mode
    // puts white cells on gray; dark mode puts gray cells on black.
    const dark = scheme === 'dark';
    return {
      screen: dark ? colors.bg : colors.bg2,
      cell: dark ? colors.bg2 : colors.bg,
      pressed: colors.gray3,
      field: dark ? colors.bg3 : colors.bg2,
    };
  }
  return { screen: colors.bg, cell: colors.bg2, pressed: colors.bg3, field: colors.bg3 };
}

export function useSettingsColors(): SettingsColors {
  const { colors, scheme } = useTheme();
  return settingsColors(colors, scheme);
}

/* ------------------------------------------------------------------------ */
/* Icons                                                                     */
/* ------------------------------------------------------------------------ */

/** Material Community icon → SF Symbol for the iOS rows. */
const SF_ICONS: Partial<Record<IconName, SFSymbol>> = {
  brain: 'cpu',
  'cloud-check-outline': 'checkmark.icloud.fill',
  'cloud-alert-outline': 'exclamationmark.icloud.fill',
  plus: 'plus',
  'palette-outline': 'paintbrush.fill',
  'palette-swatch': 'swatchpalette.fill',
  'bell-outline': 'bell.badge.fill',
  'clock-outline': 'clock.fill',
  github: 'chevron.left.forwardslash.chevron.right',
  'star-four-points-outline': 'sparkles',
  refresh: 'arrow.clockwise',
  'source-repository': 'book.closed.fill',
  'source-repository-multiple': 'books.vertical.fill',
  'account-check-outline': 'person.crop.circle.badge.checkmark',
  'pencil-outline': 'pencil',
  at: 'at',
  'format-list-bulleted': 'list.bullet',
  'format-list-checks': 'checklist',
  logout: 'rectangle.portrait.and.arrow.right',
  'open-in-new': 'arrow.up.right.square',
  'circle-opacity': 'moon.fill',
  'contrast-circle': 'circle.lefthalf.filled',
  vibrate: 'iphone.radiowaves.left.and.right',
  'dock-bottom': 'dock.rectangle',
  'trash-can-outline': 'trash.fill',
  'content-save-outline': 'square.and.arrow.down.fill',
  'lan-connect': 'network',
  web: 'globe',
  'lock-outline': 'lock.fill',
  'account-outline': 'person.fill',
  'account-circle-outline': 'person.crop.circle.fill',
  'check-circle-outline': 'checkmark.circle.fill',
  'close-circle-outline': 'xmark.circle.fill',
  'key-outline': 'key.fill',
  'tray-arrow-down': 'tray.and.arrow.down.fill',
};

/**
 * Leading icon. iOS: SF Symbol on a 30pt rounded tile in the accent color.
 * Android: Material icon on a 40dp tonal circle.
 */
export function SettingsItemIcon({
  icon,
  sf,
  containerColor,
  contentColor,
}: {
  icon: IconName;
  /** Override the SF Symbol picked from the icon map. */
  sf?: SFSymbol;
  containerColor?: string;
  contentColor?: string;
}) {
  const { colors } = useTheme();

  if (IOS) {
    const mapped = SF_ICONS[icon];
    return (
      <View
        className="items-center justify-center"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          borderCurve: 'continuous',
          backgroundColor: containerColor ?? colors.accent,
        }}>
        <SymbolView
          name={sf ?? mapped ?? 'gearshape.fill'}
          size={17}
          tintColor={contentColor ?? colors.onAccent}
          weight="medium"
          resizeMode="scaleAspectFit"
          style={{ width: 20, height: 20 }}
        />
      </View>
    );
  }

  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: 40, height: 40, backgroundColor: containerColor ?? colors.primaryContainer }}>
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={contentColor ?? colors.onPrimaryContainer}
      />
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Screen + groups                                                           */
/* ------------------------------------------------------------------------ */

/** Scroll container shared by every settings screen. */
export function SettingsScreen({ children }: { children: ReactNode }) {
  const { screen } = useSettingsColors();
  const paddingBottom = useTabBarContentPadding(48);
  const onTabBarScroll = useTabBarMinimizeOnScroll();
  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: screen }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      scrollEventThrottle={16}
      onScroll={onTabBarScroll}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: IOS ? 8 : 12,
        paddingBottom,
        gap: IOS ? 28 : 24,
      }}>
      {children}
    </ScrollView>
  );
}

/** Section title above a group. Sentence case, styled per platform. */
export function SettingsSectionHeader({
  title,
  trailing,
}: {
  title: string;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-end justify-between gap-3"
      style={{ paddingHorizontal: 16, paddingBottom: IOS ? 0 : 2 }}>
      <Text
        accessibilityRole="header"
        style={
          IOS
            ? {
                flexShrink: 1,
                fontSize: 13,
                lineHeight: 18,
                letterSpacing: -0.08,
                textTransform: 'uppercase',
                color: colors.text2,
              }
            : {
                flexShrink: 1,
                fontSize: 14,
                lineHeight: 20,
                fontWeight: '500',
                letterSpacing: 0.1,
                color: colors.accent,
              }
        }>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

/** Explanatory text under a group. */
export function SettingsFooter({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        paddingHorizontal: 16,
        fontSize: IOS ? 13 : 14,
        lineHeight: IOS ? 18 : 20,
        color: colors.text2,
      }}>
      {children}
    </Text>
  );
}

function isDivider(node: ReactElement): boolean {
  return node.type === RowSeparator || node.type === SettingsDivider;
}

/** Unwrap fragments and drop dividers so Android can segment each row. */
function flattenRows(children: ReactNode): ReactElement[] {
  const rows: ReactElement[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      rows.push(...flattenRows((child.props as { children?: ReactNode }).children));
      return;
    }
    if (!isDivider(child)) rows.push(child);
  });
  return rows;
}

/**
 * A cluster of rows. iOS: one rounded inset-grouped card with hairline
 * dividers. Android: each row becomes its own segment, so dividers inside the
 * group are dropped there.
 */
export function SettingsGroup({
  title,
  titleTrailing,
  footer,
  children,
}: {
  title?: string;
  titleTrailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { cell } = useSettingsColors();

  let body: ReactNode;
  if (ANDROID) {
    const rows = flattenRows(children);
    body = (
      <View style={{ gap: ANDROID_SEGMENT_GAP }}>
        {rows.map((row, index) => {
          const first = index === 0;
          const last = index === rows.length - 1;
          const top = first ? ANDROID_OUTER_RADIUS : ANDROID_INNER_RADIUS;
          const bottom = last ? ANDROID_OUTER_RADIUS : ANDROID_INNER_RADIUS;
          return (
            <View
              key={row.key ?? index}
              style={{
                backgroundColor: cell,
                overflow: 'hidden',
                borderTopLeftRadius: top,
                borderTopRightRadius: top,
                borderBottomLeftRadius: bottom,
                borderBottomRightRadius: bottom,
              }}>
              {row}
            </View>
          );
        })}
      </View>
    );
  } else {
    body = (
      <View
        style={{
          backgroundColor: cell,
          borderRadius: IOS_GROUP_RADIUS,
          borderCurve: 'continuous',
          overflow: 'hidden',
        }}>
        {children}
      </View>
    );
  }

  return (
    <View style={{ gap: IOS ? 7 : 8 }}>
      {title ? <SettingsSectionHeader title={title} trailing={titleTrailing} /> : null}
      {body}
      {footer ? <SettingsFooter>{footer}</SettingsFooter> : null}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Rows                                                                      */
/* ------------------------------------------------------------------------ */

/** Row body shared by navigation, toggle and custom rows. */
function RowLayout({
  icon,
  sf,
  iconColor,
  iconContainerColor,
  leading,
  title,
  subtitle,
  value,
  trailing,
  showChevron,
  danger,
  selected,
}: {
  icon?: IconName;
  sf?: SFSymbol;
  iconColor?: string;
  iconContainerColor?: string;
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: ReactNode;
  showChevron?: boolean;
  danger?: boolean;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const androidSelected = ANDROID && selected;
  const titleColor = danger
    ? colors.danger
    : androidSelected
      ? colors.onSelectionBg
      : colors.text;

  let leadingNode: ReactNode = leading ?? null;
  if (!leading && icon) {
    leadingNode = IOS ? (
      <SettingsItemIcon
        icon={icon}
        sf={sf}
        containerColor={danger ? colors.danger : iconContainerColor}
      />
    ) : (
      <SettingsItemIcon
        icon={icon}
        containerColor={
          danger
            ? `${colors.danger}22`
            : (iconContainerColor ?? (androidSelected ? colors.selectionBg : colors.primaryContainer))
        }
        contentColor={
          danger
            ? colors.danger
            : androidSelected
              ? colors.onSelectionBg
              : (iconColor ?? colors.onPrimaryContainer)
        }
      />
    );
  }

  return (
    <View
      className="flex-row items-center"
      style={
        IOS
          ? { minHeight: subtitle ? 60 : 52, paddingLeft: 16, paddingRight: 16, paddingVertical: 10, gap: 14 }
          : { minHeight: subtitle ? 72 : 56, paddingHorizontal: 16, paddingVertical: 12, gap: 16 }
      }>
      {leadingNode}
      <View className="flex-1" style={{ gap: IOS ? 1 : 2 }}>
        <Text
          numberOfLines={2}
          style={
            IOS
              ? { fontSize: 17, lineHeight: 22, letterSpacing: -0.43, color: titleColor }
              : { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, color: titleColor }
          }>
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={3}
            style={
              IOS
                ? { fontSize: 13, lineHeight: 18, letterSpacing: -0.08, color: colors.text2 }
                : { fontSize: 14, lineHeight: 20, letterSpacing: 0.25, color: colors.text2 }
            }>
            {subtitle}
          </Text>
        ) : null}
        {/* Material puts the current value under the title, not at the end. */}
        {ANDROID && value ? (
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {IOS && value ? (
        <Text
          numberOfLines={1}
          style={{ maxWidth: '45%', fontSize: 17, letterSpacing: -0.43, color: colors.text2 }}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {selected && !trailing ? (
        IOS ? (
          <SymbolView name="checkmark" size={17} weight="semibold" tintColor={colors.accent} />
        ) : (
          <MaterialCommunityIcons name="check" size={22} color={colors.onSelectionBg} />
        )
      ) : null}
      {IOS && showChevron ? (
        <SymbolView
          name="chevron.right"
          size={14}
          weight="semibold"
          tintColor={colors.text3}
          style={{ width: 10, height: 16 }}
          resizeMode="scaleAspectFit"
        />
      ) : null}
    </View>
  );
}

/** Pressable wrapper with the platform's feedback: ripple or iOS cell highlight. */
function RowPressable({
  onPress,
  disabled,
  selected,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityLabel,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  accessibilityRole?: ComponentProps<typeof Pressable>['accessibilityRole'];
  accessibilityState?: ComponentProps<typeof Pressable>['accessibilityState'];
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const { pressed: pressedColor } = useSettingsColors();
  const interactive = Boolean(onPress) && !disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={!interactive}
      // A row with nothing to do must not swallow its children's focus, or
      // trailing buttons (refresh, menus) disappear from VoiceOver.
      accessible={interactive}
      accessibilityRole={interactive ? accessibilityRole : undefined}
      accessibilityState={{ disabled: Boolean(disabled), ...accessibilityState }}
      accessibilityLabel={accessibilityLabel}
      android_ripple={interactive ? { color: colors.separator } : undefined}
      unstable_pressDelay={ANDROID ? 40 : undefined}
      style={{
        opacity: disabled ? 0.45 : 1,
        backgroundColor: ANDROID && selected ? colors.selectionBg : 'transparent',
      }}>
      {({ pressed }) => (
        <>
          {IOS && pressed && interactive ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: pressedColor, opacity: 0.55 }]}
            />
          ) : null}
          {children}
        </>
      )}
    </Pressable>
  );
}

export interface SettingsRowProps {
  /** Material Community icon. On iOS it maps to an SF Symbol tile. */
  icon?: IconName;
  /** Explicit SF Symbol for iOS when the map has no good match. */
  sf?: SFSymbol;
  iconColor?: string;
  iconContainerColor?: string;
  /** Custom leading element, used instead of `icon` (e.g. a provider avatar). */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  /** Current value. Trailing on iOS, under the title on Android. */
  value?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  /** iOS disclosure chevron. Material lists don't draw one. */
  showChevron?: boolean;
  danger?: boolean;
  selected?: boolean;
  disabled?: boolean;
}

/** Navigation / action row. */
export function SettingsRow({ onPress, disabled, selected, ...layout }: SettingsRowProps) {
  return (
    <RowPressable
      onPress={onPress}
      disabled={disabled}
      selected={selected}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      accessibilityLabel={[layout.title, layout.subtitle, layout.value].filter(Boolean).join(', ')}>
      <RowLayout {...layout} selected={selected} />
    </RowPressable>
  );
}

/**
 * Row with a trailing native switch: UISwitch on iOS, Compose Material 3
 * switch on Android. On Android the whole row toggles (Material behavior), so
 * the switch itself ignores touches to avoid a double toggle. On iOS only the
 * switch toggles, as in the Settings app.
 */
export function SettingsToggleRow({
  value,
  onValueChange,
  disabled,
  ...layout
}: Omit<SettingsRowProps, 'onPress' | 'trailing' | 'showChevron' | 'selected' | 'value'> & {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const control = ANDROID ? (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  ) : (
    <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
  );

  if (ANDROID) {
    return (
      <RowPressable
        onPress={() => onValueChange(!value)}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={[layout.title, layout.subtitle].filter(Boolean).join(', ')}>
        <RowLayout {...layout} trailing={control} />
      </RowPressable>
    );
  }

  return (
    <View style={{ opacity: disabled ? 0.45 : 1 }}>
      <RowLayout {...layout} trailing={control} />
    </View>
  );
}

/**
 * Free-form content inside a group (sliders, segmented controls, notes) with
 * the same padding as a row.
 */
export function SettingsCell({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: IOS ? 12 : 16, gap }}>{children}</View>
  );
}

/** Divider between icon rows, inset to the title on iOS. Android draws none. */
export function RowSeparator() {
  return <SettingsDivider inset={IOS_TITLE_INSET} />;
}

/** Divider between rows. `inset` is the leading gap (iOS only). */
export function SettingsDivider({ inset = 16 }: { inset?: number }) {
  const { colors } = useTheme();
  if (ANDROID) return null;
  return (
    <View
      style={{ marginLeft: inset, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Forms and actions                                                         */
/* ------------------------------------------------------------------------ */

export type SettingsTextFieldProps = Omit<TextInputProps, 'style' | 'className'> & {
  label?: string;
  /** Leading icon, Android only (iOS forms use a text label instead). */
  icon?: IconName;
  trailing?: ReactNode;
  /** Monospaced input, for tokens and ids. */
  mono?: boolean;
  /** Width of the iOS label column. */
  labelWidth?: number;
};

/**
 * One text field as a row of a group.
 * iOS: "Label   value" on a single line, like Settings > Mail > Accounts.
 * Android: icon, small label, then the input (Material filled-list field).
 */
export function SettingsTextField({
  label,
  icon,
  trailing,
  mono,
  labelWidth = 110,
  ...input
}: SettingsTextFieldProps) {
  const { colors } = useTheme();
  const font = mono ? (IOS ? 'Menlo' : 'monospace') : undefined;

  const field = (
    <TextInput
      placeholderTextColor={colors.text3}
      autoCorrect={false}
      underlineColorAndroid="transparent"
      accessibilityLabel={label}
      {...input}
      style={{
        flex: 1,
        paddingVertical: IOS ? 0 : 2,
        fontSize: IOS ? (mono ? 15 : 17) : 16,
        letterSpacing: IOS && !mono ? -0.43 : 0,
        fontFamily: font,
        color: colors.text,
      }}
    />
  );

  if (IOS) {
    return (
      <View className="flex-row items-center" style={{ minHeight: 52, paddingHorizontal: 16, gap: 12 }}>
        {label ? (
          <Text
            numberOfLines={1}
            style={{ width: labelWidth, fontSize: 17, letterSpacing: -0.43, color: colors.text }}>
            {label}
          </Text>
        ) : null}
        {field}
        {trailing}
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-4 px-4" style={{ minHeight: 64, paddingVertical: 8 }}>
      {icon ? <MaterialCommunityIcons name={icon} size={22} color={colors.accent} /> : null}
      <View className="flex-1" style={{ gap: 2 }}>
        {label ? (
          <Text style={{ fontSize: 12, lineHeight: 16, color: colors.text2 }}>{label}</Text>
        ) : null}
        {field}
      </View>
      {trailing}
    </View>
  );
}

/** A label + custom control row, for pickers and menus inside a form group. */
export function SettingsValueRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: IconName;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  if (IOS) {
    return (
      <View
        className="flex-row items-center justify-between"
        style={{ minHeight: 52, paddingHorizontal: 16, gap: 12 }}>
        <Text style={{ fontSize: 17, letterSpacing: -0.43, color: colors.text }}>{label}</Text>
        {children}
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-4 px-4" style={{ minHeight: 64, paddingVertical: 8 }}>
      {icon ? <MaterialCommunityIcons name={icon} size={22} color={colors.accent} /> : null}
      <View className="flex-1" style={{ gap: 2 }}>
        <Text style={{ fontSize: 12, lineHeight: 16, color: colors.text2 }}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

/**
 * A command inside a group.
 * iOS: a tappable row with the title in the tint color (red when destructive),
 * the way Settings draws "Sign Out" or "Add Account".
 * Android: a Material button inside the segment.
 */
export function SettingsActionRow({
  title,
  onPress,
  destructive,
  disabled,
  loading,
  variant = 'tonal',
  androidIcon,
}: {
  title: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Android button style. */
  variant?: 'filled' | 'tonal' | 'text';
  androidIcon?: IconName;
}) {
  const { colors } = useTheme();

  if (!IOS) {
    return (
      <SettingsCell>
        <Button
          label={title}
          onPress={onPress}
          disabled={disabled}
          loading={loading}
          icon={androidIcon}
          variant={destructive ? 'danger' : variant}
        />
      </SettingsCell>
    );
  }

  const inactive = disabled || loading;
  const color = inactive ? colors.text3 : destructive ? colors.danger : colors.accent;
  return (
    <RowPressable onPress={onPress} disabled={inactive} accessibilityLabel={title}>
      <View
        className="flex-row items-center justify-between"
        style={{ minHeight: 52, paddingHorizontal: 16, gap: 12 }}>
        <Text style={{ fontSize: 17, letterSpacing: -0.43, color }}>{title}</Text>
        {loading ? <ActivityIndicator size="small" /> : null}
      </View>
    </RowPressable>
  );
}

/**
 * Search field that sits on the screen background above a list.
 * iOS: the system search capsule (tertiary fill, magnifying glass).
 * Android: Material search bar (full pill on surfaceContainerHigh).
 */
export function SettingsSearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const { colors, scheme } = useTheme();
  const { cell } = useSettingsColors();
  const fill = IOS
    ? scheme === 'dark'
      ? 'rgba(118,118,128,0.24)'
      : 'rgba(118,118,128,0.12)'
    : cell;
  return (
    <View
      className="flex-row items-center"
      style={{
        height: IOS ? 40 : 56,
        borderRadius: IOS ? 20 : 28,
        borderCurve: 'continuous',
        paddingHorizontal: IOS ? 12 : 16,
        gap: IOS ? 6 : 12,
        backgroundColor: fill,
      }}>
      {IOS ? (
        <SymbolView name="magnifyingglass" size={16} tintColor={colors.text2} weight="medium" />
      ) : (
        <MaterialCommunityIcons name="magnify" size={22} color={colors.text2} />
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text2}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={{ flex: 1, fontSize: IOS ? 17 : 16, paddingVertical: 0, color: colors.text }}
      />
      {!IOS && value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
          <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Text button for the navigation bar (Save, Add). On iOS 26 the bar wraps it
 * in a Liquid Glass capsule.
 */
export function HeaderTextButton({
  label,
  onPress,
  disabled,
  loading,
  bold = true,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  bold?: boolean;
}) {
  const { colors } = useTheme();
  if (loading) return <ActivityIndicator size="small" style={{ paddingHorizontal: 8 }} />;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => ({ paddingHorizontal: 8, opacity: pressed ? 0.5 : 1 })}>
      <Text
        style={{
          fontSize: 17,
          fontWeight: bold ? '600' : '400',
          color: disabled ? colors.text3 : colors.accent,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}
