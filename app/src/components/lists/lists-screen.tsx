import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { type ComponentProps, useRef } from 'react';
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
import { useListEntries } from '@/hooks/use-list-entries';
import { haptics } from '@/lib/haptics';
import { containerTone, listTone, type Tone } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { useUiStore } from '@/stores/ui-store';
import { Text, View } from '@/tw';

const BAR_HEIGHT = 64;
const CARD_HEIGHT = 140;
/** How much of each card the next one covers, like a fanned stack. */
const OVERLAP = 36;
const RADIUS = 32;

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** One card in the stack: All tasks, a list, or a GitHub repo. */
interface Entry {
  id: string | null;
  title: string;
  icon?: IconName;
  open: number;
  /** Null for repos, which only count open issues. */
  done: number | null;
  tone: Tone;
  /** Long-press action: lists open their editor. */
  onLongPress?: () => void;
}

/**
 * Android: everything Tasks can show, as a fanned stack of tonal cards. All
 * tasks leads, then each list, then followed GitHub repos. Each card has its
 * done count, its open count and an arrow out; tapping one opens it on
 * Tasks, long-pressing a list edits it, and + in the top bar makes a new one.
 * This is the one list switcher on Android: the Tasks title opens it too.
 * The top bar is frosted glass over the stack; its small title and hairline
 * come in once the big title scrolls away. Cards deal in one after another
 * and give under a finger.
 */
export function ListsScreen() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const target = useRef<RNView | null>(null);
  const dark = scheme === 'dark';
  const { summaries, all, repos, loading } = useListEntries();
  const requestCreateList = useUiStore((s) => s.requestCreateList);
  const selectedListId = useUiStore((s) => s.selectedListId);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);

  const entries: Entry[] = [
    {
      id: null,
      title: 'All tasks',
      icon: 'tray-full',
      open: all.open,
      done: all.done,
      tone: { fill: colors.accent, ink: colors.onAccent },
    },
    ...summaries.map((summary, index) => ({
      id: summary.list.id,
      title: summary.list.name,
      open: summary.open,
      done: summary.done,
      tone: listTone(colors, dark, index),
      onLongPress: () =>
        router.push({ pathname: '/edit-list', params: { listId: summary.list.id, name: summary.list.name } }),
    })),
    ...repos.map((repo) => ({
      id: repo.id,
      title: repo.name,
      icon: 'github' as const,
      open: repo.open,
      done: null,
      tone: containerTone(colors.gray, dark),
    })),
  ];
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

  const open = (id: string | null) => {
    setSelectedListId(id);
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
          {entries.map((entry, index) => (
            <RiseIn
              key={entry.id ?? 'all'}
              index={index}
              rise={36}
              fromScale={0.94}
              style={{ marginTop: index === 0 ? 0 : -OVERLAP, zIndex: index }}>
              <ListCard
                entry={entry}
                index={index}
                current={entry.id === selectedListId}
                last={index === entries.length - 1}
                onPress={() => open(entry.id)}
              />
            </RiseIn>
          ))}
          {summaries.length === 0 && !loading ? (
            <Text style={{ fontSize: 15, color: colors.text2, marginTop: 20, textAlign: 'center' }}>
              No lists yet. Tap + to make one.
            </Text>
          ) : summaries.length > 0 ? (
            <Text style={{ fontSize: 13, color: colors.text3, marginTop: 20, textAlign: 'center' }}>
              Long-press a list to rename or delete it.
            </Text>
          ) : null}
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
          <BarButton
            icon="plus"
            label="New list"
            onPress={() => {
              requestCreateList(true);
              router.back();
            }}
          />
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
  return <BarButton icon="arrow-left" label="Back" onPress={() => router.back()} />;
}

function BarButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.08, maxTranslate: 2, pressedScale: 0.9 });
  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <PressGlow press={press} color={withAlpha(colors.text, 0.12)} radius={24} size={24} />
        <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      </Pressable>
    </Animated.View>
  );
}

function ListCard({
  entry,
  index,
  current,
  last,
  onPress,
}: {
  entry: Entry;
  index: number;
  current: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill, ink } = entry.tone;
  const press = useElasticPress({ maxStretch: 0.015, maxTranslate: 1.5, pressedScale: 0.97, releaseOnDrag: true });
  // The arrow leans out toward its corner while the card is held.
  const arrow = useAnimatedStyle(() => ({
    transform: [
      { translateX: 4 * press.glow.value },
      { translateY: -4 * press.glow.value },
      { scale: 1 + 0.12 * press.glow.value },
    ],
  }));
  const { title, open, done, icon } = entry;
  const chip = withAlpha('#FFFFFF', dark ? 0.12 : 0.62);
  const unit = entry.id?.startsWith('gh:') ? 'open issue' : 'open';

  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onLongPress={
          entry.onLongPress
            ? () => {
                haptics.impact('medium');
                entry.onLongPress?.();
              }
            : undefined
        }
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${open} open${done != null ? `, ${done} done` : ''}${current ? ', current list' : ''}`}
        accessibilityHint={entry.onLongPress ? 'Long-press to edit the list' : undefined}
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
          {icon ? <MaterialCommunityIcons name={icon} size={24} color={ink} /> : null}
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 22, fontWeight: '600', color: ink }}>
            {title}
          </Text>
          {done != null || current ? (
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
            {done != null ? (
              <>
                <RollingNumber value={done} style={{ fontSize: 13, fontWeight: '600', color: ink }} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: ink }}>done</Text>
              </>
            ) : (
              <Text style={{ fontSize: 13, fontWeight: '500', color: ink }}>Showing</Text>
            )}
          </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <RollingNumber value={open} style={{ fontSize: 16, color: withAlpha(ink, 0.78) }} />
          <Text style={{ flex: 1, fontSize: 16, color: withAlpha(ink, 0.78) }}>
            {' '}
            {open === 1 || unit === 'open' ? unit : `${unit}s`}
          </Text>
          <Animated.View style={arrow}>
            <MaterialCommunityIcons name="arrow-top-right" size={26} color={ink} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
