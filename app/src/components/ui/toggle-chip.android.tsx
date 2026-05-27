import { Host, Text, ToggleButton } from '@expo/ui/jetpack-compose';

import { useTheme } from '@/components/theme/context';

import type { ToggleChipProps } from './toggle-chip';

/**
 * Material 3 `ToggleButton` styled to the resolved palette. Mirrors the iOS
 * `ToggleChip` API so call sites stay platform-agnostic.
 */
export function ToggleChip({ label, selected, onPress, disabled }: ToggleChipProps) {
  const { colors } = useTheme();
  return (
    <Host matchContents>
      <ToggleButton
        checked={selected}
        enabled={!disabled}
        onCheckedChange={onPress}
        colors={{
          containerColor: colors.bg3,
          contentColor: colors.text2,
          checkedContainerColor: colors.accent,
          checkedContentColor: colors.onAccent,
        }}>
        <Text>{label}</Text>
      </ToggleButton>
    </Host>
  );
}
