import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { DeckCard as DeckCardType, DeckStack } from '@/api/types';
import { DeckCard } from '@/components/deck/deck-card';
import { useTheme } from '@/components/theme/context';
import { Text, View } from '@/tw';

export interface CardMove {
  card: DeckCardType;
  fromStackId: number;
  toStackId: number;
  /** Zero-based position within the destination stack (dragged card excluded). */
  toIndex: number;
}

interface KanbanBoardProps {
  stacks: DeckStack[];
  indicatorColor: string;
  onMoveCard: (move: CardMove) => void;
  onOpenCard: (stackId: number, card: DeckCardType) => void;
  onAddCard: (stackId: number) => void;
  onEditStack: (stack: DeckStack) => void;
  onAddColumn: () => void;
  longPressMs?: number;
}

type Entry =
  | { kind: 'header'; stackIdx: number }
  | { kind: 'empty'; stackIdx: number }
  | { kind: 'card'; stackIdx: number; cardIdx: number };

interface Marker {
  stackIdx: number;
  index: number;
}

// A vertical kanban surface with full drag-and-drop: long-press a card to lift
// it, then drop it anywhere — a new slot in its own stack or into another
// stack. Sibling rows stay put during the drag; the move is committed once on
// release so variable row heights never force a mid-gesture relayout.
export function KanbanBoard({
  stacks,
  indicatorColor,
  onMoveCard,
  onOpenCard,
  onAddCard,
  onEditStack,
  onAddColumn,
  longPressMs = 220,
}: KanbanBoardProps) {
  const { colors } = useTheme();
  const heights = useRef<number[]>([]);
  const markerRef = useRef<Marker | null>(null);
  const [activeEntry, setActiveEntry] = useState<number | null>(null);
  const [marker, setMarker] = useState<Marker | null>(null);

  // Only stacks with a real numeric id can hold cards / accept drops.
  const liveStacks = useMemo(
    () => stacks.filter((stack) => typeof stack.id === 'number'),
    [stacks]
  );

  const { entries, headerEntryIndex } = useMemo(() => {
    const list: Entry[] = [];
    const headers: number[] = [];
    liveStacks.forEach((stack, stackIdx) => {
      headers[stackIdx] = list.length;
      list.push({ kind: 'header', stackIdx });
      const cards = stack.cards ?? [];
      if (cards.length === 0) {
        list.push({ kind: 'empty', stackIdx });
      } else {
        cards.forEach((_card, cardIdx) => list.push({ kind: 'card', stackIdx, cardIdx }));
      }
    });
    return { entries: list, headerEntryIndex: headers };
  }, [liveStacks]);

  const tops = useCallback(() => {
    const result: number[] = [];
    let acc = 0;
    for (let i = 0; i < entries.length; i += 1) {
      result.push(acc);
      acc += heights.current[i] ?? 0;
    }
    return result;
  }, [entries.length]);

  // Maps the dragged card's center Y to a (stack, index) drop target.
  const resolveTarget = useCallback(
    (fromEntryIdx: number, translationY: number): Marker | null => {
      const t = tops();
      const center = (t[fromEntryIdx] ?? 0) + (heights.current[fromEntryIdx] ?? 0) / 2 + translationY;

      let stackIdx = 0;
      for (let s = 0; s < liveStacks.length; s += 1) {
        if ((t[headerEntryIndex[s]] ?? 0) <= center) stackIdx = s;
        else break;
      }

      // Card entry indices in the target stack, excluding the dragged card.
      const cardEntryIdxs: number[] = [];
      entries.forEach((entry, idx) => {
        if (entry.kind === 'card' && entry.stackIdx === stackIdx && idx !== fromEntryIdx) {
          cardEntryIdxs.push(idx);
        }
      });

      let index = cardEntryIdxs.length;
      for (let k = 0; k < cardEntryIdxs.length; k += 1) {
        const idx = cardEntryIdxs[k];
        const mid = (t[idx] ?? 0) + (heights.current[idx] ?? 0) / 2;
        if (center < mid) {
          index = k;
          break;
        }
      }
      return { stackIdx, index };
    },
    [entries, headerEntryIndex, liveStacks.length, tops]
  );

  const onUpdate = useCallback(
    (fromEntryIdx: number, translationY: number) => {
      const target = resolveTarget(fromEntryIdx, translationY);
      markerRef.current = target;
      setMarker(target);
    },
    [resolveTarget]
  );

  const commit = useCallback(
    (fromEntryIdx: number) => {
      setActiveEntry(null);
      const target = markerRef.current;
      markerRef.current = null;
      setMarker(null);
      if (!target) return;

      const fromEntry = entries[fromEntryIdx];
      if (!fromEntry || fromEntry.kind !== 'card') return;

      const fromStack = liveStacks[fromEntry.stackIdx];
      const toStack = liveStacks[target.stackIdx];
      const card = fromStack.cards?.[fromEntry.cardIdx];
      if (!card || typeof fromStack.id !== 'number' || typeof toStack.id !== 'number') return;

      // No-op if dropped back into its own slot.
      if (fromStack.id === toStack.id && target.index === fromEntry.cardIdx) return;

      onMoveCard({
        card,
        fromStackId: fromStack.id,
        toStackId: toStack.id,
        toIndex: target.index,
      });
    },
    [entries, liveStacks, onMoveCard]
  );

  const onRowLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    heights.current[index] = event.nativeEvent.layout.height;
  }, []);

  // For the live marker, which card-entry should show a line above it, and
  // whether the line belongs at the end of a stack.
  const markerCardEntry = useMemo(() => {
    if (!marker) return null;
    const cardEntryIdxs: number[] = [];
    entries.forEach((entry, idx) => {
      if (entry.kind === 'card' && entry.stackIdx === marker.stackIdx && idx !== activeEntry) {
        cardEntryIdxs.push(idx);
      }
    });
    if (marker.index < cardEntryIdxs.length) {
      return { before: cardEntryIdxs[marker.index], endOfStack: null as number | null };
    }
    return { before: null as number | null, endOfStack: marker.stackIdx };
  }, [marker, entries, activeEntry]);

  const indicator = (
    <View style={{ height: 2, backgroundColor: indicatorColor, borderRadius: 1, marginVertical: 2 }} />
  );

  return (
    <View className="gap-6 pt-2">
      {liveStacks.map((stack, stackIdx) => {
        const cards = stack.cards ?? [];
        const stackId = stack.id as number;
        return (
          <View key={stackId} className="gap-2.5">
            <Header
              title={stack.title ?? 'Stack'}
              count={cards.length}
              accent={colors.text2}
              onAddCard={() => onAddCard(stackId)}
              onEdit={() => onEditStack(stack)}
              onLayout={(event) => onRowLayout(headerEntryIndex[stackIdx], event)}
            />
            {cards.length === 0 ? (
              <Pressable onPress={() => onAddCard(stackId)} onLayout={(event) => onRowLayout(headerEntryIndex[stackIdx] + 1, event)}>
                {markerCardEntry?.before == null && markerCardEntry?.endOfStack === stackIdx
                  ? indicator
                  : null}
                <View className="border-sf-separator items-center gap-1 rounded-2xl border border-dashed px-3 py-6" style={{ borderCurve: 'continuous' }}>
                  <MaterialCommunityIcons name="plus" size={18} color={colors.text3} />
                  <Text className="text-sf-text-3 text-center text-sm">Add a card</Text>
                </View>
              </Pressable>
            ) : (
              cards.map((card, cardIdx) => {
                const entryIdx = headerEntryIndex[stackIdx] + 1 + cardIdx;
                const isLast = cardIdx === cards.length - 1;
                return (
                  <Row
                    key={card.id ?? `${stackId}:${cardIdx}`}
                    index={entryIdx}
                    longPressMs={longPressMs}
                    onLayout={onRowLayout}
                    onStart={setActiveEntry}
                    onUpdate={onUpdate}
                    onCommit={commit}
                    showIndicatorAbove={markerCardEntry?.before === entryIdx}
                    showIndicatorBelow={isLast && markerCardEntry?.endOfStack === stackIdx}
                    indicator={indicator}>
                    <DeckCard card={card} onPress={() => onOpenCard(stackId, card)} />
                  </Row>
                );
              })
            )}
          </View>
        );
      })}

      <Pressable
        onPress={onAddColumn}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <View
          className="border-sf-separator flex-row items-center justify-center gap-2 rounded-2xl border border-dashed py-3.5"
          style={{ borderCurve: 'continuous' }}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.accent} />
          <Text className="text-sf-blue text-sm font-semibold">Add column</Text>
        </View>
      </Pressable>
    </View>
  );
}

