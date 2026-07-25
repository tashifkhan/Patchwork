import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { View } from '@/tw';

interface DraggableColumnProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onReorder: (next: T[]) => void;
  indicatorColor: string;
  /** Long-press duration (ms) before a drag begins. */
  longPressMs?: number;
}

// Reorderable vertical list for variable-height rows. A long-press lifts the
// row so it follows the finger; sibling rows stay put and an insertion line
// marks the drop target. The new order is committed once, on release, so we
// never re-layout mid-gesture (which is what makes variable heights fragile).
export function DraggableColumn<T>({
  data,
  keyExtractor,
  renderItem,
  onReorder,
  indicatorColor,
  longPressMs = 220,
}: DraggableColumnProps<T>) {
  const heights = useRef<number[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);

  const tops = useCallback(() => {
    const result: number[] = [];
    let acc = 0;
    for (let i = 0; i < data.length; i += 1) {
      result.push(acc);
      acc += heights.current[i] ?? 0;
    }
    return result;
  }, [data.length]);

  const updateTarget = useCallback(
    (from: number, translationY: number) => {
      const t = tops();
      const center = (t[from] ?? 0) + (heights.current[from] ?? 0) / 2 + translationY;
      let target = data.length;
      for (let i = 0; i < data.length; i += 1) {
        const mid = (t[i] ?? 0) + (heights.current[i] ?? 0) / 2;
        if (center < mid) {
          target = i;
          break;
        }
      }
      setInsertAt(target);
    },
    [data.length, tops]
  );

  const commit = useCallback(
    (from: number) => {
      setActiveIndex(null);
      setInsertAt((insertion) => {
        if (insertion == null || insertion === from || insertion === from + 1) return null;
        const next = [...data];
        const [moved] = next.splice(from, 1);
        const target = insertion > from ? insertion - 1 : insertion;
        next.splice(target, 0, moved);
        onReorder(next);
        return null;
      });
    },
    [data, onReorder]
  );

  const onRowLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    heights.current[index] = event.nativeEvent.layout.height;
  }, []);

  const moveAccessibly = useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= data.length) return;
    const next = [...data];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onReorder(next);
  }, [data, onReorder]);

  return (
    <View>
      {data.map((item, index) => (
        <Row
          key={keyExtractor(item)}
          index={index}
          longPressMs={longPressMs}
          onLayout={onRowLayout}
          onStart={(i) => setActiveIndex(i)}
          onUpdate={updateTarget}
          onCommit={commit}
          onAccessibilityMove={moveAccessibly}
          showIndicatorAbove={insertAt === index && activeIndex !== index && activeIndex !== index - 1}
          indicatorColor={indicatorColor}>
          {renderItem(item)}
        </Row>
      ))}
      {insertAt === data.length && activeIndex !== data.length - 1 ? (
        <View style={{ height: 2, backgroundColor: indicatorColor, borderRadius: 1 }} />
      ) : null}
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
  onAccessibilityMove: (index: number, direction: -1 | 1) => void;
  showIndicatorAbove: boolean;
  indicatorColor: string;
  children: React.ReactNode;
}

function Row({
  index,
  longPressMs,
  onLayout,
  onStart,
  onUpdate,
  onCommit,
  onAccessibilityMove,
  showIndicatorAbove,
  indicatorColor,
  children,
}: RowProps) {
  const dragY = useSharedValue(0);
  const active = useSharedValue(false);
  const lastReportedY = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(longPressMs)
    .onStart(() => {
      active.value = true;
      dragY.value = 0;
      lastReportedY.value = 0;
      runOnJS(onStart)(index);
    })
    .onUpdate((event) => {
      dragY.value = event.translationY;
      if (Math.abs(event.translationY - lastReportedY.value) >= 8) {
        lastReportedY.value = event.translationY;
        runOnJS(onUpdate)(index, event.translationY);
      }
    })
    .onEnd(() => {
      runOnJS(onCommit)(index);
      dragY.value = withSpring(0);
      active.value = false;
    })
    .onFinalize(() => {
      active.value = false;
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: active.value ? dragY.value : 0 },
      { scale: withSpring(active.value ? 1.02 : 1) },
    ],
    zIndex: active.value ? 50 : 0,
    opacity: active.value ? 0.96 : 1,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={style}
        onLayout={(event) => onLayout(index, event)}
        accessible
        accessibilityLabel="Reorder task"
        accessibilityHint="Use the move up or move down actions"
        accessibilityActions={[
          { name: 'decrement', label: 'Move up' },
          { name: 'increment', label: 'Move down' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'decrement') onAccessibilityMove(index, -1);
          if (event.nativeEvent.actionName === 'increment') onAccessibilityMove(index, 1);
        }}>
        {showIndicatorAbove ? (
          <View
            style={{
              height: 2,
              backgroundColor: indicatorColor,
              borderRadius: 1,
              marginBottom: 2,
            }}
          />
        ) : null}
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
