import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, Pressable } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING, SPRING } from '@/lib/motion';
import { Text, View } from '@/tw';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Floating toolbar shown while a to-do is open in place, like the Things
 * "Move / Delete / ..." bar, styled as an M3 Expressive *vibrant* floating
 * toolbar: a full-round `primaryContainer` pill with the main action as a
 * filled `primary` button and the rest as icon buttons.
 */
export function TaskActionBar({
  bottom,
  onMove,
  onDelete,
  onDetails,
  deleteLabel = 'Delete',
}: {
  bottom: number;
  onMove: () => void;
  onDelete: () => void;
  /** Omit to hide the "Details" button (e.g. on the detail screen itself). */
  onDetails?: () => void;
  deleteLabel?: string;
}) {
  const { colors } = useTheme();

  return (
    <Animated.View
      entering={SlideInDown.springify()
        .damping(SPRING.spatial.damping)
        .stiffness(SPRING.spatial.stiffness)}
      exiting={FadeOut.duration(DURATION.short3).easing(EASING.emphasizedAccelerate)}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }}>
      <View
        className="flex-row items-center"
        style={{
          backgroundColor: colors.primaryContainer,
          borderRadius: 32,
          borderCurve: 'continuous',
          height: 64,
          paddingHorizontal: 8,
          gap: 4,
          // M3 elevation level 3.
          boxShadow: '0 4px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.3)',
        }}>
        <Pressable
          onPress={() => {
            haptics.tap();
            onMove();
          }}
          accessibilityRole="button"
          accessibilityLabel="Move"
          android_ripple={{ color: colors.separator }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 48,
            paddingLeft: 16,
            paddingRight: 20,
            // Expressive shape morph: the pill squares off while held.
            borderRadius: pressed ? 12 : 24,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: colors.accent,
            opacity: pressed && Platform.OS === 'ios' ? 0.85 : 1,
          })}>
          <MaterialCommunityIcons name="arrow-right" size={22} color={colors.onAccent} />
          <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>Move</Text>
        </Pressable>
        <IconAction
          icon="trash-can-outline"
          label={deleteLabel}
          color={colors.onPrimaryContainer}
          onPress={onDelete}
        />
        {onDetails ? (
          <IconAction
            icon="arrow-expand"
            label="Details"
            color={colors.onPrimaryContainer}
            onPress={onDetails}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

function IconAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: IconName;
  label: string;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.separator, borderless: true, radius: 24 }}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: pressed ? 12 : 24,
        borderCurve: 'continuous',
        opacity: pressed && Platform.OS === 'ios' ? 0.6 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
    </Pressable>
  );
}
