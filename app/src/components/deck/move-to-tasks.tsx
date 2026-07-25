import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { ApiError } from '@/api/client';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { useCreateTask, useTaskLists, useUpdateTask } from '@/hooks/use-tasks';
import { useDeleteDeckCard } from '@/hooks/use-deck';
import { Text, View } from '@/tw';

interface MoveToTasksProps {
  boardId: number;
  stackId: number;
  cardId: number;
  title: string;
  description: string;
  duedate: string | null;
}

interface ParsedDescription {
  markdown: string;
  subtasks: { title: string; completed: boolean }[];
}

// Splits Deck checklist lines ("- [ ] item") out of the description so they
// can be recreated as real subtasks when demoting a card back to a task.
function parseDescription(description: string): ParsedDescription {
  const markdownLines: string[] = [];
  const subtasks: { title: string; completed: boolean }[] = [];
  for (const line of description.split('\n')) {
    const match = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/);
    if (match) {
      subtasks.push({ title: match[2].trim(), completed: match[1].toLowerCase() === 'x' });
    } else {
      markdownLines.push(line);
    }
  }
  return { markdown: markdownLines.join('\n').trim(), subtasks };
}

// Promotes a Deck card up into a CalDAV task (on the chosen list), recreating
// any checklist items as subtasks, then deletes the card.
export function MoveToTasks({ boardId, stackId, cardId, title, description, duedate }: MoveToTasksProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [listId, setListId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const listsQuery = useTaskLists();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteCard = useDeleteDeckCard();

  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const activeListId = listId ?? lists[0]?.id ?? null;

  async function move() {
    if (!activeListId) return;
    setBusy(true);
    try {
      const { markdown, subtasks } = parseDescription(description);
      const parent = await createTask.mutateAsync({
        list_id: activeListId,
        title,
        markdown,
        due_at: duedate,
      });
      for (const subtask of subtasks) {
        const child = await createTask.mutateAsync({
          list_id: activeListId,
          title: subtask.title,
          parent_uid: parent.uid,
        });
        if (subtask.completed && child.id) {
          await updateTask.mutateAsync({
            taskId: child.id,
            accountId: child.account_id,
            patch: { completed: true, etag: child.etag },
          });
        }
      }
      await deleteCard.mutateAsync({ board_id: boardId, stack_id: stackId, card_id: cardId });
      router.back();
    } catch (error) {
      setBusy(false);
      setErrorMessage(error instanceof ApiError ? error.message : 'Please try again.');
    }
  }

  return (
    <View className="gap-2 px-4 pb-8">
      <View className="flex-row items-center gap-1.5 px-1">
        <MaterialCommunityIcons name="format-list-checks" size={14} color={colors.text2} />
        <Text className="text-sf-text-2 text-xs font-semibold uppercase">Promote to Tasks</Text>
      </View>

      <View className="bg-sf-bg-2 rounded-xl" style={{ borderCurve: 'continuous' }}>
        <Pressable
          onPress={() => setOpen((prev) => !prev)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View className="flex-row items-center justify-between px-3 py-3">
            <View className="flex-row items-center gap-3">
              <MaterialCommunityIcons name="arrow-up-bold-box-outline" size={20} color={colors.accent} />
              <Text className="text-sf-text text-base">Promote to a task</Text>
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
            {listsQuery.isLoading ? (
              <Text className="text-sf-text-2 text-sm">Loading lists…</Text>
            ) : lists.length === 0 ? (
              <Text className="text-sf-text-2 text-sm">No task lists available.</Text>
            ) : (
              <>
                <View className="gap-2">
                  <Text className="text-sf-text-2 px-1 text-xs">List</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {lists.map((list) => {
                      const selected = list.id === activeListId;
                      return (
                        <Pressable
                          key={list.id}
                          onPress={() => setListId(list.id)}
                          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                          <View
                            className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-3'}`}
                            style={{ borderCurve: 'continuous' }}>
                            <Text className={`text-sm ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>
                              {list.name}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Pressable
                  onPress={move}
                  disabled={!activeListId || busy}
                  style={({ pressed }) => ({ opacity: !activeListId || busy ? 0.4 : pressed ? 0.8 : 1 })}>
                  <View
                    className="bg-sf-blue items-center rounded-xl py-3"
                    style={{ borderCurve: 'continuous' }}>
                    <Text className="text-sf-on-accent text-base font-semibold">
                      {busy ? 'Moving…' : 'Promote to Tasks'}
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
        title="Could not move to Tasks"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </View>
  );
}
