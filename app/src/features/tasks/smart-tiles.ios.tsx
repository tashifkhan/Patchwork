import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GroupedCard, useSettingsColors } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { RiseIn } from '@/components/ui/motion';
import { RollingNumber } from '@/components/ui/rolling-number';
import { haptics } from '@/lib/haptics';
import { SMART_LABELS, SMART_ORDER, type SmartKey } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

import type { SmartTilesProps } from './smart-tiles';

export type { SmartTilesProps };

/** Things 3's colours for its smart lists: yellow star for Today, red calendar for Upcoming. */
const GLYPHS: Record<SmartKey, { sf: SFSymbol; color: string }> = {
  today: { sf: 'star.fill', color: '#F5BD26' },
  scheduled: { sf: 'calendar', color: '#EC4D5C' },
  all: { sf: 'tray.full.fill', color: '#4A90E2' },
  overdue: { sf: 'exclamationmark.circle.fill', color: '#F28C28' },
};

const REDUCE = { reduceMotion: ReduceMotion.System } as const;
const RADIUS = 22;

/**
 * iOS: the Reminders home grid, in Things 3 colours. Four opaque cards with a
 * coloured glyph and a big count, then a Lists row. Content stays opaque;
 * Liquid Glass is for the bars and controls floating over it. A chosen card
 * takes on its colour, its glyph pops, and the counts roll.
 */
export function SmartTiles({ counts, selected, onSelect, listCount, onOpenLists }: SmartTilesProps) {
  const { colors } = useTheme();
  const rows: SmartKey[][] = [SMART_ORDER.slice(0, 2), SMART_ORDER.slice(2, 4)];
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((key, c) => (
            <RiseIn key={key} index={r * 2 + c} style={{ flex: 1 }} rise={8}>
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
      <RiseIn index={4} rise={8}>
        <GroupedCard radius={RADIUS}>
          <Pressable
            onPress={() => {
              haptics.tap();
              onOpenLists();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Lists, ${listCount}`}
            style={({ pressed }) => ({
              minHeight: 52,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 14,
              backgroundColor: pressed ? withAlpha(colors.text, 0.06) : 'transparent',
            })}>
            <SymbolView name="list.bullet.circle.fill" size={28} tintColor={colors.accent} />
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.text }}>Lists</Text>
            <RollingNumber value={listCount} style={{ fontSize: 17, color: colors.text2 }} />
            <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.text3} />
          </Pressable>
        </GroupedCard>
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
  const { colors } = useTheme();
  const { cell } = useSettingsColors();
  const glyph = GLYPHS[smartKey];

  const scale = useSharedValue(1);
  const pop = useSharedValue(1);
  const chosen = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    chosen.set(withTiming(selected ? 1 : 0, { duration: 180 }));
  }, [selected, chosen]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: chosen.value }));
  const glyphStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Animated.View style={cardStyle}>
      <Pressable
        onPressIn={() => scale.set(withTiming(0.96, { duration: 90, ...REDUCE }))}
        onPressOut={() => scale.set(withSpring(1, { damping: 14, stiffness: 380, ...REDUCE }))}
        onPress={() => {
          haptics.selection();
          pop.set(
            withSequence(
              withTiming(1.22, { duration: 120, ...REDUCE }),
              withSpring(1, { damping: 8, stiffness: 300, ...REDUCE })
            )
          );
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${SMART_LABELS[smartKey]}, ${count} open`}
        style={{
          height: 88,
          borderRadius: RADIUS,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: cell,
          padding: 12,
          justifyContent: 'space-between',
        }}>
        {/* The chosen card washes in its own colour with a ring of it. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: RADIUS,
              borderCurve: 'continuous',
              borderWidth: 2,
              borderColor: glyph.color,
              backgroundColor: withAlpha(glyph.color, 0.14),
            },
            ringStyle,
          ]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Animated.View
            style={[
              {
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: glyph.color,
                alignItems: 'center',
                justifyContent: 'center',
              },
              glyphStyle,
            ]}>
            <SymbolView name={glyph.sf} size={17} weight="semibold" tintColor="#FFFFFF" />
          </Animated.View>
          <RollingNumber
            value={count}
            style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }}
          />
        </View>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text2 }}>{SMART_LABELS[smartKey]}</Text>
      </Pressable>
    </Animated.View>
  );
}
