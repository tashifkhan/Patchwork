import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable } from 'react-native';

import { ApiError } from '@/api/client';
import { useTheme } from '@/components/theme/context';
import { TaskForm, type TaskFormValues } from '@/components/tasks/task-form';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
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
          ? [
              addTaskToCalendar({
                calendarId: values.calendar_id,
                title: created.title,
                notes: created.markdown,
                dueAt: created.due_at,
                reminderAt: created.reminder_at,
              }),
            ]
          : []),
        ...subtaskDrafts.map((title) =>
          createTask.mutateAsync({
            list_id: created.list_id,
            title,
            parent_uid: created.uid,
          })
        ),
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

  if (listsQuery.isLoading && lists.length === 0) {
    return (
      <SheetSurface
        title="New task"
        subtitle="Add something to your lists"
        skipPartiallyExpanded={false}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <LoadingState
            message="Loading lists…"
            subtitle="Fetching your CalDAV task lists"
            fullScreen={false}
            showBar
          />
        </View>
      </SheetSurface>
    );
  }

  if (lists.length === 0) {
    return (
      <SheetSurface
        title="New task"
        subtitle="Connect an account first">
        <ScrollView
          style={{ backgroundColor: 'transparent' }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 24 }}>
          <EmptyState
            icon={listsQuery.isError ? 'cloud-off-outline' : 'cloud-outline'}
            title={listsQuery.isError ? 'Could not load lists' : 'No task lists yet'}
            subtitle={
              listsQuery.isError
                ? 'Check your connection or account settings, then try again.'
                : 'Connect a CalDAV account to create your first task.'
            }
            // On a load failure retrying is the primary action; otherwise
            // connecting an account is (matches the tasks/deck empty states).
            actions={[
              ...(listsQuery.isError
                ? [{ label: 'Retry', onPress: () => listsQuery.refetch(), variant: 'filled' as const }]
                : []),
              {
                label: 'Connect account',
                onPress: () => router.push('/settings/account'),
                variant: listsQuery.isError ? ('tonal' as const) : ('filled' as const),
              },
            ]}
          />
        </ScrollView>
      </SheetSurface>
    );
  }

  return (
    <SheetSurface title="New task" subtitle="What needs doing?">
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: keyboardHeight + 28 }}>
        <TaskForm
          lists={lists}
          availableTags={availableTags}
          submitting={createTask.isPending}
          submitLabel={createTask.isPending ? 'Creating…' : 'Create Task'}
          onSubmit={handleSubmit}
        />

        <View className="gap-2 px-5 pb-4">
          <View className="flex-row items-center gap-1.5 px-1">
            <MaterialCommunityIcons name="checkbox-marked-outline" size={14} color={colors.accent} />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: colors.accent,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
              }}>
              Subtasks
            </Text>
          </View>
          <View
            className="rounded-2xl px-3 py-1"
            style={{
              backgroundColor: colors.bg3,
              borderRadius: 20,
              borderCurve: 'continuous',
            }}>
            {subtaskDrafts.map((title, index) => (
              <View
                key={`${title}-${index}`}
                className="flex-row items-center gap-3 py-2.5"
                style={{ minHeight: 48 }}>
                <MaterialCommunityIcons name="circle-outline" size={20} color={colors.text2} />
                <Text className="text-sf-text flex-1 text-base">{title}</Text>
                <Pressable
                  onPress={() => removeDraft(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove subtask ${title}`}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.6 : 1,
                    minWidth: 40,
                    minHeight: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                  })}>
                  <MaterialCommunityIcons name="close" size={18} color={colors.text2} />
                </Pressable>
              </View>
            ))}
            <View className="flex-row items-center gap-3 py-2.5" style={{ minHeight: 48 }}>
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