function Header({
  title,
  count,
  accent,
  onAddCard,
  onEdit,
  onLayout,
}: {
  title: string;
  count: number;
  accent: string;
  onAddCard: () => void;
  onEdit: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View onLayout={onLayout} className="flex-row items-center justify-between gap-2 px-0.5 pb-1">
      <View className="flex-1 flex-row items-center gap-2">
        <Text numberOfLines={1} className="text-sf-text shrink text-lg font-semibold">
          {title}
        </Text>
        <View className="bg-sf-bg-2 min-w-6 items-center rounded-full px-2 py-0.5" style={{ borderCurve: 'continuous' }}>
          <Text className="text-sf-text-2 text-xs font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
            {count}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        <Pressable onPress={onAddCard} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
          <MaterialCommunityIcons name="plus" size={20} color={accent} />
        </Pressable>
        <Pressable onPress={onEdit} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={accent} />
        </Pressable>
      </View>
    </View>
  );
}

interface RowProps {
  index: number;
  longPressMs: number;
  onLayout: (index: number, event: LayoutChangeEvent) => void;
  onStart: (index: number) => void;
  onUpdate: (index: number, translationY: number) => void;
  onCommit: (index: number) => void;
  showIndicatorAbove: boolean;
  showIndicatorBelow: boolean;
  indicator: React.ReactNode;
  children: React.ReactNode;
}

