import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, Pressable, TextInput } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

/**
 * The board's search and filters, always on screen above the columns: a
 * search field and the Filter button, which opens the full sheet (scope,
 * sprints, types, priorities, labels) and shows how many are on.
 */
export function BoardToolbar({
  query,
  onQuery,
  filterCount,
  onOpenFilters,
}: {
  query: string;
  onQuery: (value: string) => void;
  filterCount: number;
  onOpenFilters: () => void;
}) {
  const { colors } = useTheme();
  const field = IOS ? withAlpha(colors.text, 0.06) : colors.bg2;

  return (
    <View className="flex-row items-center" style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
      <View
        className="flex-row items-center"
        style={{ flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 14, gap: 8, backgroundColor: field }}>
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
          backgroundColor: filterCount ? colors.selectionBg : field,
          opacity: pressed ? 0.7 : 1,
        })}>
        <MaterialCommunityIcons name="filter-variant" size={20} color={filterCount ? colors.onSelectionBg : colors.text} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: filterCount ? colors.onSelectionBg : colors.text }}>
          {filterCount ? `Filter · ${filterCount}` : 'Filter'}
        </Text>
      </Pressable>
    </View>
  );
}
