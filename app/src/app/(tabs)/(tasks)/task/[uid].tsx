import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable } from 'react-native';

import { ApiError } from '@/api/client';
import type { Task } from '@/api/types';
import { useFocusStore } from '@/stores/focus-store';
import { endFocus, pauseFocus, resumeFocus, startFocus } from '@/widgets/focus';
import { useTheme } from '@/components/theme/context';
import { MoveToDeck } from '@/components/tasks/move-to-deck';
import { TaskForm, type TaskFormValues } from '@/components/tasks/task-form';
import { TaskItem } from '@/components/tasks/task-item';
import { NativeAlert } from '@/components/ui/native-alert';
import {
  useCreateTask,
  useDeleteTask,
  useTaskLists,
  useTasks,
  useUpdateTask,
} from '@/hooks/use-tasks';
import { addTaskToCalendar } from '@/lib/calendar';
import { formatDateTime } from '@/lib/format';
import { cancelTaskReminder } from '@/lib/notifications';
import { collectAllTags } from '@/lib/tags';
import { ScrollView, Text, TextInput, View } from '@/tw';

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
  const { colors } = useTheme();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [leaveAfterAlert, setLeaveAfterAlert] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const task = uid ? findByUid(tasksQuery.data ?? [], decodeURIComponent(uid)) : null;
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const availableTags = useMemo(() => collectAllTags(tasksQuery.data ?? []), [tasksQuery.data]);

  if (!task) {
    return (
      <View className="bg-sf-bg flex-1 items-center justify-center px-8">
        <Text className="text-sf-text-2 text-center" selectable>
          {tasksQuery.isLoading
            ? 'Loading…'
            : tasksQuery.isError
              ? tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Task could not be loaded.'
              : 'Task not found.'}
        </Text>
        {tasksQuery.isError ? (
          <Pressable accessibilityRole="button" onPress={() => tasksQuery.refetch()} className="mt-4">
            <Text className="text-sf-blue text-base font-semibold">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  async function handleSubmit(values: TaskFormValues) {
    if (!task) return;
    const destination = lists.find((list) => list.id === values.list_id);
    if (
      task.children.length > 0 &&
      values.list_id !== task.list_id &&
      destination?.account_id &&
      task.account_id &&
      destination.account_id !== task.account_id
    ) {
      setAlert({
        title: 'Move subtasks first',
        message: 'A task with subtasks cannot move to a different account because CalDAV parent links do not cross servers.',
      });
      return;
    }
    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        accountId: task.account_id,
        patch: {
          list_id: values.list_id,
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
      if (values.calendar_id) {
        try {
          await addTaskToCalendar({
            calendarId: values.calendar_id,
            title: values.title,
            notes: values.markdown,
            dueAt: values.due_at,
            reminderAt: values.reminder_at,
          });
        } catch {
          setLeaveAfterAlert(true);
          setAlert({
            title: 'Task saved',
            message: 'The task was updated, but it could not be copied to the selected device calendar.',
          });
          return;
        }
      }
      router.back();
    } catch (error) {
      setAlert({
        title: notImplemented(error) ? 'Not available yet' : 'Update failed',
        message: notImplemented(error)
          ? 'The server does not support editing tasks yet.'
          : error instanceof ApiError
            ? error.message
            : 'Could not update the task.',
      });
    }
  }

  async function confirmDelete() {
    if (!task) return;
    setDeleteVisible(false);
    try {
      await deleteTask.mutateAsync({
        taskId: task.id,
        accountId: task.account_id,
        etag: task.etag,
      });
      await cancelTaskReminder(task.uid);
      router.back();
    } catch (error) {
      setAlert({
        title: notImplemented(error) ? 'Not available yet' : 'Delete failed',
        message: notImplemented(error)
          ? 'The server does not support deleting tasks yet.'
          : 'Could not delete the task.',
      });
    }
  }

  async function addSubtask() {
    if (!task) return;
    const title = subtaskDraft.trim();
    if (!title) return;
    setSubtaskDraft('');
    try {
      await createTask.mutateAsync({ list_id: task.list_id, title, parent_uid: task.uid });
    } catch (error) {
      setAlert({
        title: 'Could not add subtask',
        message: error instanceof ApiError ? error.message : 'Try again.',
      });
    }
  }

  async function toggleSubtask(child: Task) {
    try {
      await updateTask.mutateAsync({
        taskId: child.id,
        accountId: child.account_id,
        patch: { completed: !child.completed, etag: child.etag },
      });
    } catch {
      // optimistic cache already rolled back by the hook
    }
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      contentContainerStyle={{ paddingBottom: keyboardHeight }}>
      <Stack.Screen options={{ title: task.list_name }} />

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
        availableTags={availableTags}
        submitting={updateTask.isPending}
        submitLabel={updateTask.isPending ? 'Saving…' : 'Save Changes'}
        showList={!task.parent_uid}
        onSubmit={handleSubmit}
        onDelete={() => setDeleteVisible(true)}
      />

      {Platform.OS === 'ios' ? <FocusSection taskUid={task.uid} taskTitle={task.title} /> : null}

      <View className="gap-2 px-4 pb-4">
        <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Subtasks</Text>
        <View className="bg-sf-bg-2 rounded-xl px-3 py-1" style={{ borderCurve: 'continuous' }}>
          {task.children.map((child) => (
            <TaskItem
              key={child.id}
              task={child}
              onToggle={toggleSubtask}
              onOpen={(t) => router.push(`/task/${encodeURIComponent(t.uid)}`)}
              showChildren={false}
            />
          ))}
          <View className="flex-row items-center gap-3 py-2">
            <MaterialCommunityIcons name="plus" size={22} color={colors.accent} />
            <TextInput
              value={subtaskDraft}
              onChangeText={setSubtaskDraft}
              onSubmitEditing={addSubtask}
              placeholder="Add subtask"
              placeholderTextColor={colors.text2}
              returnKeyType="done"
              className="text-sf-text flex-1 text-base"
            />
          </View>
        </View>
      </View>

      {!task.parent_uid ? <MoveToDeck task={task} /> : null}

      {task.updated_at ? (
        <View className="px-5 pb-8">
          <Text className="text-sf-text-3 text-xs">Modified {formatDateTime(task.updated_at)}</Text>
        </View>
      ) : null}

      <NativeAlert
        visible={deleteVisible}
        title="Delete task"
        message={task.children.length > 0
          ? `Delete “${task.title}”? Its ${task.children.length} subtask${task.children.length === 1 ? '' : 's'} will remain as independent tasks.`
          : `Delete “${task.title}”?`}
        confirmLabel="Delete"
        dismissLabel="Cancel"
        onDismiss={() => setDeleteVisible(false)}
        onConfirm={confirmDelete}
      />
      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
        onConfirm={() => {
          setAlert(null);
          if (leaveAfterAlert) router.back();
        }}
      />
    </ScrollView>
  );
}

function FocusSection({ taskUid, taskTitle }: { taskUid: string; taskTitle: string }) {
  const { colors } = useTheme();
  const activeUid = useFocusStore((s) => s.taskUid);
  const paused = useFocusStore((s) => s.paused);
  const durationSeconds = useFocusStore((s) => s.durationSeconds);
  const startedAt = useFocusStore((s) => s.startedAt);
  const isMine = activeUid === taskUid && startedAt != null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isMine || paused) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isMine, paused]);
  const remainingMin = isMine
    ? Math.max(0, Math.ceil((durationSeconds - (now - (startedAt ?? 0)) / 1000) / 60))
    : 0;

  return (
    <View className="gap-2 px-4 pb-4">
      <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Focus</Text>
      <View
        className="bg-sf-bg-2 flex-row items-center justify-between rounded-xl px-3 py-3"
        style={{ borderCurve: 'continuous' }}>
        {isMine ? (
          <>
            <Text className="text-sf-text text-base">
              {paused ? 'Paused' : `${remainingMin} min left`}
            </Text>
            <View className="flex-row gap-4">
              <Pressable
                onPress={() => (paused ? resumeFocus() : pauseFocus())}
                accessibilityRole="button"
                hitSlop={8}>
                <Text className="text-sf-blue text-base">{paused ? 'Resume' : 'Pause'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => endFocus()} hitSlop={8}>
                <Text className="text-base" style={{ color: colors.accent }}>End</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text className="text-sf-text text-base">Start a 25-minute focus session</Text>
            <Pressable accessibilityRole="button" onPress={() => startFocus(taskUid, taskTitle, 25 * 60)} hitSlop={8}>
              <Text className="text-sf-blue text-base">Start</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
