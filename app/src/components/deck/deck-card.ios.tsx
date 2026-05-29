import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { memo } from 'react';
import { Pressable } from 'react-native';

import type { DeckCard as DeckCardType } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { formatRelativeDue } from '@/lib/format';
import { Text, View } from '@/tw';

// iOS 26+ liquid glass card with a graceful fallback to the prior
// surfaceContainer treatment on older releases.
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
  const glass = isLiquidGlassAvailable();

  const content = (
    <View
      className="gap-2 p-4"
      style={
        glass
          ? { borderCurve: 'continuous' }
          : {
              borderRadius: 16,
              borderCurve: 'continuous',
              backgroundColor: colors.bg3,
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            }
      }>
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
  );

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {glass ? (
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          style={{ borderRadius: 16, overflow: 'hidden' }}>
          {content}
        </GlassView>
      ) : (
        content
      )}
    </Pressable>
  );
});
