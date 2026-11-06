import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, Pressable } from 'react-native';

import type { JiraBoardView, JiraSprint } from '@/api/jira';
import { sprintTiming } from '@/api/jira';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { ScrollView, Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

/**
 * The sprint switcher under a scrum board's title: each active sprint, then
 * the upcoming ones, then the Backlog. It mirrors Jira's Board (active
 * sprint) and Backlog views in one row, so planning work is a tap away.
 */
export function SprintBar({
  sprints,
  view,
  onSelect,
}: {
  sprints: JiraSprint[];
  view: JiraBoardView;
  onSelect: (view: JiraBoardView) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
      {sprints.map((sprint) => (
        <Chip
          key={sprint.id}
          label={sprint.name}
          detail={sprintTiming(sprint)}
          active={sprint.state === 'active'}
          selected={view.kind === 'sprint' && view.sprintId === sprint.id}
          onPress={() => onSelect({ kind: 'sprint', sprintId: sprint.id })}
        />
      ))}
      <Chip
        label="Backlog"
        icon="tray-full"
        selected={view.kind === 'backlog'}
        onPress={() => onSelect({ kind: 'backlog' })}
      />
    </ScrollView>
  );
}

function Chip({
  label,
  detail,
  icon,
  active,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** An active sprint: marked with a dot so it reads as "now". */
  active?: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const fg = selected ? (IOS ? colors.onAccent : colors.onSelectionBg) : colors.text;
  return (
    <Pressable
      onPress={() => {
        if (selected) return;
        haptics.selection();
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={[label, active ? 'active sprint' : null, detail].filter(Boolean).join(', ')}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingHorizontal: 14,
        borderRadius: IOS ? 18 : 10,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: selected ? (IOS ? colors.accent : colors.selectionBg) : IOS ? colors.bg3 : 'transparent',
        borderWidth: !IOS && !selected ? 1 : 0,
        borderColor: colors.gray2,
        opacity: pressed && IOS ? 0.7 : 1,
      })}>
      {active ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selected ? fg : colors.green }} />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={16} color={fg} />
      ) : null}
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: fg, maxWidth: 180 }}>
        {label}
      </Text>
      {detail ? (
        <Text numberOfLines={1} style={{ fontSize: 13, color: selected ? fg : colors.text2, opacity: selected ? 0.85 : 1 }}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}
