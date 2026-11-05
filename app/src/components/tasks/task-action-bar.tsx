import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Keyboard, Platform, Pressable } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
  const lift = useKeyboardLift(bottom);
  const position = useAnimatedStyle(() => ({ bottom: lift.value }));

  return (
    <Animated.View
      entering={SlideInDown.springify()
        .damping(SPRING.spatial.damping)
        .stiffness(SPRING.spatial.stiffness)}
      exiting={FadeOut.duration(DURATION.short3).easing(EASING.emphasizedAccelerate)}
      pointerEvents="box-none"
      style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }, position]}>
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

/** Gap kept between the bar and the top of the keyboard. */
const KEYBOARD_GAP = 10;

/**
 * Bottom offset that rides above the iOS keyboard. iOS overlays the keyboard
 * on the screen, so a bar pinned to the bottom ends up hidden while you type
 * a title or notes. The bar moves with the keyboard's own duration and curve.
 * Android resizes the window for the keyboard, so it keeps the given offset.
 */
function useKeyboardLift(bottom: number) {
  const lift = useSharedValue(bottom);

  useEffect(() => {
    lift.value = bottom;
    if (Platform.OS !== 'ios') return;
    const curve = Easing.bezier(0.38, 0.7, 0.125, 1);
    const show = Keyboard.addListener('keyboardWillShow', (event) => {
      lift.value = withTiming(Math.max(bottom, event.endCoordinates.height + KEYBOARD_GAP), {
        duration: event.duration || 250,
        easing: curve,
      });
    });
    const hide = Keyboard.addListener('keyboardWillHide', (event) => {
      lift.value = withTiming(bottom, { duration: event.duration || 250, easing: curve });
    });
    // Opened while the keyboard is already up (e.g. tapping another card).
    const metrics = Keyboard.metrics();
    if (metrics && Keyboard.isVisible()) {
      lift.value = Math.max(bottom, metrics.height + KEYBOARD_GAP);
    }
    return () => {
      show.remove();
      hide.remove();
    };
  }, [bottom, lift]);

  return lift;
}
