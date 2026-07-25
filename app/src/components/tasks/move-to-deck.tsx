import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { ApiError } from '@/api/client';
import type { Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { useCreateDeckCard, useDeckBoard, useDeckBoards } from '@/hooks/use-deck';
import { useDeleteTask } from '@/hooks/use-tasks';
import { Text, View } from '@/tw';

// Demotes a CalDAV task down into a Deck card: creates the card on the chosen
// board/stack, then deletes the original task. Subtasks travel along as
// description bullets since Deck cards have no native child cards.
export function MoveToDeck({ task }: { task: Task }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [stackId, setStackId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const boardsQuery = useDeckBoards();
  const boards = boardsQuery.data ?? [];
  const activeBoardId = boardId ?? boards[0]?.id ?? null;
  const boardQuery = useDeckBoard(activeBoardId);
  const createCard = useCreateDeckCard();
  const deleteTask = useDeleteTask();

  const stacks = (boardQuery.data?.stacks ?? []).filter((s) => typeof s.id === 'number');
  const activeStackId = stackId ?? stacks[0]?.id ?? null;

  function buildDescription(): string {
    const base = task.markdown.trim();
    if (task.children.length === 0) return base;
    const checklist = task.children
      .map((child) => `- [${child.completed ? 'x' : ' '}] ${child.title}`)
      .join('\n');
    return base ? `${base}\n\n${checklist}` : checklist;
  }

  async function move() {
    if (activeBoardId == null || activeStackId == null) return;
    setBusy(true);
    try {
      await createCard.mutateAsync({
        board_id: activeBoardId,
        stack_id: activeStackId,
        title: task.title,
        description: buildDescription(),
        duedate: task.due_at,
      });
      await deleteTask.mutateAsync({
        taskId: task.id,
        accountId: task.account_id,
        etag: task.etag,
      });
      router.back();
    } catch (error) {
      setBusy(false);
      setErrorMessage(error instanceof ApiError ? error.message : 'Please try again.');
    }
  }

  return (
    <View className="gap-2 px-4 pb-4">
      <View className="flex-row items-center gap-1.5 px-1">
        <MaterialCommunityIcons name="rectangle-outline" size={14} color={colors.text2} />
        <Text className="text-sf-text-2 text-xs font-semibold uppercase">Demote to Deck</Text>
      </View>

      <View className="bg-sf-bg-2 rounded-xl" style={{ borderCurve: 'continuous' }}>
        <Pressable
          onPress={() => setOpen((prev) => !prev)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View className="flex-row items-center justify-between px-3 py-3">
            <View className="flex-row items-center gap-3">
              <MaterialCommunityIcons name="arrow-down-bold-box-outline" size={20} color={colors.accent} />
              <Text className="text-sf-text text-base">Demote to a Deck card</Text>
            </View>
            <MaterialCommunityIcons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.text2}
            />
          </View>
        </Pressable>

        {open ? (
          <View className="border-sf-separator gap-3 border-t px-3 py-3">
            {boardsQuery.isLoading ? (
              <Text className="text-sf-text-2 text-sm">Loading boards…</Text>
            ) : boards.length === 0 ? (
              <Text className="text-sf-text-2 text-sm">No Deck boards available.</Text>
            ) : (
              <>
                <ChipGroup
                  label="Board"
                  items={boards.map((b) => ({ id: b.id, name: b.title }))}
                  selectedId={activeBoardId}
                  onSelect={(id) => {
                    setBoardId(id);
                    setStackId(null);
                  }}
                />
                {activeBoardId != null ? (
                  boardQuery.isLoading ? (
                    <Text className="text-sf-text-2 text-sm">Loading stacks…</Text>
                  ) : (
                    <ChipGroup
                      label="Stack"
                      items={stacks.map((s) => ({ id: s.id as number, name: s.title ?? 'Stack' }))}
                      selectedId={activeStackId}
                      onSelect={setStackId}
                    />
                  )
                ) : null}

                <Pressable
                  onPress={move}
                  disabled={activeBoardId == null || activeStackId == null || busy}
                  style={({ pressed }) => ({
                    opacity: activeBoardId == null || activeStackId == null || busy ? 0.4 : pressed ? 0.8 : 1,
                  })}>
                  <View
                    className="bg-sf-blue items-center rounded-xl py-3"
                    style={{ borderCurve: 'continuous' }}>
                    <Text className="text-sf-on-accent text-base font-semibold">
                      {busy ? 'Moving…' : 'Demote to Deck'}
                    </Text>
                  </View>
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </View>

      <NativeAlert
        visible={errorMessage != null}
        title="Could not move to Deck"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </View>
  );
}

function ChipGroup({
  label,
  items,
  selectedId,
  onSelect,
}: {
  label: string;
  items: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sf-text-2 px-1 text-xs">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View
                className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-3'}`}
                style={{ borderCurve: 'continuous' }}>
                <Text className={`text-sm ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>
                  {item.name}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {items.length === 0 ? <Text className="text-sf-text-3 text-sm">None</Text> : null}
      </View>
    </View>
  );
}
