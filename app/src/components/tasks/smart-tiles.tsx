import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { RiseIn } from '@/components/ui/motion';
import { RollingNumber } from '@/components/ui/rolling-number';
import { haptics } from '@/lib/haptics';
import { EXPRESSIVE } from '@/lib/motion';
import { SMART_LABELS, SMART_ORDER, type SmartKey, smartTone } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<SmartKey, IconName> = {
  today: 'clock-outline',
  scheduled: 'calendar-clock',
  all: 'tray-full',
  overdue: 'alert-circle-outline',
};

const REDUCE = { reduceMotion: ReduceMotion.System } as const;
/** Corner radius at rest and when chosen: a chosen tile tightens to a squarer shape (M3 Expressive shape morph). */
const RADIUS = 28;
const RADIUS_SELECTED = 16;
const TILE_HEIGHT = 100;

export interface SmartTilesProps {
  counts: Record<SmartKey, number>;
  selected: SmartKey | null;
  onSelect: (key: SmartKey | null) => void;
  listCount: number;
  onOpenLists: () => void;
}

/**
 * Android: four tonal tiles (Today, Scheduled, All, Overdue) in a 2 by 2 grid
 * with a "My lists" bar under them. Tapping a tile filters the to-dos below;
 * tapping it again clears the filter. Material 3 Expressive: the chosen tile
 * morphs to a squarer shape and inverts its icon, the counts roll, and every
 * tile gives under a finger with Paisa's glow.
 */
export function SmartTiles({ counts, selected, onSelect, listCount, onOpenLists }: SmartTilesProps) {
  const rows: SmartKey[][] = [SMART_ORDER.slice(0, 2), SMART_ORDER.slice(2, 4)];
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((key, c) => (
            <RiseIn key={key} index={r * 2 + c} style={{ flex: 1 }}>
              <SmartTile
                smartKey={key}
                count={counts[key]}
                selected={selected === key}
                onPress={() => onSelect(selected === key ? null : key)}
              />
            </RiseIn>
          ))}
        </View>
      ))}
      <RiseIn index={4}>
        <ListsBar count={listCount} onPress={onOpenLists} />
      </RiseIn>
    </View>
  );
}

function SmartTile({
  smartKey,
  count,
  selected,
  onPress,
}: {
  smartKey: SmartKey;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const { fill, ink } = smartTone(colors, scheme === 'dark', smartKey);
  return (
    <ToneTile
      icon={ICONS[smartKey]}
      label={SMART_LABELS[smartKey]}
      count={count}
      fill={fill}
      ink={ink}
      selected={selected}
      onPress={onPress}
    />
  );
}

export interface ToneTileProps {
  icon: IconName;
  label: string;
  count: number;
  /** Container and content colors, e.g. from `smartTone` or `containerTone`. */
  fill: string;
  ink: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * One tonal tile: icon disc on top, label and a rolling count below. Shared
 * by the Tasks smart lists and the Boards home so the two read as one app.
 */
export function ToneTile({ icon, label, count, fill, ink, selected, onPress }: ToneTileProps) {
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const press = useElasticPress({ maxStretch: 0.05, maxTranslate: 2, pressedScale: 0.95, releaseOnDrag: true });

  const radius = useSharedValue(selected ? RADIUS_SELECTED : RADIUS);
  const chosen = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    radius.set(withSpring(selected ? RADIUS_SELECTED : RADIUS, { ...EXPRESSIVE.indicatorLead, ...REDUCE }));
    chosen.set(withTiming(selected ? 1 : 0, { duration: 200 }));
  }, [selected, radius, chosen]);
  const shape = useAnimatedStyle(() => ({
    borderRadius: radius.value,
    borderWidth: 2.5 * chosen.value,
  }));

  // Each tap pops the icon and gives it a small wiggle.
  const pop = useSharedValue(1);
  const tilt = useSharedValue(0);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { rotate: `${tilt.value}deg` }],
  }));
  const bump = () => {
    pop.set(
      withSequence(
        withTiming(1.18, { duration: 110, ...REDUCE }),
        withSpring(1, { damping: 9, stiffness: 320, ...REDUCE })
      )
    );
    tilt.set(
      withSequence(
        withTiming(-9, { duration: 70, ...REDUCE }),
        withTiming(7, { duration: 90, ...REDUCE }),
        withTiming(0, { duration: 90, ...REDUCE })
      )
    );
  };

  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.selection();
          bump();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${label}, ${count}`}>
        <Animated.View
          style={[
            {
              height: TILE_HEIGHT,
              backgroundColor: fill,
              borderColor: ink,
              borderCurve: 'continuous',
              overflow: 'hidden',
              padding: 14,
              justifyContent: 'space-between',
            },
            shape,
          ]}>
          <PressGlow press={press} color={withAlpha(ink, dark ? 0.14 : 0.1)} radius={RADIUS} size={52} />
          <Animated.View
            style={[
              {
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? ink : withAlpha('#FFFFFF', dark ? 0.12 : 0.6),
              },
              iconStyle,
            ]}>
            <MaterialCommunityIcons name={icon} size={21} color={selected ? fill : ink} />
          </Animated.View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Text style={{ color: ink, fontSize: 16, fontWeight: '600', includeFontPadding: false }}>
              {label}
            </Text>
            <RollingNumber
              value={count}
              style={{ color: ink, fontSize: 28, lineHeight: 32, fontWeight: '700', includeFontPadding: false }}
            />
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** "My lists": opens every list as a stack of cards. Its arrow leans out while held. */
function ListsBar({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.02, maxTranslate: 1.5, pressedScale: 0.97, releaseOnDrag: true });
  const arrow = useAnimatedStyle(() => ({
    transform: [{ translateX: 3 * press.glow.value }, { translateY: -3 * press.glow.value }],
  }));
  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={`My lists, ${count}`}
        style={{
          height: 60,
          borderRadius: 30,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: colors.bg2,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          gap: 12,
        }}>
        <PressGlow press={press} color={withAlpha(colors.accent, 0.14)} radius={30} />
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primaryContainer,
          }}>
          <MaterialCommunityIcons name="format-list-bulleted-square" size={21} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>My lists</Text>
          <Text style={{ color: colors.text2, fontSize: 13 }}>
            {count} {count === 1 ? 'list' : 'lists'}
          </Text>
        </View>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.selectionBg,
          }}>
          <Animated.View style={arrow}>
            <MaterialCommunityIcons name="arrow-top-right" size={20} color={colors.onSelectionBg} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
