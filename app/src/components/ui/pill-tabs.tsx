import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { View } from '@/tw';

/*
 * Paisa's PillTabs (ui/components/PillTabs.kt), the switch it uses for
 * Income / Expense and Manual / With AI: a full-round track in
 * surfaceContainerHighest, and a filled primary pill that slides to the
 * picked option on a spring (damping 0.8, StiffnessMediumLow). Labels fade to
 * onPrimary and turn bold under the pill. Replaces outlined segmented buttons.
 */

export interface PillTabOption<T> {
  label: string;
  value: T;
}

/** Compose `Spring.StiffnessMediumLow` with dampingRatio 0.8, as withSpring damping. */
const SLIDE = { damping: 2 * 0.8 * Math.sqrt(400), stiffness: 400, mass: 1, reduceMotion: ReduceMotion.System };
const INSET = 4;

export function PillTabs<T>({
  options,
  value,
  onChange,
  height = 48,
}: {
  options: PillTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  height?: number;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const itemWidth = width > 0 ? (width - INSET * 2) / options.length : 0;
  const offset = useSharedValue(index * itemWidth);

  useEffect(() => {
    offset.set(withSpring(index * itemWidth, SLIDE));
  }, [index, itemWidth, offset]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        height,
        alignSelf: 'stretch',
        borderRadius: height / 2,
        backgroundColor: colors.gray3,
        padding: INSET,
        flexDirection: 'row',
      }}>
      {itemWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: INSET,
              left: INSET,
              width: itemWidth,
              height: height - INSET * 2,
              borderRadius: (height - INSET * 2) / 2,
              backgroundColor: colors.accent,
            },
            pill,
          ]}
        />
      ) : null}
      {options.map((option, i) => (
        <Tab
          key={String(option.value)}
          label={option.label}
          selected={i === index}
          onPress={() => {
            if (i !== index) haptics.selection();
            onChange(option.value);
          }}
        />
      ))}
    </View>
  );
}

function Tab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(selected ? 1 : 0, { duration: 200, reduceMotion: ReduceMotion.System }));
  }, [on, selected]);
  const ink = useAnimatedStyle(() => ({
    color: interpolateColor(on.get(), [0, 1], [colors.text2, colors.onAccent]),
  }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }}>
      <Animated.Text
        numberOfLines={1}
        style={[{ fontSize: 14, fontWeight: selected ? '700' : '500', paddingHorizontal: 8 }, ink]}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}
