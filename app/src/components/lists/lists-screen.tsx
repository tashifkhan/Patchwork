import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Pressable, View as RNView } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { Frost, FrostTarget } from '@/components/ui/frost';
import { RiseIn } from '@/components/ui/motion';
import { RollingNumber } from '@/components/ui/rolling-number';
import { useTaskLists, useTasks } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import { listTone, type ListSummary, summarizeLists } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { useUiStore } from '@/stores/ui-store';
import { Text, View } from '@/tw';

const BAR_HEIGHT = 64;
const CARD_HEIGHT = 140;
/** How much of each card the next one covers, like a fanned stack. */
const OVERLAP = 36;
const RADIUS = 32;

/**
 * Android: every list as a fanned stack of tonal cards, each with its done
 * count, its open count and an arrow out. Tapping one opens it on Tasks.
 * The top bar is frosted glass over the stack; its small title and hairline
 * come in once the big title scrolls away. Cards deal in one after another
 * and give under a finger.
 */
export function ListsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const target = useRef<RNView | null>(null);
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const selectedListId = useUiStore((s) => s.selectedListId);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);

  const summaries = useMemo(
    () => summarizeLists(listsQuery.data ?? [], tasksQuery.data ?? []),
    [listsQuery.data, tasksQuery.data]
  );
  const openTotal = summaries.reduce((sum, s) => sum + s.open, 0);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  const smallTitle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [40, 80], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [40, 80], [8, 0], Extrapolation.CLAMP) }],
  }));
  const hairline = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 24], [0, 1], Extrapolation.CLAMP),
  }));

  const open = (summary: ListSummary) => {
    setSelectedListId(summary.list.id);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <FrostTarget target={target} style={{ flex: 1, backgroundColor: colors.bg }}>
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: insets.top + BAR_HEIGHT + 4,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 32,
          }}>
          <RiseIn>
            <Text style={{ fontSize: 34, lineHeight: 42, fontWeight: '700', letterSpacing: -0.5, color: colors.text }}>
              My lists
            </Text>
            <Text style={{ fontSize: 15, color: colors.text2, marginTop: 2, marginBottom: 20 }}>
              {summaries.length} {summaries.length === 1 ? 'list' : 'lists'} · {openTotal} open
            </Text>
          </RiseIn>
          {summaries.length === 0 && !listsQuery.isLoading ? (
            <Text style={{ fontSize: 15, color: colors.text2, marginTop: 24 }}>
              No lists yet. Add one from the list switcher on Tasks.
            </Text>
          ) : null}
          {summaries.map((summary, index) => (
            <RiseIn
              key={summary.list.id}
              index={index}
              rise={36}
              fromScale={0.94}
              style={{ marginTop: index === 0 ? 0 : -OVERLAP, zIndex: index }}>
              <ListCard
                summary={summary}
                index={index}
                current={summary.list.id === selectedListId}
                last={index === summaries.length - 1}
                onPress={() => open(summary)}
              />
            </RiseIn>
          ))}
        </Animated.ScrollView>
      </FrostTarget>

      {/* Frosted top bar over the stack. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + BAR_HEIGHT,
          overflow: 'hidden',
        }}>
        <Frost target={target} />
        <View
          style={{
            marginTop: insets.top,
            height: BAR_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            gap: 4,
          }}>
          <BackButton />
          <Animated.Text
            numberOfLines={1}
            style={[{ flex: 1, fontSize: 20, fontWeight: '600', color: colors.text }, smallTitle]}>
            My lists
          </Animated.Text>
        </View>
        <Animated.View
          style={[
            { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: colors.separator },
            hairline,
          ]}
        />
      </View>
    </View>
  );
}

function BackButton() {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.08, maxTranslate: 2, pressedScale: 0.9 });
  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          router.back();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <PressGlow press={press} color={withAlpha(colors.text, 0.12)} radius={24} size={24} />
        <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
      </Pressable>
    </Animated.View>
  );
}

function ListCard({
  summary,
  index,
  current,
  last,
  onPress,
}: {
  summary: ListSummary;
  index: number;
  current: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill, ink } = listTone(colors, dark, index);
  const press = useElasticPress({ maxStretch: 0.015, maxTranslate: 1.5, pressedScale: 0.97, releaseOnDrag: true });
  // The arrow leans out toward its corner while the card is held.
  const arrow = useAnimatedStyle(() => ({
    transform: [
      { translateX: 4 * press.glow.value },
      { translateY: -4 * press.glow.value },
      { scale: 1 + 0.12 * press.glow.value },
    ],
  }));
  const { list, open, done } = summary;
  const chip = withAlpha(dark ? '#FFFFFF' : '#FFFFFF', dark ? 0.12 : 0.62);

  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={`${list.name}, ${open} open, ${done} done${current ? ', current list' : ''}`}
        style={{
          height: last ? CARD_HEIGHT - OVERLAP + 8 : CARD_HEIGHT,
          borderRadius: RADIUS,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: fill,
          paddingHorizontal: 22,
          paddingTop: 20,
          // A soft shadow cast upward onto the card underneath.
          boxShadow: index === 0 ? undefined : `0 -6px 18px ${withAlpha('#000000', dark ? 0.4 : 0.1)}`,
        }}>
        <PressGlow press={press} color={withAlpha(ink, dark ? 0.12 : 0.1)} radius={RADIUS} size={60} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 22, fontWeight: '600', color: ink }}>
            {list.name}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 12,
              height: 28,
              borderRadius: 14,
              backgroundColor: chip,
            }}>
            {current ? <MaterialCommunityIcons name="check" size={14} color={ink} /> : null}
            <RollingNumber value={done} style={{ fontSize: 13, fontWeight: '600', color: ink }} />
            <Text style={{ fontSize: 13, fontWeight: '500', color: ink }}>done</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <RollingNumber value={open} style={{ fontSize: 16, color: withAlpha(ink, 0.78) }} />
          <Text style={{ flex: 1, fontSize: 16, color: withAlpha(ink, 0.78) }}> open</Text>
          <Animated.View style={arrow}>
            <MaterialCommunityIcons name="arrow-top-right" size={26} color={ink} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
