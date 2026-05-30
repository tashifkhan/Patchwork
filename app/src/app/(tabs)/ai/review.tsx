import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Host, TextInput as ExpoTextInput, type TextInputRef } from '@expo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable } from 'react-native';

import { refineTasks } from '@/api/ai';
import { ApiError } from '@/api/client';
import { createTask } from '@/api/tasks';
import { StagedTaskCard } from '@/components/ai/staged-task-card';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { useTaskLists } from '@/hooks/use-tasks';
import { scheduleTaskReminder } from '@/lib/notifications';
import { queryKeys } from '@/lib/query-client';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, View, useCSSVariable } from '@/tw';

export default function AiReviewScreen() {
  const textSecondary = useCSSVariable('--sf-text-2');
  const { colors } = useTheme();
  const refineRef = useRef<TextInputRef>(null);
  const queryClient = useQueryClient();
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
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const fallbackListId = aiDefaultListId ?? lists[0]?.id ?? '';

  const [instruction, setInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string; onClose?: () => void } | null>(null);

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
      refineRef.current?.clear();
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
      setAlert({
        title: 'Imported',
        message: `Created ${staged.length} task${staged.length === 1 ? '' : 's'}.`,
        onClose: () => {
          clear();
          router.dismissTo('/');
        },
      });
    } catch (error) {
      setAlert({
        title: 'Create failed',
        message: error instanceof ApiError ? error.message : 'Some tasks could not be created.',
      });
    } finally {
      setCreating(false);
    }
  }

  if (staged.length === 0) {
    return (
      <View className="bg-sf-bg flex-1 items-center justify-center gap-2 px-8">
        <MaterialCommunityIcons name="auto-fix" size={28} color={textSecondary as string} />
        <Text className="text-sf-text-2 text-center">No staged tasks. Import an image first.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 32 + keyboardHeight }}>
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
          <View className="bg-sf-bg-3 rounded-lg px-2" style={{ borderCurve: 'continuous', minHeight: 40, justifyContent: 'center' }}>
            <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
              <ExpoTextInput
                ref={refineRef}
                placeholder="e.g. split into morning and evening tasks"
                placeholderTextColor={colors.text3}
                multiline
                autoCapitalize="sentences"
                underlineColorAndroid="transparent"
                cursorColor={colors.accent}
                selectionColor={colors.accent}
                onChangeText={setInstruction}
                textStyle={{ color: colors.text, fontSize: 16 }}
                style={{ paddingHorizontal: 6, paddingVertical: 6, backgroundColor: 'transparent' }}
              />
            </Host>
          </View>
          <Pressable
            onPress={handleRefine}
            disabled={refining || !instruction.trim()}
            style={({ pressed }) => ({
              opacity: refining || !instruction.trim() ? 0.4 : pressed ? 0.8 : 1,
            })}>
            <View className="flex-row items-center justify-center gap-2 py-2">
              <MaterialCommunityIcons name="auto-fix" size={16} color={textSecondary as string} />
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
            <Text className="text-sf-on-accent text-base font-semibold">
              {creating ? 'Creating…' : `Create ${staged.length} task${staged.length === 1 ? '' : 's'}`}
            </Text>
          </View>
        </Pressable>

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
    </ScrollView>
  );
}
