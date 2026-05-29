import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, View as RNView } from 'react-native';

import type { DeckCard as DeckCardType } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { formatRelativeDue } from '@/lib/format';
import { Text, View } from '@/tw';

// Material 3 filled card: surfaceContainerHigh fill, soft elevation shadow,
// no outline. Ripple is provided by the native Pressable so the press feels
// like a real Compose card.
export const DeckCard = memo(function DeckCard({
  card,
  onPress,
}: {
  card: DeckCardType;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const due = formatRelativeDue(card.duedate ?? null);
  const labels = card.labels ?? [];
  const assignees = card.assignedUsers ?? [];

  return (
    <RNView
      style={{
        borderRadius: 16,
        backgroundColor: colors.bg3,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.12)',
      }}>
      <Pressable
        disabled={!onPress}
        onPress={onPress}
        android_ripple={{ color: colors.separator }}>
        <View className="gap-2 p-4" style={{ borderCurve: 'continuous' }}>
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

          {due.label || assignees.length > 0 ? (
            <View className="flex-row items-center gap-3 pt-1">
              {due.label ? (
                <View className="flex-row items-center gap-1">
                  <MaterialCommunityIcons name="clock-outline" size={12} color={colors.text2} />
                  <Text className="text-sf-text-2 text-xs">{due.label}</Text>
                </View>
              ) : null}
              {assignees.length > 0 ? (
                <View className="flex-row items-center gap-1">
                  <MaterialCommunityIcons name="account-outline" size={12} color={colors.text2} />
                  <Text className="text-sf-text-2 text-xs">{assignees.length}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </RNView>
  );
});
