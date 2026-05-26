import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { refineTasks } from '@/api/ai';
import { ApiError } from '@/api/client';
import { createTask } from '@/api/tasks';
import { StagedTaskCard } from '@/components/ai/staged-task-card';
import { Icon } from '@/components/ui/icon';
import { useTaskLists } from '@/hooks/use-tasks';
import { scheduleTaskReminder } from '@/lib/notifications';
import { queryKeys } from '@/lib/query-client';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, TextInput, View, useCSSVariable } from '@/tw';

export default function AiReviewScreen() {
  const textSecondary = useCSSVariable('--sf-text-2');
  const queryClient = useQueryClient();

  const staged = useAiStagingStore((s) => s.staged);
  const updateTask = useAiStagingStore((s) => s.updateTask);
  const removeTask = useAiStagingStore((s) => s.removeTask);
  const setStaged = useAiStagingStore((s) => s.setStaged);
  const clear = useAiStagingStore((s) => s.clear);

  const listsQuery = useTaskLists();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const fallbackListId = aiDefaultListId ?? lists[0]?.id ?? '';

  const [instruction, setInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [creating, setCreating] = useState(false);

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
      setInstruction('');
    } catch (error) {
      Alert.alert(
        'Refine failed',
        error instanceof ApiError ? error.message : 'Could not refine the tasks.'
      );
    } finally {
      setRefining(false);
    }
  }

  async function handleCreateAll() {
    if (staged.length === 0) return;
    if (!fallbackListId) {
      Alert.alert('No list', 'No task list is available to save into.');
      return;
    }

    setCreating(true);
    try {
      for (const task of staged) {
        const listId = task.list_id ?? fallbackListId;
        const created = await createTask({
          list_id: listId,
          title: task.title,
          markdown: task.description ?? '',
          tags: task.tags,
          due_at: task.due_at ?? null,
          reminder_at: task.reminder_at ?? null,
          priority: task.priority ?? null,
        });
        if (created.reminder_at) {
          await scheduleTaskReminder({
            taskUid: created.uid,
            title: created.title,
            reminderAt: created.reminder_at,
          });
        }
        for (const sub of task.subtasks) {
          await createTask({
            list_id: listId,
            title: sub.title,
            markdown: sub.description ?? '',
            parent_uid: created.uid,
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      clear();
      Alert.alert('Imported', `Created ${staged.length} task${staged.length === 1 ? '' : 's'}.`);
      router.dismissTo('/');
    } catch (error) {
      Alert.alert(
        'Create failed',
        error instanceof ApiError ? error.message : 'Some tasks could not be created.'
      );
    } finally {
      setCreating(false);
    }
  }

  if (staged.length === 0) {
    return (
      <View className="bg-sf-bg flex-1 items-center justify-center gap-2 px-8">
        <Icon name="sparkles" size={28} color={textSecondary as string} />
        <Text className="text-sf-text-2 text-center">No staged tasks. Import an image first.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      contentContainerClassName="gap-4 px-4 py-4 pb-8">
      <Text className="text-sf-text-2 text-sm">
        Review and edit before saving. Nothing is written to Nextcloud until you tap Create.
      </Text>

      {staged.map((task, index) => (
        <StagedTaskCard
          key={index}
          index={index}
          task={task}
          lists={lists}
          onChange={updateTask}
          onRemove={removeTask}
        />
      ))}

      <View className="bg-sf-bg-2 gap-2 rounded-2xl p-3" style={{ borderCurve: 'continuous' }}>
        <Text className="text-sf-text-2 text-xs font-semibold uppercase">Refine with AI</Text>
        <TextInput
          value={instruction}
          onChangeText={setInstruction}
          placeholder="e.g. split into morning and evening tasks"
          placeholderTextColor={textSecondary as string}
          className="text-sf-text bg-sf-bg-3 rounded-lg px-3 py-2 text-base"
          style={{ borderCurve: 'continuous' }}
        />
        <Pressable
          onPress={handleRefine}
          disabled={refining || !instruction.trim()}
          style={({ pressed }) => ({
            opacity: refining || !instruction.trim() ? 0.4 : pressed ? 0.8 : 1,
          })}>
          <View className="flex-row items-center justify-center gap-2 py-2">
            <Icon name="sparkles" size={16} color={textSecondary as string} />
            <Text className="text-sf-text text-base">{refining ? 'Refining…' : 'Refine'}</Text>
          </View>
        </Pressable>
      </View>

      <Pressable
        onPress={handleCreateAll}
        disabled={creating}
        style={({ pressed }) => ({ opacity: creating ? 0.5 : pressed ? 0.85 : 1 })}>
        <View
          className="bg-sf-blue items-center rounded-xl py-3.5"
          style={{ borderCurve: 'continuous' }}>
          <Text className="text-base font-semibold text-white">
            {creating ? 'Creating…' : `Create ${staged.length} task${staged.length === 1 ? '' : 's'}`}
          </Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}
