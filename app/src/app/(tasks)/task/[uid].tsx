import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

import { ApiError } from '@/api/client';
import type { Task } from '@/api/types';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { TaskForm, type TaskFormValues } from '@/components/tasks/task-form';
import { useDeleteTask, useTaskLists, useTasks, useUpdateTask } from '@/hooks/use-tasks';
import { scheduleTaskReminder } from '@/lib/notifications';
import { ScrollView, Text, View } from '@/tw';

function findByUid(tasks: Task[], uid: string): Task | null {
  for (const task of tasks) {
    if (task.uid === uid) return task;
    const child = findByUid(task.children, uid);
    if (child) return child;
  }
  return null;
}

function notImplemented(error: unknown) {
  return error instanceof ApiError && error.isNotImplemented;
}

export default function TaskDetailScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const task = uid ? findByUid(tasksQuery.data ?? [], decodeURIComponent(uid)) : null;
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  if (!task) {
    return (
      <View className="bg-sf-bg flex-1 items-center justify-center px-8">
        <Text className="text-sf-text-2 text-center">
          {tasksQuery.isLoading ? 'Loading…' : 'Task not found.'}
        </Text>
      </View>
    );
  }

  async function handleSubmit(values: TaskFormValues) {
    if (!task) return;
    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        patch: {
          title: values.title,
          markdown: values.markdown,
          tags: values.tags,
          due_at: values.due_at,
          reminder_at: values.reminder_at,
          priority: values.priority,
          parent_uid: task.parent_uid,
          etag: task.etag,
        },
      });
      if (values.reminder_at) {
        await scheduleTaskReminder({
          taskUid: task.uid,
          title: values.title,
          reminderAt: values.reminder_at,
        });
      }
      router.back();
    } catch (error) {
      Alert.alert(
        notImplemented(error) ? 'Not available yet' : 'Update failed',
        notImplemented(error)
          ? 'The server does not support editing tasks yet.'
          : error instanceof ApiError
            ? error.message
            : 'Could not update the task.'
      );
    }
  }

  function handleDelete() {
    if (!task) return;
    Alert.alert('Delete task', `Delete “${task.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask.mutateAsync(task.id);
            router.back();
          } catch (error) {
            Alert.alert(
              notImplemented(error) ? 'Not available yet' : 'Delete failed',
              notImplemented(error)
                ? 'The server does not support deleting tasks yet.'
                : 'Could not delete the task.'
            );
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive">
      <Stack.Screen options={{ title: task.list_name }} />

      {task.markdown.trim() ? (
        <View className="border-sf-separator gap-2 border-b px-4 py-3">
          <Text className="text-sf-text-2 text-xs font-semibold uppercase">Preview</Text>
          <MarkdownViewer markdown={task.markdown} />
        </View>
      ) : null}

      <TaskForm
        initial={{
          title: task.title,
          markdown: task.markdown,
          list_id: task.list_id,
          tags: task.tags,
          due_at: task.due_at,
          reminder_at: task.reminder_at,
          priority: task.priority,
        }}
        lists={lists.length > 0 ? lists : [{ id: task.list_id, href: '', name: task.list_name, is_deck: false }]}
        submitting={updateTask.isPending}
        submitLabel={updateTask.isPending ? 'Saving…' : 'Save Changes'}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </ScrollView>
  );
}
