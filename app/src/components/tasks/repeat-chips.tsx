import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { Text } from '@/tw';

export interface RepeatOption {
  label: string;
  rrule: string | null;
}

/** Shorter names for the presets, so each fits on one chip. */
function shortLabel(label: string): string {
  return label
    .replace(/^Every day$/i, 'Daily')
    .replace(/^Every week on /i, 'Weekly · ')
    .replace(/^Every 2 weeks$/i, 'Every 2 weeks')
    .replace(/^Every month on the /i, 'Monthly · ')
    .replace(/^Every year on /i, 'Yearly · ');
}

/**
 * Repeat as one row of filter chips that scrolls sideways, all the same
 * height, instead of a wrapped pile. The chosen one fills and gets a check,
 * and the row scrolls it into view.
 */
export function RepeatChips({
  options,
  value,
  onChange,
}: {
  options: RepeatOption[];
  value: string | null;
  onChange: (option: RepeatOption) => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const selectedLabel = options.find((option) => (option.rrule ?? null) === (value ?? null))?.label;

  useEffect(() => {
    if (!selectedLabel) return;
    const x = offsets.current[selectedLabel];
    if (x != null) scroll.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [selectedLabel]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
      {options.map((option) => {
        const on = option.label === selectedLabel;
        return (
          <Pressable
            key={option.label}
            onLayout={(e) => {
              offsets.current[option.label] = e.nativeEvent.layout.x;
            }}
            onPress={() => {
              haptics.selection();
              onChange(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.label}
            style={({ pressed }) => ({
              height: 36,
              paddingHorizontal: 14,
              borderRadius: on ? 12 : 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: on ? colors.selectionBg : 'transparent',
              borderWidth: on ? 0 : 1,
              borderColor: colors.separator,
              opacity: pressed ? 0.7 : 1,
            })}>
            {on ? (
              <Animated.View entering={FadeIn.duration(150)}>
                <MaterialCommunityIcons name="check" size={16} color={colors.onSelectionBg} />
              </Animated.View>
            ) : null}
            <Text style={{ fontSize: 14, fontWeight: '600', color: on ? colors.onSelectionBg : colors.text2 }}>
              {shortLabel(option.label)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
