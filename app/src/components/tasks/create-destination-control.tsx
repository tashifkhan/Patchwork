import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/components/theme/context';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { Text, View } from '@/tw';

export type CreateDestination = 'task' | 'github-issue';

const OPTIONS: { label: string; value: CreateDestination }[] = [
  { label: 'Task', value: 'task' },
  { label: 'GitHub issue', value: 'github-issue' },
];

export function CreateDestinationControl({
  value,
  onChange,
}: {
  value: CreateDestination;
  onChange: (value: CreateDestination) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-2 px-5 pb-2 pt-3">
      <View className="flex-row items-center gap-1.5 px-1">
        <MaterialCommunityIcons
          name="plus-box-multiple-outline"
          size={14}
          color={colors.accent}
        />
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.accent,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}>
          Create
        </Text>
      </View>
      <SegmentedChoice
        options={OPTIONS}
        value={value}
        onChange={onChange}
        minHeight={44}
      />
    </View>
  );
}
