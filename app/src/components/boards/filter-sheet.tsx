import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Platform, Pressable } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import type { JiraIssueScope } from '@/api/jira';
import { activeFilterCount, type BoardFilters } from '@/features/boards/model';
import { useTheme } from '@/components/theme/context';
import { sheetOverlayStyle, useSheetPanel } from '@/components/ui/sheet-panel';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { ScrollView, Text, View } from '@/tw';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const JIRA_SCOPES: { value: JiraIssueScope; title: string; subtitle: string; icon: IconName }[] = [
  { value: 'assigned', title: 'Assigned to me', subtitle: 'Issues you are working on', icon: 'account-check-outline' },
  { value: 'reported', title: 'Reported by me', subtitle: 'Issues you created', icon: 'pencil-outline' },
  { value: 'either', title: 'Assigned or reported', subtitle: 'Either of the above', icon: 'account-multiple-outline' },
  { value: 'all', title: 'All issues', subtitle: 'Everyone\'s issues on the board', icon: 'format-list-bulleted' },
];

/**
 * Board filters in a Material 3 bottom sheet. Jira boards get a "Show" group
 * that picks whose issues load; every board can narrow by type, priority and
 * label. One row per choice, so nothing wraps.
 */
export function FilterSheet({
  visible,
  scope,
  onScopeChange,
  facets,
  filters,
  onChange,
  onClose,
}: {
  visible: boolean;
  /** Jira only: whose issues load. Omit for Deck boards. */
  scope?: JiraIssueScope;
  onScopeChange?: (scope: JiraIssueScope) => void;
  facets: { types: string[]; priorities: string[]; labels: string[] };
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const panel = useSheetPanel(12);
  const count = activeFilterCount(filters);

  function toggle(group: keyof BoardFilters, value: string) {
    haptics.selection();
    const current = filters[group];
    onChange({
      ...filters,
      [group]: current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    });
  }

  const groups: { key: keyof BoardFilters; title: string; values: string[]; icon: IconName }[] = [
    { key: 'types', title: 'Type', values: facets.types, icon: 'shape-outline' },
    { key: 'priorities', title: 'Priority', values: facets.priorities, icon: 'flag-outline' },
    { key: 'labels', title: 'Label', values: facets.labels, icon: 'tag-outline' },
  ];
  const hasFacets = groups.some((group) => group.values.length > 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(DURATION.short4)} style={sheetOverlayStyle()}>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close filters"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}>
          <Animated.View
            entering={SlideInDown.duration(DURATION.medium4).easing(EASING.emphasizedDecelerate)}
            onStartShouldSetResponder={() => true}
            style={{
              ...panel.style,
              maxHeight: '85%',
            }}>
            {panel.background}
            <View className="items-center" style={{ paddingTop: 16, paddingBottom: 8 }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.gray }} />
            </View>
            <View className="flex-row items-center px-6 pb-2">
              <Text style={{ flex: 1, fontSize: 22, fontWeight: '600', color: colors.text }}>Filter</Text>
              {count > 0 ? (
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    onChange({ types: [], priorities: [], labels: [] });
                  }}
                  accessibilityRole="button"
                  hitSlop={8}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.accent }}>Clear all</Text>
                </Pressable>
              ) : null}
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}>
              {scope && onScopeChange ? (
                <>
                  <GroupTitle title="Show" />
                  {JIRA_SCOPES.map((option) => (
                    <Row
                      key={option.value}
                      icon={option.icon}
                      label={option.title}
                      subtitle={option.subtitle}
                      selected={scope === option.value}
                      kind="radio"
                      onPress={() => {
                        haptics.selection();
                        onScopeChange(option.value);
                      }}
                    />
                  ))}
                </>
              ) : null}

              {groups.map((group) =>
                group.values.length > 0 ? (
                  <View key={group.key}>
                    <GroupTitle title={group.title} />
                    {group.values.map((value) => (
                      <Row
                        key={value}
                        icon={group.icon}
                        label={value}
                        selected={filters[group.key].includes(value)}
                        kind="check"
                        onPress={() => toggle(group.key, value)}
                      />
                    ))}
                  </View>
                ) : null
              )}

              {!hasFacets ? (
                <Text style={{ fontSize: 14, color: colors.text3, paddingHorizontal: 12, paddingVertical: 16 }}>
                  Cards on this board have no types, priorities or labels to filter by.
                </Text>
              ) : null}
            </ScrollView>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              android_ripple={{ color: colors.separator }}
              style={({ pressed }) => ({
                marginHorizontal: 24,
                marginTop: 8,
                height: 52,
                borderRadius: pressed ? 14 : 26,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent,
              })}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>Done</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function GroupTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 4 }}>
      {title}
    </Text>
  );
}

function Row({
  icon,
  label,
  subtitle,
  selected,
  kind,
  onPress,
}: {
  icon: IconName;
  label: string;
  subtitle?: string;
  selected: boolean;
  kind: 'radio' | 'check';
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const mark: IconName =
    kind === 'radio'
      ? selected
        ? 'radiobox-marked'
        : 'radiobox-blank'
      : selected
        ? 'checkbox-marked'
        : 'checkbox-blank-outline';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={kind === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={kind === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        minHeight: 52,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 26,
        overflow: 'hidden',
        backgroundColor: selected ? colors.selectionBg : 'transparent',
        opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={22} color={selected ? colors.onSelectionBg : colors.text2} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, color: selected ? colors.onSelectionBg : colors.text }}>
          {label}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <MaterialCommunityIcons name={mark} size={22} color={selected ? colors.accent : colors.text3} />
    </Pressable>
  );
}
