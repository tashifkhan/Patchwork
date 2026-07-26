import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { ScrollView, Text, View } from '@/tw';

interface TagChipListProps {
  tags: string[];
  selectedTag?: string | null;
  onSelect?: (tag: string | null) => void;
  scrollable?: boolean;
}

export const TagChipList = memo(function TagChipList({
  tags,
  selectedTag,
  onSelect,
  scrollable = true,
}: TagChipListProps) {
  if (tags.length === 0) return null;

  const chips = tags.map((tag) => {
    const selected = selectedTag === tag;
    return (
      <Chip
        key={tag}
        label={tag}
        selected={selected}
        onPress={onSelect ? () => onSelect(selected ? null : tag) : undefined}
      />
    );
  });

  if (!scrollable) {
    return <View className="flex-row flex-wrap gap-2">{chips}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-1">
      {chips}
    </ScrollView>
  );
});

/**
 * Material 3 filter chip: 32dp container, `primaryContainer` when selected
 * (a solid accent fill reads as a *button*, not a filter), and an outline when
 * not. `hitSlop` lifts the effective touch target to the 48dp minimum without
 * inflating the visual chip.
 */
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  const body = (
    <View
      className="justify-center rounded-full px-3"
      style={{
        minHeight: 32,
        borderCurve: 'continuous',
        backgroundColor: selected ? colors.primaryContainer : colors.bg2,
        borderWidth: selected ? 0 : StyleSheet.hairlineWidth,
        borderColor: colors.separator,
      }}>
      <Text
        className="text-sm font-medium"
        style={{ color: selected ? colors.onPrimaryContainer : colors.text2 }}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Filter by tag ${label}`}
      hitSlop={8}
      android_ripple={{ color: colors.separator, borderless: true }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}
