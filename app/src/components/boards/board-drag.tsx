import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { FlatList, ScrollView, View as RNView } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { BoardCard } from '@/components/boards/board-card';
import type { BoardCardItem, BoardColumnItem } from '@/features/boards/model';
import { haptics } from '@/lib/haptics';

/** Where a dragged card would land: an index among the column's other cards. */
export interface DropTarget {
  columnId: string;
  index: number;
}

export interface DragDrop {
  card: BoardCardItem;
  fromColumnId: string;
  toColumnId: string;
  /** Index in the target column's visible cards, with the dragged card left out. */
  index: number;
}

interface ColumnGeometry {
  scroll: ScrollView | null;
  scrollY: number;
  viewportHeight: number;
  contentHeight: number;
  /** Card frames inside the column's scroll content. */
  cards: Map<string, { y: number; height: number }>;
  /** Scroll view frame in window coordinates, measured when a drag starts. */
  frame: { x: number; y: number; width: number; height: number } | null;
}

/** What a column needs to take part in dragging. */
export interface ColumnDragHandle {
  setScrollRef: (scroll: ScrollView | null) => void;
  onScroll: (y: number) => void;
  onViewport: (height: number) => void;
  onContentHeight: (height: number) => void;
  onCardLayout: (cardId: string, y: number, height: number) => void;
}

/** Edge zone (dp) that scrolls the board or a column while dragging. */
const EDGE = 56;
const MAX_SPEED = 18;
/** Below this much travel a long-press counts as "hold", not a drag. */
const HOLD_SLOP = 12;

/**
 * Drag cards within and between board columns, like Jira and Trello.
 *
 * Long-press lifts the card into a floating copy that follows the finger on
 * the UI thread. Hit-testing runs on the JS thread from layouts the columns
 * report, and an accent line in the target column marks the drop slot.
 * Dragging near the board's left or right edge scrolls the board; near a
 * column's top or bottom edge scrolls that column. A long-press that never
 * moves calls `onHold`, which keeps the old "Move to" sheet reachable.
 */