function Row({
  index,
  longPressMs,
  onLayout,
  onStart,
  onUpdate,
  onCommit,
  showIndicatorAbove,
  showIndicatorBelow,
  indicator,
  children,
}: RowProps) {
  const dragY = useSharedValue(0);
  const active = useSharedValue(false);
  const committed = useSharedValue(false);

  const pan = Gesture.Pan()
    .activateAfterLongPress(longPressMs)
    .onStart(() => {
      active.value = true;
      committed.value = false;
      dragY.value = 0;
      runOnJS(onStart)(index);
    })
    .onUpdate((event) => {
      dragY.value = event.translationY;
      runOnJS(onUpdate)(index, event.translationY);
    })
    .onEnd(() => {
      committed.value = true;
      runOnJS(onCommit)(index);
      dragY.value = withSpring(0);
      active.value = false;
    })
    .onFinalize(() => {
      if (active.value && !committed.value) {
        runOnJS(onCommit)(index);
      }
      active.value = false;
      committed.value = false;
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: active.value ? dragY.value : 0 },
      { scale: withSpring(active.value ? 1.03 : 1) },
    ],
    zIndex: active.value ? 50 : 0,
    opacity: active.value ? 0.96 : 1,
  }));

  return (
    <View>
      {showIndicatorAbove ? indicator : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={style} onLayout={(event) => onLayout(index, event)}>
          {children}
        </Animated.View>
      </GestureDetector>
      {showIndicatorBelow ? indicator : null}
    </View>
  );
}
