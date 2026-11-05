import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Platform, Pressable } from 'react-native';

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
      <FilterChip
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
      contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
      {chips}
    </ScrollView>
  );
});

/**
 * Material 3 filter chip: 32dp tall with 8dp corners. Unselected it is an
 * outlined chip with a leading tag glyph; selected it fills with the tonal
 * selection color and the glyph becomes a check, as the spec asks. Corners
 * tighten while pressed, the M3 Expressive shape-morph cue.
 */
export function FilterChip({
  label,
  selected,
  onPress,
  icon = 'tag-outline',
  count,
}: {
  label: string;
  selected: boolean;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  count?: number;
}) {
  const { colors } = useTheme();
  const ink = selected ? colors.onSelectionBg : colors.text2;

  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              haptics.selection();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Filter by ${label}`}
      hitSlop={8}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 32,
        paddingLeft: 8,
        paddingRight: 12,
        borderRadius: pressed ? 16 : 8,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: selected ? colors.selectionBg : 'transparent',
        borderWidth: selected ? 0 : 1,
        borderColor: colors.gray2,
        opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
      })}>
      <MaterialCommunityIcons name={selected ? 'check' : icon} size={18} color={ink} />
      <Text style={{ fontSize: 14, fontWeight: '500', color: selected ? ink : colors.text }}>
        {label}
      </Text>
      {count != null ? (
        <Text style={{ fontSize: 12, color: ink, fontVariant: ['tabular-nums'] }}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Things-style tag filter row ("All · Important · Errand"): the active
 * filter sits in a tonal pill, the rest are plain text. Lighter than a row of
 * outlined chips, so it reads as a filter for the page rather than buttons.
 */
export function TagFilterTabs({
  tags,
  selectedTag,
  onSelect,
}: {
  tags: string[];
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
}) {
  if (tags.length === 0) return null;
  const items: { key: string; label: string; value: string | null }[] = [
    { key: '__all__', label: 'All', value: null },
    ...tags.map((tag) => ({ key: tag, label: tag, value: tag })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 4, paddingRight: 8 }}>
      {items.map((item) => (
        <TabPill
          key={item.key}
          label={item.label}
          selected={selectedTag === item.value}
          onPress={() => onSelect(item.value)}
        />
      ))}
    </ScrollView>
  );
}

function TabPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label === 'All' ? 'Show all tags' : `Filter by ${label}`}
      hitSlop={6}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) =>
        Platform.OS === 'ios'
          ? {
              // Things tag capsules: gray when idle, accent when picked.
              height: 30,
              paddingHorizontal: 12,
              justifyContent: 'center',
              borderRadius: 15,
              backgroundColor: selected ? colors.accent : colors.bg2,
              opacity: pressed ? 0.6 : 1,
            }
          : {
              height: 34,
              paddingHorizontal: 14,
              justifyContent: 'center',
              borderRadius: 17,
              borderCurve: 'continuous',
              overflow: 'hidden',
              backgroundColor: selected ? colors.selectionBg : 'transparent',
            }
      }>
      <Text
        style={{
          fontSize: Platform.OS === 'ios' ? 14 : 15,
          fontWeight: selected ? '600' : '500',
          color:
            Platform.OS === 'ios'
              ? selected
                ? colors.onAccent
                : colors.text2
              : selected
                ? colors.onSelectionBg
                : colors.text2,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}
