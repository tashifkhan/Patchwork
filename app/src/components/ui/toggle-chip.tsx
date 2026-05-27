import { Pressable } from 'react-native';

import { Text, View } from '@/tw';

export interface ToggleChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Selectable pill. iOS/web renders a tinted capsule; Android swaps in the
 * Material 3 `ToggleButton` (see `toggle-chip.android.tsx`).
 */
export function ToggleChip({ label, selected, onPress, disabled }: ToggleChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ opacity: pressed || disabled ? 0.6 : 1 })}>
      <View
        className={`rounded-full px-3.5 py-1.5 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-3'}`}
        style={{ borderCurve: 'continuous' }}>
        <Text className={`text-sm font-medium ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
