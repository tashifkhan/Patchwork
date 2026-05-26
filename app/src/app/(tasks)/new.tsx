import { router } from 'expo-router';
import { Alert } from 'react-native';

import { ApiError } from '@/api/client';
import { TaskForm, type TaskFormValues } from '@/components/tasks/task-form';
import { useCreateTask, useTaskLists } from '@/hooks/use-tasks';
import { scheduleTaskReminder } from '@/lib/notifications';
import { ScrollView, Text, View } from '@/tw';

export default function NewTaskScreen() {
  const listsQuery = useTaskLists();
  const createTask = useCreateTask();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  async function handleSubmit(values: TaskFormValues) {
    try {
      const created = await createTask.mutateAsync({
        list_id: values.list_id,
        title: values.title,
        markdown: values.markdown,
        tags: values.tags,
        due_at: values.due_at,
        reminder_at: values.reminder_at,
        priority: values.priority,
      });
      if (created.reminder_at) {
        await scheduleTaskReminder({
          taskUid: created.uid,
          title: created.title,
          reminderAt: created.reminder_at,
        });
      }
      router.back();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not create the task.';
      Alert.alert('Create failed', message);
    }
  }

  if (lists.length === 0) {
    return (
      <View className="bg-sf-bg flex-1 items-center justify-center px-8">
        <Text className="text-sf-text-2 text-center">
          {listsQuery.isLoading ? 'Loading lists…' : 'No task lists available. Check Settings.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive">
      <TaskForm
        lists={lists}
        submitting={createTask.isPending}
        submitLabel={createTask.isPending ? 'Creating…' : 'Create Task'}
        onSubmit={handleSubmit}
      />
    </ScrollView>
  );
}
