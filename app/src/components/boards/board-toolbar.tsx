import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, Pressable, ScrollView, TextInput } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { priorityTone } from '@/components/boards/board-tone';
import { useTheme } from '@/components/theme/context';
import type { BoardFilters } from '@/features/boards/model';
import { haptics } from '@/lib/haptics';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

/**
 * The board's search and filters, always on screen above the columns: a
 * search field, the Filter button (which opens the full sheet: scope,
 * sprints, types, priorities, labels) with its active count, and one-tap
 * chips for each priority, label and issue type on the board. Picked chips fill
 * with colour; Clear resets search and filters together.
 */
export function BoardToolbar({
  query,
  onQuery,
  filters,
  onFilters,
  facets,
  filterCount,
  onOpenFilters,
  shown,
  total,
}: {
  query: string;
  onQuery: (value: string) => void;
  filters: BoardFilters;
  onFilters: (next: BoardFilters) => void;
  facets: { types: string[]; priorities: string[]; labels: string[] };
  filterCount: number;
  onOpenFilters: () => void;
  /** Cards showing after search and filters, and on the board in all. */
  shown: number;
  total: number;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const narrowed = filterCount > 0 || query.trim().length > 0;

  const toggle = (key: 'priorities' | 'types' | 'labels', value: string) => {
    haptics.selection();
    const list = filters[key];
    onFilters({ ...filters, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };

  return (
    <View style={{ gap: 10, paddingBottom: 10 }}>
      <View className="flex-row items-center" style={{ paddingHorizontal: 16, gap: 8 }}>
        <View
          className="flex-row items-center"
          style={{
            flex: 1,
            height: 44,
            borderRadius: 22,
            paddingHorizontal: 14,
            gap: 8,
            backgroundColor: IOS ? withAlpha(colors.text, 0.06) : colors.bg2,
          }}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.text3} />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Search cards"
            placeholderTextColor={colors.text3}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search cards"
            style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 }}
          />
          {query ? (
            <Pressable onPress={() => onQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.text3} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            haptics.tap();
            onOpenFilters();
          }}
          accessibilityRole="button"
          accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'}
          style={({ pressed }) => ({
            height: 44,
            paddingHorizontal: 14,
            borderRadius: 22,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: filterCount ? colors.selectionBg : IOS ? withAlpha(colors.text, 0.06) : colors.bg2,
            opacity: pressed ? 0.7 : 1,
          })}>
          <MaterialCommunityIcons name="filter-variant" size={20} color={filterCount ? colors.onSelectionBg : colors.text} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: filterCount ? colors.onSelectionBg : colors.text }}>
            {filterCount ? `Filter · ${filterCount}` : 'Filter'}
          </Text>
        </Pressable>
      </View>

      {facets.priorities.length || facets.types.length || facets.labels.length || narrowed ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
          {narrowed ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
              <Pressable
                onPress={() => {
                  haptics.tap();
                  onQuery('');
                  onFilters({ sprints: [], types: [], priorities: [], labels: [] });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Clear search and filters, showing ${shown} of ${total}`}
                style={{
                  height: 32,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: withAlpha(colors.red, 0.12),
                }}>
                <MaterialCommunityIcons name="close" size={14} color={colors.red} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.red }}>
                  Clear · {shown}/{total}
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}
          {facets.priorities.map((name) => {
            const on = filters.priorities.includes(name);
            const tone = priorityTone(name, colors, dark);
            return (
              <QuickChip
                key={`p-${name}`}
                label={name}
                on={on}
                fill={tone?.bg ?? colors.selectionBg}
                ink={tone?.ink ?? colors.onSelectionBg}
                onPress={() => toggle('priorities', name)}
              />
            );
          })}
          {facets.labels.map((name) => (
            <QuickChip
              key={`l-${name}`}
              label={name}
              on={filters.labels.includes(name)}
              fill={colors.primaryContainer}
              ink={colors.onPrimaryContainer}
              onPress={() => toggle('labels', name)}
            />
          ))}
          {facets.types.map((name) => (
            <QuickChip
              key={`t-${name}`}
              label={name}
              on={filters.types.includes(name)}
              fill={colors.selectionBg}
              ink={colors.onSelectionBg}
              onPress={() => toggle('types', name)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function QuickChip({
  label,
  on,
  fill,
  ink,
  onPress,
}: {
  label: string;
  on: boolean;
  fill: string;
  ink: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label} filter`}
      style={({ pressed }) => ({
        height: 32,
        paddingHorizontal: 12,
        borderRadius: on ? 10 : 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: on ? fill : 'transparent',
        borderWidth: on ? 0 : 1,
        borderColor: colors.separator,
        opacity: pressed ? 0.7 : 1,
      })}>
      {on ? <MaterialCommunityIcons name="check" size={14} color={ink} /> : null}
      <Text style={{ fontSize: 13, fontWeight: '600', color: on ? ink : colors.text2 }}>{label}</Text>
    </Pressable>
  );
}
