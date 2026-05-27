import { Host, Switch as JetpackSwitch } from '@expo/ui/jetpack-compose';

import { useTheme } from '@/components/theme/context';

import type { SwitchProps } from './switch';

/**
 * Material 3 switch (Jetpack Compose). Mirrors the API of the iOS `Switch`
 * wrapper so call sites stay platform-agnostic. Colors are driven by the
 * resolved theme so it tracks Material You / AMOLED surfaces.
 */
export function Switch({ value, onValueChange, disabled }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <Host matchContents>
      <JetpackSwitch
        value={value}
        enabled={!disabled}
        onCheckedChange={onValueChange}
        colors={{
          checkedThumbColor: colors.onAccent,
          checkedTrackColor: colors.accent,
          checkedBorderColor: colors.accent,
          checkedIconColor: colors.accent,
          uncheckedThumbColor: colors.gray,
          uncheckedTrackColor: colors.bg3,
          uncheckedBorderColor: colors.separator,
        }}
      />
    </Host>
  );
}
