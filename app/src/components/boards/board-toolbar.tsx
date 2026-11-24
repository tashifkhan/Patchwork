import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, useState } from 'react';
import { Platform, Pressable, TextInput } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { JiraBoardView, JiraSprint } from '@/api/jira';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { withAlpha } from '@/lib/theme';
import { ScrollView, Text, View } from '@/tw';

import { SprintChips } from './sprint-bar';

const IOS = Platform.OS === 'ios';
const ROW = 36;

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Everything above the columns in one 36pt row, so the board keeps its
 * height: a search button, the Filter chip (with how many are on), then the
 * sprint chips for Jira boards. Tapping search swaps the row for a field;
 * closing it clears the search and brings the chips back.
 */
export function BoardToolbar({
  query,
  onQuery,
  filterCount,
  onOpenFilters,
  sprints,
  view,
  onSelectView,
}: {
  query: string;
  onQuery: (value: string) => void;
  filterCount: number;
  onOpenFilters: () => void;
  /** Jira only: the sprint chips join the row. */
  sprints?: JiraSprint[];
  view?: JiraBoardView;
  onSelectView?: (view: JiraBoardView) => void;
}) {
  const { colors } = useTheme();
  const [searching, setSearching] = useState(Boolean(query));
  const field = IOS ? withAlpha(colors.text, 0.06) : colors.bg2;
  const filter = (
    <RoundChip
      icon="filter-variant"
      label={filterCount ? String(filterCount) : undefined}
      accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'}
      on={filterCount > 0}
      onPress={onOpenFilters}
    />
  );

  if (searching) {
    return (
      <Animated.View
        entering={FadeIn.duration(160)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
        <View
          className="flex-row items-center"
          style={{ flex: 1, height: ROW + 4, borderRadius: (ROW + 4) / 2, paddingHorizontal: 14, gap: 8, backgroundColor: field }}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.text3} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={onQuery}
            placeholder="Search cards"
            placeholderTextColor={colors.text3}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search cards"
            style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 }}
          />
          <Pressable
            onPress={() => {
              haptics.tap();
              onQuery('');
              setSearching(false);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close search">
            <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
          </Pressable>
        </View>
        {filter}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8, alignItems: 'center' }}>
        <RoundChip icon="magnify" accessibilityLabel="Search cards" onPress={() => setSearching(true)} />
        {filter}
        {sprints && view && onSelectView ? (
          <>
            <View style={{ width: 1, height: 20, backgroundColor: colors.separator, marginHorizontal: 2 }} />
            <SprintChips sprints={sprints} view={view} onSelect={onSelectView} />
          </>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

/** A 36pt icon chip: round alone, a pill when it carries a count. */
function RoundChip({
  icon,
  label,
  accessibilityLabel,
  on = false,
  onPress,
}: {
  icon: IconName;
  label?: string;
  accessibilityLabel: string;
  on?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const fg = on ? (IOS ? colors.onAccent : colors.onSelectionBg) : colors.text;
  const bg = on ? (IOS ? colors.accent : colors.selectionBg) : IOS ? colors.bg3 : colors.bg2;
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: colors.separator, borderless: false }}
      style={({ pressed }) => ({
        height: ROW,
        minWidth: ROW,
        paddingHorizontal: label ? 12 : 0,
        borderRadius: ROW / 2,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        backgroundColor: bg,
        opacity: pressed && IOS ? 0.7 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={19} color={fg} />
      {label ? <Text style={{ fontSize: 14, fontWeight: '600', color: fg }}>{label}</Text> : null}
    </Pressable>
  );
}
