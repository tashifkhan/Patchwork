import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode } from 'react';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { SystemEmptyState } from '@/components/ui/system-empty-state';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

/** SF Symbols for the glyphs empty states use, so iOS gets Apple's icons. */
const SF_FOR: Partial<Record<IconName, SFSymbol>> = {
  'inbox-outline': 'tray',
  'checkbox-marked-circle-outline': 'checkmark.circle',
  'cloud-alert-outline': 'exclamationmark.icloud',
  'cloud-outline': 'icloud',
  'magnify-close': 'magnifyingglass',
  'source-repository': 'book.closed',
  'view-column-outline': 'rectangle.split.3x1',
  'cloud-off-outline': 'icloud.slash',
  jira: 'square.grid.2x2',
  'progress-check': 'checkmark.circle',
  'tray-full': 'tray.full',
  'account-outline': 'person.crop.circle',
};

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
}

export interface EmptyStateProps {
  icon?: IconName;
  /** Large headline. */
  title: string;
  /** Supporting copy under the title. */
  subtitle?: string;
  /** Primary + secondary actions. */
  actions?: EmptyStateAction[];
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Soft circular icon container (default true). */
  iconBubble?: boolean;
}

/**
 * Material 3 empty / error / setup state — circular primaryContainer icon,
 * clear hierarchy, full-width M3 buttons. Used for “no account”, empty lists,
 * and recoverable failures.
 */
export function EmptyState({
  icon = 'inbox-outline',
  title,
  subtitle,
  actions,
  children,
  style,
  iconBubble = true,
}: EmptyStateProps) {
  const { colors } = useTheme();

  if (Platform.OS === 'ios') {
    return <IosEmptyState icon={icon} title={title} subtitle={subtitle} actions={actions} style={style}>{children}</IosEmptyState>;
  }

  return (
    <View
      className="w-full items-center justify-center self-center px-8"
      style={[{ gap: 20 }, style]}>
      {iconBubble ? (
        <View
          className="h-24 w-24 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primaryContainer }}>
          <MaterialCommunityIcons name={icon} size={44} color={colors.onPrimaryContainer} />
        </View>
      ) : (
        <MaterialCommunityIcons name={icon} size={56} color={colors.accent} style={{ opacity: 0.75 }} />
      )}

      <View className="w-full items-center gap-2" style={{ maxWidth: 320 }}>
        <Text className="text-sf-text text-center text-xl font-bold" style={{ letterSpacing: -0.3 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sf-text-2 text-center text-base" style={{ lineHeight: 22 }} selectable>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {children}

      {actions && actions.length > 0 ? (
        <View className="w-full gap-3 pt-1" style={{ maxWidth: 320, alignSelf: 'center' }}>
          {actions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              onPress={action.onPress}
              variant={action.variant ?? (action === actions[0] ? 'filled' : 'tonal')}
              style={{ width: '100%' }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * iOS: the system ContentUnavailableView look. A large gray SF Symbol, a
 * bold title, secondary text, then one prominent capsule button with any
 * other action as a plain tinted text button underneath.
 */
function IosEmptyState({
  icon,
  title,
  subtitle,
  actions,
  children,
  style,
}: Required<Pick<EmptyStateProps, 'icon'>> & Omit<EmptyStateProps, 'icon' | 'iconBubble'>) {
  const { colors } = useTheme();
  const [primary, ...secondary] = actions ?? [];
  const symbol = SF_FOR[icon];

  // The real thing when nothing custom goes inside: SwiftUI's view, with
  // native glass buttons.
  if (!children) {
    return (
      <View style={[{ alignSelf: 'stretch', flexGrow: 1, justifyContent: 'center' }, style]}>
        <SystemEmptyState
          symbol={symbol ?? 'tray'}
          title={title}
          description={subtitle}
          actions={actions?.map(({ label, onPress }) => ({ label, onPress }))}
        />
      </View>
    );
  }

  return (
    <View className="w-full items-center justify-center self-center px-10" style={[{ gap: 6 }, style]}>
      {symbol ? (
        <SymbolView name={symbol} size={56} weight="regular" tintColor={colors.gray} style={{ marginBottom: 10 }} />
      ) : (
        <MaterialCommunityIcons name={icon} size={56} color={colors.gray} style={{ marginBottom: 10 }} />
      )}
      <Text
        style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35, color: colors.text, textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          selectable
          style={{ fontSize: 15, lineHeight: 20, letterSpacing: -0.23, color: colors.text2, textAlign: 'center', maxWidth: 300 }}>
          {subtitle}
        </Text>
      ) : null}

      {children}

      {primary ? (
        <Pressable
          onPress={() => {
            haptics.tap();
            primary.onPress();
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 18,
            minHeight: 44,
            paddingHorizontal: 22,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
            opacity: pressed ? 0.75 : 1,
          })}>
          <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: colors.onAccent }}>
            {primary.label}
          </Text>
        </Pressable>
      ) : null}
      {secondary.map((action) => (
        <Pressable
          key={action.label}
          onPress={() => {
            haptics.tap();
            action.onPress();
          }}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, opacity: pressed ? 0.5 : 1 })}>
          <Text style={{ fontSize: 17, letterSpacing: -0.4, color: colors.accent }}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
