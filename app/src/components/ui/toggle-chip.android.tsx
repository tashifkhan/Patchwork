import { FilterChip, Host, Text } from '@expo/ui/jetpack-compose';

import { useTheme } from '@/components/theme/context';

import type { ToggleChipProps } from './toggle-chip';

/**
 * Material 3 `FilterChip` for multi/single-select pills (lists, tags, boards).
 * Mirrors the shared ToggleChip API; selection uses primaryContainer like Paisa
 * ChoiceCards / OptionChipGrid.
 */
export function ToggleChip({ label, selected, onPress, disabled }: ToggleChipProps) {
  const { colors } = useTheme();
  return (
    <Host matchContents>
      <FilterChip
        selected={selected}
        enabled={!disabled}
        onClick={onPress}
        colors={{
          containerColor: colors.bg3,
          labelColor: colors.text2,
          selectedContainerColor: colors.primaryContainer,
          selectedLabelColor: colors.onPrimaryContainer,
        }}>
        <FilterChip.Label>
          <Text>{label}</Text>
        </FilterChip.Label>
      </FilterChip>
    </Host>
  );
}
