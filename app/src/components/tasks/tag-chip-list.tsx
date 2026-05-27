import { memo } from 'react';
import { Pressable } from 'react-native';

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

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View
      className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-2'}`}
      style={{ borderCurve: 'continuous' }}>
      <Text className={`text-sm ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>{label}</Text>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}
