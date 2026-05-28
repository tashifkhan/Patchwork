import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable } from 'react-native';

import type { DeckCard as DeckCardType } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { formatRelativeDue } from '@/lib/format';
import { Text, View } from '@/tw';

export const DeckCard = memo(function DeckCard({ card, onPress }: { card: DeckCardType; onPress?: () => void }) {
  const { colors } = useTheme();
  const textSecondary = colors.text2;
  const due = formatRelativeDue(card.duedate ?? null);
  const labels = card.labels ?? [];
  const assignees = card.assignedUsers ?? [];

  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <View
        className="bg-sf-bg-3 border-sf-separator gap-2 rounded-2xl border p-3.5"
        style={{ borderCurve: 'continuous', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}>
        {labels.length > 0 ? (
          <View className="flex-row flex-wrap gap-1">
            {labels.map((label, index) => (
              <View
                key={label.id ?? index}
                className="rounded px-2 py-0.5"
                style={{ backgroundColor: label.color ? `#${label.color}` : '#8E8E93' }}>
                <Text className="text-[11px] font-medium text-white">{label.title ?? ''}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="text-sf-text text-base font-medium">{card.title ?? 'Untitled'}</Text>

        {card.description ? (
          <Text numberOfLines={3} className="text-sf-text-2 text-sm">
            {card.description}
          </Text>
        ) : null}

        {(due.label || assignees.length > 0) ? (
          <View className="flex-row items-center gap-3 pt-1">
            {due.label ? (
              <View className="flex-row items-center gap-1">
                <MaterialCommunityIcons name="clock-outline" size={12} color={textSecondary} />
                <Text className="text-sf-text-2 text-xs">{due.label}</Text>
              </View>
            ) : null}
            {assignees.length > 0 ? (
              <View className="flex-row items-center gap-1">
                <MaterialCommunityIcons name="account-outline" size={12} color={textSecondary} />
                <Text className="text-sf-text-2 text-xs">{assignees.length}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});
