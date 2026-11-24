import { Stack, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { GroupedCard, RowSeparator, useSettingsColors } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { RiseIn } from '@/components/ui/motion';
import { RollingNumber } from '@/components/ui/rolling-number';
import { useTaskLists, useTasks } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import { stagger } from '@/lib/motion';
import { type ListSummary, summarizeLists } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { useUiStore } from '@/stores/ui-store';
import { Text, View } from '@/tw';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * iOS: lists the way Things 3 shows projects. Lists sit in inset groups under
 * their account (Things' areas), each with a progress pie, its open count and
 * a chevron. The system large-title bar is the Liquid Glass navigation; pies
 * fill in as the screen appears.
 */
export function ListsScreen() {
  const { colors } = useTheme();
  const settings = useSettingsColors();
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const selectedListId = useUiStore((s) => s.selectedListId);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);

  const areas = useMemo(() => {
    const summaries = summarizeLists(listsQuery.data ?? [], tasksQuery.data ?? []);
    // The running index staggers the pies down the whole screen, across groups.
    const byArea = new Map<string, { summary: ListSummary; index: number }[]>();
    summaries.forEach((summary, index) => {
      const area = summary.list.account_name ?? '';
      byArea.set(area, [...(byArea.get(area) ?? []), { summary, index }]);
    });
    return [...byArea.entries()];
  }, [listsQuery.data, tasksQuery.data]);

  const open = (summary: ListSummary) => {
    setSelectedListId(summary.list.id);
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Lists',
          headerLargeTitle: true,
          headerTransparent: true,
          headerLargeTitleShadowVisible: false,
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: settings.screen }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 22 }}>
        {areas.length === 0 && !listsQuery.isLoading ? (
          <Text style={{ fontSize: 15, color: colors.text2, textAlign: 'center', marginTop: 40 }}>
            No lists yet. Add one from the list switcher on Tasks.
          </Text>
        ) : null}
        {areas.map(([area, summaries]) => (
          <View key={area || 'lists'} style={{ gap: 8 }}>
            {area ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
                <SymbolView name="shippingbox.fill" size={17} tintColor={colors.text3} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{area}</Text>
              </View>
            ) : null}
            <RiseIn rise={8}>
              <GroupedCard>
                {summaries.map(({ summary, index }, i) => (
                  <View key={summary.list.id}>
                    {i > 0 ? <RowSeparator /> : null}
                    <ListRow
                      summary={summary}
                      index={index}
                      current={summary.list.id === selectedListId}
                      onPress={() => open(summary)}
                    />
                  </View>
                ))}
              </GroupedCard>
            </RiseIn>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function ListRow({
  summary,
  index,
  current,
  onPress,
}: {
  summary: ListSummary;
  index: number;
  current: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const settings = useSettingsColors();
  const { list, open, done } = summary;
  const total = open + done;
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${list.name}, ${open} open, ${done} done${current ? ', current list' : ''}`}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        backgroundColor: pressed ? settings.pressed : 'transparent',
      })}>
      <ProgressPie progress={total === 0 ? 0 : done / total} color={colors.accent} delay={stagger(index, 40, 320)} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, color: colors.text }}>
        {list.name}
      </Text>
      {current ? <SymbolView name="checkmark" size={15} weight="semibold" tintColor={colors.accent} /> : null}
      <RollingNumber value={open} style={{ fontSize: 17, color: colors.text2 }} />
      <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.text3} />
    </Pressable>
  );
}

/** Things' project pie: an outlined circle that fills clockwise with what's done. */
function ProgressPie({ progress, color, delay }: { progress: number; color: string; delay: number }) {
  const size = 22;
  const outer = size / 2 - 1;
  // A circle stroked as wide as its own radius draws a pie slice.
  const r = outer / 2 - 0.5;
  const circumference = 2 * Math.PI * r;
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withDelay(
        delay,
        withTiming(progress, { duration: 520, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System })
      )
    );
  }, [progress, delay, shown]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - shown.value),
  }));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={outer} stroke={color} strokeWidth={1.8} fill={withAlpha(color, 0.08)} />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={r * 2}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
