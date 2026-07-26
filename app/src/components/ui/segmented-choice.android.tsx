import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { useTheme } from '@/components/theme/context';
import { View } from '@/tw';


export interface SegmentedChoiceOption<T> {
  label: string;
  value: T;
}

interface SegmentedChoiceProps<T> {
  options: SegmentedChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Min height of the control (default 40 — M3 segmented). */
  minHeight?: number;
}

/**
 * Material 3 single-choice segmented button row (Jetpack Compose).
 * Used for Priority and similar exclusive options inside sheets.
 */
export function SegmentedChoice<T>({
  options,
  value,
  onChange,
  minHeight = 40,
}: SegmentedChoiceProps<T>) {
  const { colors } = useTheme();


  return (
    <View style={{ minHeight, width: '100%' }}>
      <Host matchContents={{ vertical: true }} style={{ minHeight, width: '100%' }}>
        <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <SegmentedButton
                key={option.label}
                selected={selected}
                onClick={() => onChange(option.value)}
                colors={{
                  activeContainerColor: colors.primaryContainer,
                  activeContentColor: colors.onPrimaryContainer,
                  activeBorderColor: colors.separator,
                  inactiveContainerColor: colors.bg3,
                  inactiveContentColor: colors.text2,
                  inactiveBorderColor: colors.separator,
                }}>
                <SegmentedButton.Label>
                  <Text>{option.label}</Text>
                </SegmentedButton.Label>
              </SegmentedButton>
            );
          })}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}
