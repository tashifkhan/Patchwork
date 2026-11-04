import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, type TextInput as RNTextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { refineTasks } from '@/api/ai';
import { ApiError } from '@/api/client';
import { createTask } from '@/api/tasks';
import { StagedTaskCard } from '@/components/ai/staged-task-card';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { ProgressOverlay } from '@/components/ui/progress-overlay';
import { useTaskLists, useTasks } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import { collectAllTags } from '@/lib/tags';
import { queryKeys } from '@/lib/query-client';
import { themedStackScreenOptions } from '@/lib/screen-options';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function AiReviewScreen() {
  const { colors } = useTheme();
  const refineRef = useRef<RNTextInput>(null);
  const queryClient = useQueryClient();
  const importProgressRef = useRef(
    new Map<
      string,
      {
        parentUid: string;
        listId: string;
        completedSubtasks: Set<number>;
      }
    >(),
  );
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

  const staged = useAiStagingStore((s) => s.staged);
  const updateTask = useAiStagingStore((s) => s.updateTask);
  const removeTask = useAiStagingStore((s) => s.removeTask);
  const setStaged = useAiStagingStore((s) => s.setStaged);
  const clear = useAiStagingStore((s) => s.clear);

  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const availableTags = useMemo(() => collectAllTags(tasksQuery.data ?? []), [tasksQuery.data]);
  const insets = useSafeAreaInsets();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const fallbackListId = lists.some((list) => list.id === aiDefaultListId)
    ? (aiDefaultListId ?? '')
    : (lists[0]?.id ?? '');

  const [instruction, setInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [alert, setAlert] = useState<{
    title: string;
    message: string;
    onClose?: () => void;
  } | null>(null);

  async function handleRefine() {
    if (!instruction.trim() || staged.length === 0) return;
    setRefining(true);
    try {
      const response = await refineTasks({
        instruction: instruction.trim(),
        tasks: staged,
        available_lists: lists,
        available_tags: [],
      });
      setStaged(response.tasks);
      importProgressRef.current.clear();
      setInstruction('');
    } catch (error) {
      setAlert({
        title: 'Refine failed',
        message: error instanceof ApiError ? error.message : 'Could not refine the tasks.',
      });
    } finally {
      setRefining(false);
    }
  }

  async function handleCreateAll() {
    if (staged.length === 0) return;
    if (!fallbackListId) {
      setAlert({ title: 'No list', message: 'No task list is available to save into.' });
      return;
    }

    const invalidIndex = staged.findIndex((task) => !task.title.trim());
    if (invalidIndex >= 0) {
      setAlert({ title: 'Title required', message: `Task ${invalidIndex + 1} needs a title.` });
      return;
    }

    setCreating(true);
    const failures: string[] = [];
    let newlyCreated = 0;
    try {
      for (const [index, task] of staged.entries()) {
        const key = task.draft_id ?? `staged-${index}`;
        const listId =
          task.list_id && lists.some((list) => list.id === task.list_id)
            ? task.list_id
            : fallbackListId;
        let progress = importProgressRef.current.get(key);
        if (!progress) {
          try {
            const created = await createTask({
              list_id: listId,
              title: task.title.trim(),
              markdown: task.description ?? '',
              tags: task.tags,
              due_at: task.due_at ?? null,
              reminder_at: task.reminder_at ?? null,
              priority: task.priority ?? null,
            });
            progress = { parentUid: created.uid, listId, completedSubtasks: new Set() };
            importProgressRef.current.set(key, progress);
            newlyCreated += 1;
          } catch (error) {
            failures.push(
              `${task.title}: ${error instanceof ApiError ? error.message : 'could not create task'}`,
            );
            continue;
          }
        }

        for (const [subtaskIndex, subtask] of task.subtasks.entries()) {
          if (progress.completedSubtasks.has(subtaskIndex) || !subtask.title.trim()) continue;
          try {
            await createTask({
              list_id: progress.listId,
              title: subtask.title.trim(),
              markdown: subtask.description ?? '',
              parent_uid: progress.parentUid,
            });
            progress.completedSubtasks.add(subtaskIndex);
          } catch (error) {
            failures.push(
              `${task.title} › ${subtask.title}: ${error instanceof ApiError ? error.message : 'could not create subtask'}`,
            );
          }
        }
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      if (failures.length > 0) {
        setAlert({
          title: 'Partially imported',
          message: `${newlyCreated > 0 ? `${newlyCreated} new parent task${newlyCreated === 1 ? ' was' : 's were'} created. ` : ''}Retry Create to continue only the unfinished items.\n\n${failures.slice(0, 3).join('\n')}`,
        });
        return;
      }

      // Resolve the progress indicator into a check, then go back to the list.
      haptics.success();
      setDoneLabel(`Added ${staged.length} to-do${staged.length === 1 ? '' : 's'}`);
      setTimeout(() => {
        importProgressRef.current.clear();
        clear();
        router.dismissTo('/');
      }, 900);
    } catch (error) {
      setAlert({
        title: 'Create failed',
        message: error instanceof ApiError ? error.message : 'Some tasks could not be created.',
      });
    } finally {
      setCreating(false);
    }
  }

  if (staged.length === 0 && !doneLabel) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 px-10"
        style={{ backgroundColor: colors.bg }}>
        <Stack.Screen options={{ ...themedStackScreenOptions(colors), headerLargeTitle: false }} />
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primaryContainer,
          }}>
          <MaterialCommunityIcons name="creation" size={32} color={colors.onPrimaryContainer} />
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
          Nothing to review
        </Text>
        <Text style={{ fontSize: 15, color: colors.text2, textAlign: 'center', lineHeight: 21 }}>
          Tap + and use Write with AI, Camera or Photo to draft to-dos.
        </Text>
      </View>
    );
  }

  const count = staged.length;
  const busyLabel = creating
    ? `Adding ${count} to-do${count === 1 ? '' : 's'}…`
    : refining
      ? 'Reworking your to-dos…'
      : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          ...themedStackScreenOptions(colors),
          headerLargeTitle: false,
          title: `${count} to-do${count === 1 ? '' : 's'} to review`,
        }}
      />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: 14,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 120 + keyboardHeight,
        }}>
        <Text style={{ fontSize: 15, color: colors.text2, lineHeight: 21, paddingHorizontal: 4 }}>
          Drafted by AI. Edit anything, remove what you don&apos;t want, then add them. Nothing is
          saved until you do.
        </Text>

        {staged.map((task, index) => (
          <StagedTaskCard
            key={task.draft_id ?? index}
            index={index}
            task={task}
            lists={lists}
            availableTags={availableTags}
            onChange={updateTask}
            onRemove={removeTask}
          />
        ))}

        {/* Refine: an M3 search-bar style field that reworks the whole batch. */}
        <View
          className="flex-row items-end"
          style={{
            marginTop: 6,
            minHeight: 56,
            borderRadius: 28,
            paddingLeft: 16,
            paddingRight: 6,
            paddingVertical: 6,
            gap: 10,
            backgroundColor: colors.bg3,
          }}>
          <MaterialCommunityIcons
            name="creation"
            size={22}
            color={colors.accent}
            style={{ marginBottom: 11 }}
          />
          <TextInput
            ref={refineRef}
            value={instruction}
            onChangeText={setInstruction}
            placeholder="Ask AI to change these…"
            placeholderTextColor={colors.text3}
            multiline
            autoCapitalize="sentences"
            accessibilityLabel="Ask AI to change these to-dos"
            className="text-sf-text flex-1"
            style={{
              fontSize: 16,
              lineHeight: 22,
              maxHeight: 120,
              paddingVertical: 11,
              paddingHorizontal: 0,
            }}
          />
          <Pressable
            onPress={handleRefine}
            disabled={refining || !instruction.trim()}
            accessibilityRole="button"
            accessibilityLabel="Refine with AI"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: pressed ? 12 : 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: instruction.trim() ? colors.accent : 'transparent',
            })}>
            <MaterialCommunityIcons
              name="arrow-up"
              size={22}
              color={instruction.trim() ? colors.onAccent : colors.text3}
            />
          </Pressable>
        </View>
      </ScrollView>

      {/* Primary action stays in reach however long the list gets. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: insets.bottom + 16,
        }}>
        <Pressable
          onPress={handleCreateAll}
          disabled={creating || refining || count === 0}
          accessibilityRole="button"
          accessibilityLabel={`Add ${count} to-dos`}
          android_ripple={{ color: colors.separator }}
          style={({ pressed }) => ({
            height: 56,
            borderRadius: pressed ? 16 : 28,
            borderCurve: 'continuous',
            overflow: 'hidden',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.accent,
            boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
          })}>
          <MaterialCommunityIcons name="plus" size={22} color={colors.onAccent} />
          <Text style={{ color: colors.onAccent, fontSize: 17, fontWeight: '600' }}>
            Add {count} to-do{count === 1 ? '' : 's'}
          </Text>
        </Pressable>
      </View>

      <ProgressOverlay
        visible={creating || refining || doneLabel != null}
        state={doneLabel ? 'done' : 'working'}
        label={doneLabel ?? busyLabel}
      />

      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => {
          const onClose = alert?.onClose;
          setAlert(null);
          onClose?.();
        }}
      />
    </View>
  );
}
