import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { CLOCK_FONT, Glass } from '@/components/focus/clock-style';
import { useTheme } from '@/components/theme/context';
import { Text, View } from '@/tw';

/**
 * Expressive Clock's LapRow, used for the day's log: a 48dp glass pill with
 * a round badge, the main figure in titleMediumEmphasized and the secondary
 * one in bodyMedium. Long-press to remove.
 */
export function LogRow({
  icon,
  title,
  detail,
  value,
  onLongPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  detail: string;
  value: string;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onLongPress={onLongPress}
      accessibilityLabel={`${title}, ${value}, ${detail}`}
      accessibilityHint="Long-press to remove">
      <Glass tint={colors.bg3} radius={24} borderAlpha={0.72} shadow={0} style={{ height: 48, justifyContent: 'center' }}>
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, gap: 12 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.gray3,
            }}>
            <MaterialCommunityIcons name={icon} size={16} color={colors.text2} />
          </View>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 16,
              fontFamily: CLOCK_FONT.title,
              fontWeight: CLOCK_FONT.title ? undefined : '700',
              color: colors.text,
            }}>
            {title}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: CLOCK_FONT.body, color: colors.text2, fontVariant: ['tabular-nums'] }}>
            {detail}
          </Text>
          <Text
            style={{
              fontSize: 16,
              fontFamily: CLOCK_FONT.title,
              fontWeight: CLOCK_FONT.title ? undefined : '700',
              color: colors.accent,
              fontVariant: ['tabular-nums'],
            }}>
            {value}
          </Text>
        </View>
      </Glass>
    </Pressable>
  );
}
