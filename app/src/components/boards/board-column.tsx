import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, RefreshControl } from 'react-native';
import { GestureDetector, LegacyScrollView } from 'react-native-gesture-handler';

import type { BoardCardItem, BoardColumnItem, CardSprint } from '@/features/boards/model';
import { BoardCard } from '@/components/boards/board-card';
import type { BoardDrag } from '@/components/boards/board-drag';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { Text, TextInput, View } from '@/tw';

/**
 * One board column, Jira-app style: a rounded surface with an uppercase
 * "TO DO  8" header, its cards scrolling inside, and an inline Create row
 * pinned to the bottom.
 *
 * With `drag`, long-press lifts a card so it can be dropped anywhere on the
 * board. The column reports its scroll and card layouts for hit-testing and
 * draws the drop line when it is the target.
 */
export function BoardColumn({
  column,
  sprintGroups = false,
  width,
  imageHeaders,
  refreshing,
  canCreate,
  emptyLabel = 'Nothing here',
  bottomInset,
  onRefresh,
  onOpenCard,
  onMoveCard,
  onCreate,
  onCreateDetailed,
  onMenu,
  drag,
}: {
  column: BoardColumnItem;
  /** Cards span several sprints: start each sprint with a dashed divider. */
  sprintGroups?: boolean;
  width: number;
  imageHeaders?: Record<string, string>;
  refreshing: boolean;
  canCreate: boolean;
  emptyLabel?: string;
  bottomInset: number;
  onRefresh: () => void;
  onOpenCard: (card: BoardCardItem) => void;
  onMoveCard: (card: BoardCardItem) => void;
  onCreate: (title: string) => Promise<void>;
  /** Open the full create form for this column (type, description, due date…). */
  onCreateDetailed?: () => void;
  onMenu?: () => void;
  drag?: BoardDrag;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const columnHandle = drag?.columnHandle;
  const handle = useMemo(() => columnHandle?.(column.id), [columnHandle, column.id]);
  const draggedId = drag?.dragging?.card.id;
  const isDragging = drag?.dragging != null;
  const dropIndex = drag?.target?.columnId === column.id ? drag.target.index : null;
  const isTarget = dropIndex != null && drag?.dragging?.columnId !== column.id;
  const [cardFrames, setCardFrames] = useState<Record<string, { y: number; height: number }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const title = draft?.trim();
    if (!title) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate(title);
      haptics.success();
      // Stay in the field so several cards can be added in a row.
      setDraft('');
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : 'Could not create the card.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View
      style={{
        width,
        flex: 1,
        marginBottom: bottomInset,
        borderRadius: 28,
        borderCurve: 'continuous',
        backgroundColor: colors.bg2,
        overflow: 'hidden',
      }}>
      <View className="flex-row items-center" style={{ paddingLeft: 20, paddingRight: 8, height: 56 }}>
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', letterSpacing: 0.8, color: colors.text2 }}>
          {column.title.toUpperCase()}
        </Text>
        <Text
          style={{
            marginLeft: 10,
            fontSize: 14,
            fontWeight: '600',
            color: colors.text3,
            fontVariant: ['tabular-nums'],
          }}>
          {column.cards.length}
        </Text>
        <View style={{ flex: 1 }} />
        {onMenu ? (
          <Pressable
            onPress={onMenu}
            accessibilityRole="button"
            accessibilityLabel={`${column.title} options`}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.bg3 : 'transparent',
            })}>
            <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      <LegacyScrollView
        ref={handle?.setScrollRef}
        style={{ flex: 1 }}
        scrollEnabled={!isDragging}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => handle?.onScroll(event.nativeEvent.contentOffset.y)}
        onLayout={(event) => handle?.onViewport(event.nativeEvent.layout.height)}
        onContentSizeChange={(_w, height) => handle?.onContentHeight(height)}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bg3}
          />
        }>
        {column.cards.map((card, index) => [
          sprintGroups && card.sprint && card.sprint.key !== column.cards[index - 1]?.sprint?.key ? (
            <SprintDivider key={`sprint-${card.sprint.key}`} sprint={card.sprint} first={index === 0} />
          ) : null,
          drag ? (
            <DraggableCard
              key={card.id}
              card={card}
              columnId={column.id}
              drag={drag}
              lifted={card.id === draggedId}
              imageHeaders={imageHeaders}
              onOpen={onOpenCard}
              onLayout={(y, height) => {
                handle?.onCardLayout(card.id, y, height);
                setCardFrames((current) =>
                  current[card.id]?.y === y && current[card.id]?.height === height
                    ? current
                    : { ...current, [card.id]: { y, height } }
                );
              }}
            />
          ) : (
            <BoardCard
              key={card.id}
              card={card}
              imageHeaders={imageHeaders}
              onPress={() => onOpenCard(card)}
              onLongPress={() => {
                haptics.impact('medium');
                onMoveCard(card);
              }}
            />
          ),
        ])}
        {dropIndex != null ? (
          <DropLine
            color={colors.accent}
            top={dropLineTop(column.cards.filter((card) => card.id !== draggedId), dropIndex, cardFrames)}
          />
        ) : null}
        {column.cards.length === 0 && draft == null ? (
          <Text style={{ fontSize: 14, color: colors.text3, textAlign: 'center', paddingVertical: 24 }}>
            {emptyLabel}
          </Text>
        ) : null}
        {draft != null ? (
          <View style={{ borderRadius: 18, backgroundColor: colors.bg, padding: 14, gap: 8 }}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              onBlur={() => {
                if (!draft.trim() && !saving) setDraft(null);
              }}
              placeholder="What needs to be done?"
              placeholderTextColor={colors.text3}
              returnKeyType="done"
              submitBehavior="submit"
              editable={!saving}
              style={{ fontSize: 16, color: colors.text, paddingVertical: 4 }}
            />
            {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
            <View className="flex-row items-center justify-end" style={{ gap: 8 }}>
              {onCreateDetailed ? (
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setDraft(null);
                    setError(null);
                    onCreateDetailed();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="More details"
                  style={{ marginRight: 'auto', paddingHorizontal: 6, height: 36, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>More details</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setDraft(null);
                  setError(null);
                }}
                accessibilityRole="button"
                style={{ paddingHorizontal: 14, height: 36, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text2 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={saving || !draft.trim()}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  height: 36,
                  borderRadius: pressed ? 10 : 18,
                  justifyContent: 'center',
                  backgroundColor: colors.accent,
                  opacity: saving || !draft.trim() ? 0.45 : 1,
                })}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onAccent }}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </LegacyScrollView>

      {canCreate && draft == null ? (
        <Pressable
          onPress={() => {
            haptics.tap();
            setError(null);
            setDraft('');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Create in ${column.title}`}
          android_ripple={{ color: colors.separator }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 20 }}>
          <MaterialCommunityIcons name="plus" size={24} color={colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.accent }}>Create</Text>
        </Pressable>
      ) : null}
      {isTarget ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 28,
            borderCurve: 'continuous',
            borderWidth: 2,
            borderColor: colors.accent,
          }}
        />
      ) : null}
    </View>
  );
}

/** A dashed rule with the sprint's name: where one sprint's cards begin. */
function SprintDivider({ sprint, first }: { sprint: CardSprint; first: boolean }) {
  const { colors } = useTheme();
  const tint = sprint.state === 'active' ? colors.accent : colors.text3;
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel={sprint.state === 'backlog' ? 'Backlog' : `Sprint ${sprint.label}`}
      className="flex-row items-center"
      style={{ gap: 8, marginTop: first ? 0 : 6, paddingHorizontal: 4 }}>
      <MaterialCommunityIcons
        name={sprint.state === 'backlog' ? 'tray-full' : sprint.state === 'closed' ? 'flag-checkered' : 'run-fast'}
        size={14}
        color={tint}
      />
      <Text
        numberOfLines={1}
        style={{ flexShrink: 1, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, color: tint }}>
        {sprint.label}
      </Text>
      {/* A zero-height box with an even dashed border: one dashed rule. Android
          only draws dashes when every side has the same width. */}
      <View
        style={{ flex: 1, height: 0, borderWidth: 0.75, borderStyle: 'dashed', borderColor: colors.text3, opacity: 0.7 }}
      />
    </View>
  );
}

/** Content y of the drop line: midway into the gap above slot `index`. */
function dropLineTop(
  others: BoardCardItem[],
  index: number,
  frames: Record<string, { y: number; height: number }>
): number {
  const before = others[index] ? frames[others[index].id] : undefined;
  if (before) return before.y - 6.5;
  const last = others.length ? frames[others[others.length - 1].id] : undefined;
  if (last) return last.y + last.height + 3.5;
  return 4;
}

function DropLine({ top, color }: { top: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 12, right: 12, top, height: 3, borderRadius: 2, backgroundColor: color }}
    />
  );
}

const DraggableCard = memo(function DraggableCard({
  card,
  columnId,
  drag,
  lifted,
  imageHeaders,
  onOpen,
  onLayout,
}: {
  card: BoardCardItem;
  columnId: string;
  drag: BoardDrag;
  /** This card is the one being dragged; its slot stays as a faded ghost. */
  lifted: boolean;
  imageHeaders?: Record<string, string>;
  onOpen: (card: BoardCardItem) => void;
  onLayout: (y: number, height: number) => void;
}) {
  const { cardGesture } = drag;
  const gesture = useMemo(() => cardGesture(card.id, columnId), [cardGesture, card.id, columnId]);
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        onLayout={(event) => onLayout(event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
        style={{ opacity: lifted ? 0.3 : 1 }}>
        <BoardCard card={card} imageHeaders={imageHeaders} onPress={() => onOpen(card)} />
      </View>
    </GestureDetector>
  );
});
