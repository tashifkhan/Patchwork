import { router } from 'expo-router';
import { useState } from 'react';

import { ApiError } from '@/api/client';
import { DetailRow } from '@/components/boards/item-editor';
import { PickerSheet } from '@/components/boards/picker-sheet';
import { NativeAlert } from '@/components/ui/native-alert';
import { useCreateTask, useTaskLists, useUpdateTask } from '@/hooks/use-tasks';
import { useDeleteDeckCard } from '@/hooks/use-deck';

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

// A details row that moves a Deck card into a CalDAV task on the chosen list,
// recreating any checklist items as subtasks, then deletes the card.
export function MoveToTasks({ boardId, stackId, cardId, title, description, duedate }: MoveToTasksProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const listsQuery = useTaskLists();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteCard = useDeleteDeckCard();

  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  async function move(listId: string) {
    setBusy(true);
    try {
      const { markdown, subtasks } = parseDescription(description);
      const parent = await createTask.mutateAsync({
        list_id: listId,
        title,
        markdown,
        due_at: duedate,
      });
      for (const subtask of subtasks) {
        const child = await createTask.mutateAsync({
          list_id: listId,
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
    <>
      <DetailRow
        icon="arrow-up-bold-box-outline"
        label="Move to Tasks"
        value={busy ? 'Moving…' : undefined}
        loading={busy}
        onPress={() => setOpen(true)}
      />
      <PickerSheet
        visible={open}
        title="Move to Tasks"
        subtitle="Becomes a to-do in this list. Checklist lines become subtasks, and the card is deleted."
        items={
          listsQuery.isLoading
            ? [{ key: 'loading', label: 'Loading lists…', icon: 'progress-clock', onPress: () => {} }]
            : lists.length === 0
              ? [{ key: 'none', label: 'No task lists available', icon: 'alert-circle-outline', onPress: () => setOpen(false) }]
              : lists.map((list) => ({
                  key: list.id,
                  label: list.name,
                  subtitle: list.account_name,
                  icon: 'format-list-bulleted' as const,
                  onPress: () => {
                    setOpen(false);
                    void move(list.id);
                  },
                }))
        }
        onClose={() => setOpen(false)}
      />
      <NativeAlert
        visible={errorMessage != null}
        title="Could not move to Tasks"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </>
  );
}
