import { Switch as RNSwitch } from 'react-native';

import { useTheme } from '@/components/theme/context';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Themed native switch. On iOS/web this is the platform `Switch` tinted with
 * the active accent; Android swaps in the Material 3 `Switch` (see
 * `switch.android.tsx`).
 */
export function Switch({ value, onValueChange, disabled }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      // Only tint the "on" track. The off track and thumb stay system-drawn so
      // the switch reads on every palette (a palette gray3 can match the cell).
      trackColor={{ true: colors.accent }}
      thumbColor={process.env.EXPO_OS === 'ios' ? undefined : colors.onAccent}
    />
  );
}
