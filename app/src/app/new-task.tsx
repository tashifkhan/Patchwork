import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable } from 'react-native';

import { ApiError } from '@/api/client';
import { useTheme } from '@/components/theme/context';
import { TaskForm, type TaskFormValues } from '@/components/tasks/task-form';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useCreateTask, useTaskLists, useTasks } from '@/hooks/use-tasks';
import { addTaskToCalendar } from '@/lib/calendar';
import { collectAllTags } from '@/lib/tags';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function NewTaskScreen() {
  const { colors } = useTheme();
  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const createTask = useCreateTask();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdWithWarnings, setCreatedWithWarnings] = useState(false);
  const [subtaskDrafts, setSubtaskDrafts] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState('');
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
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const availableTags = useMemo(() => collectAllTags(tasksQuery.data ?? []), [tasksQuery.data]);

  function addDraft() {
    const value = subtaskDraft.trim();
    if (!value) return;
    setSubtaskDrafts((prev) => [...prev, value]);
    setSubtaskDraft('');
  }

  function removeDraft(index: number) {
    setSubtaskDrafts((prev) => prev.filter((_, i) => i !== index));
  }

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
      const followUps = await Promise.allSettled([
        ...(values.calendar_id
          ? [addTaskToCalendar({
              calendarId: values.calendar_id,
              title: created.title,
              notes: created.markdown,
              dueAt: created.due_at,
              reminderAt: created.reminder_at,
            })]
          : []),
        ...subtaskDrafts.map((title) => createTask.mutateAsync({
          list_id: created.list_id,
          title,
          parent_uid: created.uid,
        })),
      ]);
      const failedCount = followUps.filter((result) => result.status === 'rejected').length;
      if (failedCount > 0) {
        setCreatedWithWarnings(true);
        setErrorMessage(
          `The task was created, but ${failedCount} follow-up ${failedCount === 1 ? 'item' : 'items'} could not be added. You can retry those from the task detail screen.`
        );
        return;
      }
      router.back();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not create the task.';
      setErrorMessage(cleanErrorMessage(message));
    }
  }

  if (lists.length === 0) {
    return (
      <SheetSurface>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sf-text-2 text-center" selectable>
            {listsQuery.isLoading
              ? 'Loading lists…'
              : listsQuery.isError
                ? 'Task lists could not be loaded.'
                : 'Connect a CalDAV account to create your first task.'}
          </Text>
          {!listsQuery.isLoading ? (
            <View className="mt-4 flex-row gap-3">
              {listsQuery.isError ? (
                <Pressable accessibilityRole="button" onPress={() => listsQuery.refetch()}>
                  <Text className="text-sf-blue text-base font-semibold">Retry</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => router.push('/settings/account')}>
                <Text className="text-sf-blue text-base font-semibold">Connect account</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </SheetSurface>
    );
  }

  return (
    <SheetSurface>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingBottom: keyboardHeight }}>
        <TaskForm
          lists={lists}
          availableTags={availableTags}
          submitting={createTask.isPending}
          submitLabel={createTask.isPending ? 'Creating…' : 'Create Task'}
          onSubmit={handleSubmit}
        />

        <View className="gap-2 px-4 pb-4">
          <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Subtasks</Text>
          <View className="bg-sf-bg-2 rounded-xl px-3 py-1" style={{ borderCurve: 'continuous' }}>
            {subtaskDrafts.map((title, index) => (
              <View
                key={`${title}-${index}`}
                className="flex-row items-center gap-3 py-2">
                <MaterialCommunityIcons name="circle-outline" size={20} color={colors.text2} />
                <Text className="text-sf-text flex-1 text-base">{title}</Text>
                <Pressable
                  onPress={() => removeDraft(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove subtask ${title}`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <MaterialCommunityIcons name="close" size={18} color={colors.text2} />
                </Pressable>
              </View>
            ))}
            <View className="flex-row items-center gap-3 py-2">
              <MaterialCommunityIcons name="plus" size={22} color={colors.accent} />
              <TextInput
                value={subtaskDraft}
                onChangeText={setSubtaskDraft}
                onSubmitEditing={addDraft}
                placeholder="Add subtask"
                placeholderTextColor={colors.text2}
                returnKeyType="done"
                className="text-sf-text flex-1 text-base"
              />
            </View>
          </View>
        </View>

        <NativeAlert
          visible={errorMessage != null}
          title="Create failed"
          message={errorMessage ?? ''}
          onDismiss={() => {
            setErrorMessage(null);
            if (createdWithWarnings) router.back();
          }}
        />
      </ScrollView>
    </SheetSurface>
  );
}

function cleanErrorMessage(message: string) {
  const xmlMessage = message.match(/<[^>]*message[^>]*>([\s\S]*?)<\/[^>]*message>/i)?.[1];
  return xmlMessage ? decodeXml(xmlMessage.trim()) : message;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
