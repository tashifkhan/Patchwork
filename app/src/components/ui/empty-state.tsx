import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Text, View } from '@/tw';

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