export function useBoardDrag({
  containerRef,
  boardRef,
  columns,
  columnWidth,
  imageHeaders,
  snapInterval,
  onDrop,
  onHold,
}: {
  /** The view the floating card is drawn in; it should wrap the board. */
  containerRef: RefObject<RNView | null>;
  boardRef: RefObject<FlatList<BoardColumnItem> | null>;
  /** Columns as shown (filters applied), in order. */
  columns: BoardColumnItem[];
  columnWidth: number;
  imageHeaders?: Record<string, string>;
  /** Phones snap column by column; pass the interval to re-snap after a drag. */
  snapInterval?: number;
  onDrop: (drop: DragDrop) => void;
  onHold: (card: BoardCardItem, column: BoardColumnItem) => void;
}) {
  const geometry = useRef(new Map<string, ColumnGeometry>());
  const board = useRef({
    scrollX: 0,
    contentWidth: 0,
    width: 0,
    startScrollX: 0,
  });
  const container = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const pointer = useRef({ x: 0, y: 0, startX: 0, startY: 0, moved: false });
  const frameLoop = useRef<number | null>(null);

  const [dragging, setDragging] = useState<{
    card: BoardCardItem;
    columnId: string;
  } | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const draggingRef = useRef(dragging);
  const targetRef = useRef(target);

  // Latest props for the stable callbacks the gestures hold on to.
  const latest = useRef({ columns, onDrop, onHold, snapInterval });
  useEffect(() => {
    latest.current = { columns, onDrop, onHold, snapInterval };
  });

  // Shared with the floating copy: finger position, grab point and origin.
  const fingerX = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const started = useSharedValue(false);
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);

  const geometryFor = useCallback((columnId: string): ColumnGeometry => {
    let entry = geometry.current.get(columnId);
    if (!entry) {
      entry = {
        scroll: null,
        scrollY: 0,
        viewportHeight: 0,
        contentHeight: 0,
        cards: new Map(),
        frame: null,
      };
      geometry.current.set(columnId, entry);
    }
    return entry;
  }, []);

  /** Column frame now, accounting for board scroll since the drag began. */
  const liveFrame = useCallback((entry: ColumnGeometry) => {
    if (!entry.frame) return null;
    const shift = board.current.scrollX - board.current.startScrollX;
    return { ...entry.frame, x: entry.frame.x - shift };
  }, []);

  const hitTest = useCallback(() => {
    const active = draggingRef.current;
    if (!active) return;
    const { x, y } = pointer.current;
    let best: {
      id: string;
      entry: ColumnGeometry;
      frame: NonNullable<ReturnType<typeof liveFrame>>;
    } | null = null;
    let bestDistance = Infinity;
    for (const column of latest.current.columns) {
      const entry = geometry.current.get(column.id);
      const frame = entry ? liveFrame(entry) : null;
      if (!entry || !frame) continue;
      // Distance from the finger to the column's horizontal span; 0 inside it.
      const distance = x < frame.x ? frame.x - x : x > frame.x + frame.width ? x - frame.x - frame.width : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { id: column.id, entry, frame };
      }
    }
    if (!best) return;

    const column = latest.current.columns.find((candidate) => candidate.id === best.id);
    const others = (column?.cards ?? []).filter((card) => card.id !== active.card.id);
    const contentY = y - best.frame.y + best.entry.scrollY;
    let index = others.length;
    for (let i = 0; i < others.length; i += 1) {
      const layout = best.entry.cards.get(others[i].id);
      if (layout && contentY < layout.y + layout.height / 2) {
        index = i;
        break;
      }
    }

    const previous = targetRef.current;
    if (previous?.columnId === best.id && previous.index === index) return;
    if (previous && previous.columnId !== best.id) haptics.selection();
    const next = { columnId: best.id, index };
    targetRef.current = next;
    setTarget(next);
  }, [liveFrame]);

  /** One frame of a drag: scroll the board and the column under the finger. */
  const autoScroll = useCallback(() => {
    const { x, y } = pointer.current;
    const box = container.current;
    let changed = false;

    const left = x - box.x;
    const right = box.x + box.width - x;
    const maxX = Math.max(0, board.current.contentWidth - board.current.width);
    let dx = 0;
    if (left < EDGE) dx = -MAX_SPEED * (1 - Math.max(0, left) / EDGE);
    else if (right < EDGE) dx = MAX_SPEED * (1 - Math.max(0, right) / EDGE);
    if (dx !== 0) {
      const nextX = Math.min(maxX, Math.max(0, board.current.scrollX + dx));
      if (nextX !== board.current.scrollX) {
        board.current.scrollX = nextX;
        boardRef.current?.scrollToOffset({ offset: nextX, animated: false });
        changed = true;
      }
    }

    const over = targetRef.current ? geometry.current.get(targetRef.current.columnId) : undefined;
    const frame = over ? liveFrame(over) : null;
    if (over?.scroll && frame) {
      const top = y - frame.y;
      const bottom = frame.y + frame.height - y;
      const maxY = Math.max(0, over.contentHeight - over.viewportHeight);
      let dy = 0;
      if (top < EDGE) dy = -MAX_SPEED * (1 - Math.max(0, top) / EDGE);
      else if (bottom < EDGE) dy = MAX_SPEED * (1 - Math.max(0, bottom) / EDGE);
      if (dy !== 0) {
        const nextY = Math.min(maxY, Math.max(0, over.scrollY + dy));
        if (nextY !== over.scrollY) {
          over.scrollY = nextY;
          over.scroll.scrollTo({ y: nextY, animated: false });
          changed = true;
        }
      }
    }

    if (changed) hitTest();
  }, [boardRef, hitTest, liveFrame]);

  const begin = useCallback(
    (cardId: string, columnId: string, x: number, y: number) => {
      const column = latest.current.columns.find((candidate) => candidate.id === columnId);
      const card = column?.cards.find((candidate) => candidate.id === cardId);
      if (!column || !card) return;
      haptics.impact('heavy');
      pointer.current = { x, y, startX: x, startY: y, moved: false };
      board.current.startScrollX = board.current.scrollX;
      const active = { card, columnId };
      draggingRef.current = active;
      targetRef.current = null;
      setDragging(active);

      containerRef.current?.measureInWindow((cx, cy, width, height) => {
        container.current = { x: cx, y: cy, width, height };
        originX.set(cx);
        originY.set(cy);
        lifted.set(withSpring(1, { damping: 18, stiffness: 260 }));
      });
      for (const entry of geometry.current.values()) {
        entry.frame = null;
        entry.scroll?.measureInWindow?.((fx: number, fy: number, width: number, height: number) => {
          // Measured at the current board scroll, which is the drag's start.
          entry.frame = { x: fx, y: fy, width, height };
          hitTest();
        });
      }
      const loop = () => {
        if (!draggingRef.current) return;
        autoScroll();
        frameLoop.current = requestAnimationFrame(loop);
      };
      if (frameLoop.current != null) cancelAnimationFrame(frameLoop.current);
      frameLoop.current = requestAnimationFrame(loop);
    },
    [autoScroll, containerRef, hitTest, lifted, originX, originY]
  );

  const move = useCallback(
    (x: number, y: number) => {
      const p = pointer.current;
      p.x = x;
      p.y = y;
      if (!p.moved && Math.hypot(x - p.startX, y - p.startY) > HOLD_SLOP) p.moved = true;
      hitTest();
    },
    [hitTest]
  );

  const end = useCallback(
    (completed: boolean) => {
      const active = draggingRef.current;
      const drop = targetRef.current;
      const moved = pointer.current.moved;
      if (frameLoop.current != null) cancelAnimationFrame(frameLoop.current);
      frameLoop.current = null;
      draggingRef.current = null;
      targetRef.current = null;
      setDragging(null);
      setTarget(null);
      lifted.set(0);

      // Phones page column by column; land on a whole column again.
      const interval = latest.current.snapInterval;
      if (interval && board.current.scrollX !== board.current.startScrollX) {
        const snapped = Math.round(board.current.scrollX / interval) * interval;
        boardRef.current?.scrollToOffset({ offset: snapped, animated: true });
      }

      if (!active || !completed) return;
      const column = latest.current.columns.find((candidate) => candidate.id === active.columnId);
      if (!moved) {
        if (column) latest.current.onHold(active.card, column);
        return;
      }
      if (!drop) return;
      if (drop.columnId === active.columnId) {
        const from = column?.cards.findIndex((candidate) => candidate.id === active.card.id) ?? -1;
        if (from === drop.index) return;
      }
      latest.current.onDrop({
        card: active.card,
        fromColumnId: active.columnId,
        toColumnId: drop.columnId,
        index: drop.index,
      });
    },
    [boardRef, lifted]
  );

  useEffect(
    () => () => {
      if (frameLoop.current != null) cancelAnimationFrame(frameLoop.current);
    },
    []
  );

  /** Long-press pan for one card. Stable per card and column. */
  const cardGesture = useCallback(
    (cardId: string, columnId: string) =>
      Gesture.Pan()
        .activateAfterLongPress(280)
        .maxPointers(1)
        .onStart((event) => {
          started.value = true;
          fingerX.value = event.absoluteX;
          fingerY.value = event.absoluteY;
          lastX.value = event.absoluteX;
          lastY.value = event.absoluteY;
          grabX.value = event.x;
          grabY.value = event.y;
          runOnJS(begin)(cardId, columnId, event.absoluteX, event.absoluteY);
        })
        .onUpdate((event) => {
          fingerX.value = event.absoluteX;
          fingerY.value = event.absoluteY;
          if (Math.abs(event.absoluteX - lastX.value) + Math.abs(event.absoluteY - lastY.value) >= 4) {
            lastX.value = event.absoluteX;
            lastY.value = event.absoluteY;
            runOnJS(move)(event.absoluteX, event.absoluteY);
          }
        })
        .onEnd(() => {
          if (!started.value) return;
          started.value = false;
          runOnJS(end)(true);
        })
        .onFinalize(() => {
          if (!started.value) return;
          started.value = false;
          runOnJS(end)(false);
        }),
    [begin, end, fingerX, fingerY, grabX, grabY, lastX, lastY, move, started]
  );

  const columnHandle = useCallback(
    (columnId: string): ColumnDragHandle => {
      const entry = geometryFor(columnId);
      return {
        setScrollRef: (scroll) => {
          entry.scroll = scroll;
        },
        onScroll: (y) => {
          entry.scrollY = y;
        },
        onViewport: (height) => {
          entry.viewportHeight = height;
        },
        onContentHeight: (height) => {
          entry.contentHeight = height;
        },
        onCardLayout: (cardId, y, height) => {
          entry.cards.set(cardId, { y, height });
        },
      };
    },
    [geometryFor]
  );

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: lifted.value > 0 ? 1 : 0,
    transform: [
      { translateX: fingerX.value - originX.value - grabX.value },
      { translateY: fingerY.value - originY.value - grabY.value },
      { scale: 1 + 0.04 * lifted.value },
      { rotate: `${2.5 * lifted.value}deg` },
    ],
  }));

  const draggedCard = dragging?.card;
  const overlay = useMemo(
    () =>
      draggedCard ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              width: columnWidth - 24,
              zIndex: 100,
              elevation: 12,
              shadowColor: '#000',
              shadowOpacity: 0.28,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              borderRadius: 18,
            },
            ghostStyle,
          ]}>
          <BoardCard card={draggedCard} imageHeaders={imageHeaders} onPress={() => {}} />
        </Animated.View>
      ) : null,
    [columnWidth, draggedCard, ghostStyle, imageHeaders]
  );

  return useMemo(
    () => ({
      /** Feed the board list's scroll, size and content width in here. */
      board: {
        onScroll: (x: number) => {
          board.current.scrollX = x;
        },
        onLayout: (width: number) => {
          board.current.width = width;
        },
        onContentWidth: (width: number) => {
          board.current.contentWidth = width;
        },
      },
      dragging,
      target,
      cardGesture,
      columnHandle,
      overlay,
    }),
    [cardGesture, columnHandle, dragging, overlay, target]
  );
}

export type BoardDrag = ReturnType<typeof useBoardDrag>;
