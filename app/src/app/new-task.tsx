import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable } from 'react-native';

import { ApiError } from '@/api/client';
import { useTheme } from '@/components/theme/context';
import {
  CreateDestinationControl,
  type CreateDestination,
} from '@/components/tasks/create-destination-control';
import { TaskForm, type TaskFormValues } from '@/components/tasks/task-form';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useCreateTask, useTaskLists, useTasks } from '@/hooks/use-tasks';
import { addTaskToCalendar } from '@/lib/calendar';
import { collectAllTags, normalizeTags } from '@/lib/tags';
import { setCreateHandoff, takeCreateHandoff } from '@/stores/create-handoff';
import { useUiStore } from '@/stores/ui-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

const ADJUSTS_KEYBOARD_INSETS = process.env.EXPO_OS === 'ios';

export default function NewTaskScreen() {
  const { colors } = useTheme();
  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const createTask = useCreateTask();
  const selectedListId = useUiStore((state) => state.selectedListId);
  const selectedTag = useUiStore((state) => state.selectedTag);
  // Claimed once, on first render, from a Task <-> GitHub issue switch.
  const [handoff] = useState(takeCreateHandoff);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdWithWarnings, setCreatedWithWarnings] = useState(false);
  const [warningTaskUid, setWarningTaskUid] = useState<string | null>(null);
  const [subtaskDrafts, setSubtaskDrafts] = useState<string[]>(
    handoff?.task?.subtasks ?? []
  );
  const [subtaskDraft, setSubtaskDraft] = useState(handoff?.task?.subtaskDraft ?? '');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const draftRef = useRef<Partial<TaskFormValues>>({
    title: handoff?.title ?? '',
    markdown: handoff?.body ?? '',
    list_id: handoff?.task?.list_id,
    tags: handoff?.task?.tags,
    due_at: handoff?.task?.due_at,
    reminder_at: handoff?.task?.reminder_at,
    priority: handoff?.task?.priority,
    calendar_id: handoff?.task?.calendar_id,
  });

  // iOS gets exact insets from the ScrollView's own frame, which matters
  // inside a form sheet: the raw keyboard height is measured against the whole
  // screen and over-pads a sheet that only covers part of it.
  useEffect(() => {
    if (ADJUSTS_KEYBOARD_INSETS) return;
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
  const contextualListId =
    handoff?.task?.list_id && lists.some((list) => list.id === handoff.task?.list_id)
      ? handoff.task.list_id
      : selectedListId && lists.some((list) => list.id === selectedListId)
        ? selectedListId
        : lists[0]?.id;
  const contextualTags = normalizeTags(
    handoff?.task?.tags ?? (selectedTag ? [selectedTag] : [])
  );
  const initialForm: Partial<TaskFormValues> = {
    title: handoff?.title,
    markdown: handoff?.body,
    list_id: contextualListId,
    tags: contextualTags,
    due_at: handoff?.task?.due_at,
    reminder_at: handoff?.task?.reminder_at,
    priority: handoff?.task?.priority,
    calendar_id: handoff?.task?.calendar_id,
  };

  function changeDestination(destination: CreateDestination) {
    if (destination === 'github-issue') {
      Keyboard.dismiss();
      const draft = draftRef.current;
      // `replace` tears this form down, so carry both shared text and every
      // task-only field for a lossless switch back.
      setCreateHandoff({
        title: draft.title ?? '',
        body: draft.markdown ?? '',
        task: {
          list_id: draft.list_id ?? contextualListId ?? '',
          tags: normalizeTags(draft.tags ?? contextualTags),
          due_at: draft.due_at ?? null,
          reminder_at: draft.reminder_at ?? null,
          priority: draft.priority ?? null,
          calendar_id: draft.calendar_id ?? null,
          subtasks: subtaskDrafts,
          subtaskDraft,
        },
      });
      router.replace('/new-github-issue');
    }
  }

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
    // Mutation state updates on the next render and does not cover calendar
    // mirroring. A synchronous ref closes both double-tap windows.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    // A subtask typed but never committed with the return key used to be
    // dropped on the floor when the user went straight for Create.
    const pending = subtaskDraft.trim();
    const subtasks = pending ? [...subtaskDrafts, pending] : subtaskDrafts;
    if (pending) {
      setSubtaskDrafts(subtasks);
      setSubtaskDraft('');
    }

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

      let calendarFailed = false;
      if (values.calendar_id) {
        try {
          await addTaskToCalendar({
            calendarId: values.calendar_id,
            title: created.title,
            notes: created.markdown,
            dueAt: created.due_at,
            reminderAt: created.reminder_at,
          });
        } catch {
          calendarFailed = true;
        }
      }

      // Sequential, with an explicit sort order, so the list the user typed
      // comes back in the order they typed it.
      const failedSubtasks: string[] = [];
      for (const [index, title] of subtasks.entries()) {
        try {
          await createTask.mutateAsync({
            list_id: created.list_id,
            title,
            parent_uid: created.uid,
            sort_order: index,
          });
        } catch {
          failedSubtasks.push(title);
        }
      }

      const problems: string[] = [];
      if (calendarFailed) problems.push('it could not be added to your calendar');
      if (failedSubtasks.length > 0) {
        problems.push(
          `subtasks not created: ${failedSubtasks.map((title) => `“${title}”`).join(', ')}`
        );
      }
      if (problems.length > 0) {
        setCreatedWithWarnings(true);
        setWarningTaskUid(created.uid);
        setErrorMessage(`The task was created, but ${problems.join(' and ')}.`);
        return;
      }
      router.back();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not create the task.';
      setErrorMessage(cleanErrorMessage(message));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (listsQuery.isLoading && lists.length === 0) {
    return (
      <SheetSurface
        title="New task"
        subtitle="Add something to your lists"
        skipPartiallyExpanded={false}>
        <View style={{ flex: 1 }}>
          <CreateDestinationControl value="task" onChange={changeDestination} />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <LoadingState
              message="Loading lists…"
              subtitle="Fetching your CalDAV task lists"
              fullScreen={false}
              showBar
            />
          </View>
        </View>
      </SheetSurface>
    );
  }

  if (lists.length === 0) {
    return (
      <SheetSurface
        title="New task"
        subtitle="Connect an account first">
        <View style={{ flex: 1 }}>
          <CreateDestinationControl value="task" onChange={changeDestination} />
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
        </View>
      </SheetSurface>
    );
  }

  return (
    <SheetSurface title="New task" subtitle="What needs doing?">
      <CreateDestinationControl value="task" onChange={changeDestination} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={ADJUSTS_KEYBOARD_INSETS}
        contentContainerStyle={{ paddingBottom: keyboardHeight + 28 }}>
        <TaskForm
          lists={lists}
          availableTags={availableTags}
          availableTagsLoading={tasksQuery.isLoading && tasksQuery.data == null}
          availableTagsError={tasksQuery.isError && tasksQuery.data == null}
          onRetryTags={() => {
            void tasksQuery.refetch();
          }}
          initial={initialForm}
          submitting={isSubmitting}
          submitLabel={isSubmitting ? 'Creating…' : 'Create Task'}
          onDraftChange={(draft) => {
            draftRef.current = draft;
          }}
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
          title={createdWithWarnings ? 'Task created' : 'Create failed'}
          message={errorMessage ?? ''}
          onDismiss={() => {
            setErrorMessage(null);
            if (createdWithWarnings) {
              const uid = warningTaskUid;
              setCreatedWithWarnings(false);
              setWarningTaskUid(null);
              router.back();
              if (uid) {
                router.push({
                  pathname: '/task/[uid]',
                  params: { uid },
                });
              }
            }
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
