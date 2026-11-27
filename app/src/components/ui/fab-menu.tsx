import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type SFSymbol } from 'expo-symbols';
import { type ComponentProps, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { usePredictiveBack } from '@/hooks/use-predictive-back';
import { haptics } from '@/lib/haptics';
import { PAISA } from '@/lib/motion';
import { useTabBarFabOffset } from '@/lib/tab-bar';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface FabMenuItem {
  key: string;
  label: string;
  icon: IconName;
  /** SF Symbol for the iOS menu. */
  sf: SFSymbol;
  onPress: () => void;
}

const REDUCE = { reduceMotion: ReduceMotion.System } as const;
const FAB = 56;
const ITEM_HEIGHT = 56;

/** A menu item rising out of the FAB: up, grown to size, faded in, after `delay`. */
function riseFromFab(delay: number) {
  return () => {
    'worklet';
    const spring = { ...PAISA.rise, ...REDUCE };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 14 }, { scale: 0.8 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 140, ...REDUCE })),
        transform: [{ translateY: withDelay(delay, withSpring(0, spring)) }, { scale: withDelay(delay, withSpring(1, spring)) }],
      },
    };
  };
}

/**
 * Material 3 Expressive FAB menu. The FAB opens a stack of pill buttons that
 * rise in from it, nearest first, and turns into a round close button: the
 * container goes from primary container to primary, the corners round off and
 * the plus turns into an ×. A scrim behind the stack, a tap outside or Back
 * closes it.
 *
 * `items` read top to bottom, so the last one sits next to the FAB.
 */
export function FabMenu({
  items,
  accessibilityLabel = 'Create',
  bottom: bottomOverride,
}: {
  items: FabMenuItem[];
  accessibilityLabel?: string;
  bottom?: number;
}) {
  const { colors } = useTheme();
  const tabBarBottom = useTabBarFabOffset();
  const bottom = bottomOverride ?? tabBarBottom;
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withSpring(open ? 1 : 0, { ...PAISA.expand, ...REDUCE }));
  }, [open, progress]);

  // Predictive back: the stack shrinks toward the FAB and leans away from the
  // edge being swiped, the × turns part way back to a plus and the scrim
  // thins. Letting go closes the menu; a cancel springs it back.
  const back = useSharedValue(0);
  const edge = useSharedValue(1);
  useEffect(() => {
    if (open) back.set(0);
  }, [open, back]);
  usePredictiveBack(open, {
    onProgress: (p, from) => {
      edge.set(from === 'left' ? 1 : -1);
      // Ease out, so the first part of the swipe already shows a response.
      back.set(1 - (1 - p) * (1 - p));
    },
    onCancel: () => back.set(withSpring(0, { ...PAISA.expand, ...REDUCE })),
    onBack: () => {
      haptics.impact('light');
      setOpen(false);
    },
  });
  const stackStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.35 * back.value,
    transform: [{ translateX: 10 * back.value * edge.value }, { scale: 1 - 0.12 * back.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: 1 - 0.6 * back.value }));

  const toggleStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(progress.value - 0.4 * back.value, [0, 1], [16, FAB / 2], 'clamp'),
    backgroundColor: interpolateColor(progress.value - 0.4 * back.value, [0, 1], [colors.primaryContainer, colors.accent]),
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${Math.max(0, progress.value - 0.4 * back.value) * 135}deg` }],
  }));
  const plusInk = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const closeInk = useAnimatedStyle(() => ({ opacity: progress.value }));

  function toggle() {
    haptics.impact(open ? 'light' : 'medium');
    setOpen((v) => !v);
  }

  function pick(item: FabMenuItem) {
    haptics.tap();
    setOpen(false);
    item.onPress();
  }

  return (
    <>
      {open ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.bg, 0.72) }, scrimStyle]} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        </Animated.View>
      ) : null}

      <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom, alignItems: 'flex-end', gap: 8 }}>
        {open ? (
          <Animated.View style={[{ alignItems: 'flex-end', gap: 4, transformOrigin: 'bottom right' }, stackStyle]} accessibilityRole="menu">
            {items.map((item, i) => {
              // Nearest the FAB comes in first.
              const order = items.length - 1 - i;
              return (
                <Animated.View
                  key={item.key}
                  entering={riseFromFab(order * 40)}
                  exiting={FadeOut.duration(110).reduceMotion(ReduceMotion.System)}>
                  <MenuPill item={item} onPress={() => pick(item)} />
                </Animated.View>
              );
            })}
          </Animated.View>
        ) : null}

        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close menu' : accessibilityLabel}
          accessibilityState={{ expanded: open }}
          hitSlop={4}>
          <Animated.View
            style={[
              {
                width: FAB,
                height: FAB,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                elevation: 6,
                boxShadow: `0 6px 18px ${withAlpha(colors.accent, 0.3)}`,
              },
              toggleStyle,
            ]}>
            <Animated.View style={[{ width: 28, height: 28 }, iconStyle]}>
              <Animated.View style={[StyleSheet.absoluteFill, plusInk]}>
                <MaterialCommunityIcons name="plus" size={28} color={colors.onPrimaryContainer} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, closeInk]}>
                <MaterialCommunityIcons name="plus" size={28} color={colors.onAccent} />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

/** One menu button: a 56dp pill whose corners tighten under a finger. */
function MenuPill({ item, onPress }: { item: FabMenuItem; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
      android_ripple={{ color: withAlpha(colors.onPrimaryContainer, 0.12) }}
      style={({ pressed }) => ({
        height: ITEM_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: pressed ? 16 : ITEM_HEIGHT / 2,
        borderCurve: 'continuous',
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.primaryContainer,
      })}>
      <MaterialCommunityIcons name={item.icon} size={24} color={colors.onPrimaryContainer} />
      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.onPrimaryContainer }}>{item.label}</Text>
    </Pressable>
  );
}
