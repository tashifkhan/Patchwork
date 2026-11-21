import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useMemo } from 'react';
import { View } from 'react-native';

import { haptics } from '@/lib/haptics';

import type { SegmentedChoiceOption } from './segmented-choice';

export type { SegmentedChoiceOption };

/**
 * iOS: SwiftUI's segmented `Picker`. On iOS 26 that is the system's Liquid
 * Glass segmented control, with the selected segment as a glass thumb that
 * slides between options. It is deliberately left untinted: a tint paints the
 * thumb a flat accent fill and loses the glass, which is what made the old
 * UISegmentedControl version look out of place.
 */
export function SegmentedChoice<T>({
  options,
  value,
  onChange,
  minHeight = 40,
}: {
  options: SegmentedChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  minHeight?: number;
}) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const modifiers = useMemo(() => [pickerStyle('segmented')], []);

  return (
    <View style={{ minHeight, justifyContent: 'center' }}>
      <Host matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }}>
        <Picker
          selection={selectedIndex}
          modifiers={modifiers}
          onSelectionChange={(index: number) => {
            const next = options[index];
            if (next && index !== selectedIndex) {
              haptics.selection();
              onChange(next.value);
            }
          }}>
          {options.map((option, index) => (
            <Text key={option.label} modifiers={[tag(index)]}>
              {option.label}
            </Text>
          ))}
        </Picker>
      </Host>
    </View>
  );
}
