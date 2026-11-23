import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { haptics } from '@/lib/haptics';
import { withAlpha } from '@/lib/theme';
import { View } from '@/tw';

/*
 * M3 Expressive connected button group (m3.material.io/components/button-groups,
 * MDC ButtonGroup): buttons 2dp apart, fully round outer corners, 8dp inner
 * corners. Pressed: inner corners tighten to 4dp and the button widens while
 * its neighbours give way. Selected: filled primary with fully round corners.
 */

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface GroupItem {
  icon: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
}

const HEIGHT = 40;
const WIDTH = 52;
const GAP = 2;
const OUTER = HEIGHT / 2;
const INNER = 8;
const INNER_PRESSED = 4;
/** M3 Expressive fast spatial spring (damping 0.6, stiffness 800). */
const SPATIAL = { damping: 2 * 0.6 * Math.sqrt(800), stiffness: 800, mass: 1, reduceMotion: ReduceMotion.System };

export function ConnectedButtonGroup({ items }: { items: GroupItem[] }) {
  return (
    <View accessibilityRole="toolbar" className="flex-row items-center" style={{ gap: GAP }}>
      {items.map((item, index) => (
        <GroupButton key={item.label} item={item} first={index === 0} last={index === items.length - 1} />
      ))}
    </View>
  );
}

function GroupButton({ item, first, last }: { item: GroupItem; first: boolean; last: boolean }) {
  const { colors } = useTheme();
  const held = useSharedValue(0);
  const selected = useSharedValue(item.selected ? 1 : 0);
  const press = useElasticPress({ maxStretch: 0.05, maxTranslate: 1, pressedScale: 0.98, releaseOnDrag: true });

  useEffect(() => {
    selected.set(withSpring(item.selected ? 1 : 0, SPATIAL));
  }, [item.selected, selected]);

  const shape = useAnimatedStyle(() => {
    const h = held.get();
    const s = selected.get();
    // Inner corners: 8 at rest, 4 while pressed, fully round when selected.
    const inner = INNER + (INNER_PRESSED - INNER) * h + (OUTER - INNER) * s * (1 - h);
    return {
      width: WIDTH + 12 * h,
      borderTopLeftRadius: first ? OUTER : inner,
      borderBottomLeftRadius: first ? OUTER : inner,
      borderTopRightRadius: last ? OUTER : inner,
      borderBottomRightRadius: last ? OUTER : inner,
    };
  });

  const bg = item.selected ? colors.accent : colors.selectionBg;
  const ink = item.selected ? colors.onAccent : colors.onSelectionBg;

  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          item.onPress();
        }}
        onPressIn={() => held.set(withSpring(1, SPATIAL))}
        onPressOut={() => {
          held.set(withSpring(0, SPATIAL));
          press.release();
        }}
        accessibilityRole="button"
        accessibilityLabel={item.selected ? `${item.label}, running` : item.label}>
        <Animated.View
          style={[
            { height: HEIGHT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: bg },
            shape,
          ]}>
          <PressGlow press={press} color={item.selected ? 'rgba(255,255,255,0.25)' : withAlpha(colors.accent, 0.18)} radius={INNER} size={22} />
          <MaterialCommunityIcons name={item.icon} size={22} color={ink} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
