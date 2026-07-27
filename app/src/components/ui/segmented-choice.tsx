import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { View } from 'react-native';

import { useTheme } from '@/components/theme/context';

export interface SegmentedChoiceOption<T> {
  label: string;
  value: T;
}

interface SegmentedChoiceProps<T> {
  options: SegmentedChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  minHeight?: number;
}

/**
 * Cross-platform exclusive choice control.
 * - iOS/web: community SegmentedControl
 * - Android: Material 3 SingleChoiceSegmentedButtonRow (segmented-choice.android.tsx)
 */
export function SegmentedChoice<T>({
  options,
  value,
  onChange,
  minHeight = 40,
}: SegmentedChoiceProps<T>) {
  const { colors } = useTheme();
  // Callers are responsible for passing a `value` present in `options` — an
  // unmatched one falls back to the first segment, which would misreport the
  // current state (see `toPriorityBucket` in task-form).
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  return (
    <View style={{ minHeight, justifyContent: 'center' }}>
      <SegmentedControl
        values={options.map((option) => option.label)}
        selectedIndex={selectedIndex}
        tintColor={colors.accent}
        onChange={(event) => {
          const next = options[event.nativeEvent.selectedSegmentIndex];
          if (next) onChange(next.value);
        }}
      />
    </View>
  );
}
