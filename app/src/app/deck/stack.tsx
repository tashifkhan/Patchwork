import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { useCreateDeckStack, useDeleteDeckStack, useUpdateDeckStack } from '@/hooks/use-deck';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function StackScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ boardId?: string; stackId?: string; title?: string; order?: string }>();
  const boardId = Number(params.boardId);
  const stackId = params.stackId ? Number(params.stackId) : null;
  const order = params.order ? Number(params.order) : 999;
  const editing = stackId != null;

  const createStack = useCreateDeckStack();
  const updateStack = useUpdateDeckStack();
  const deleteStack = useDeleteDeckStack();

  const [title, setTitle] = useState(params.title ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const busy = createStack.isPending || updateStack.isPending || deleteStack.isPending;
  const canSave = title.trim().length > 0 && !busy && Number.isFinite(boardId);

  async function submit() {
    if (!canSave) return;
    try {
      if (editing) {
        await updateStack.mutateAsync({ board_id: boardId, stack_id: stackId, title: title.trim(), order });
      } else {
        await createStack.mutateAsync({ board_id: boardId, title: title.trim(), order });
      }
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function confirmDelete() {
    if (!editing) return;
    setDeleteVisible(false);
    try {
      await deleteStack.mutateAsync({ board_id: boardId, stack_id: stackId });
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the column.');
    }
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive">
      <Stack.Screen options={{ title: editing ? 'Edit Column' : 'New Column' }} />

      <View className="gap-2 px-4 pt-4">
        <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Column name</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={submit}
          placeholder="e.g. In Review"
          placeholderTextColor={colors.text2}
          autoFocus
          returnKeyType="done"
          className="text-sf-text bg-sf-bg-2 rounded-xl px-3 py-3 text-base"
          style={{ borderCurve: 'continuous' }}
        />
      </View>

      <View className="px-4 pt-6">
        <Pressable
          onPress={submit}
          disabled={!canSave}
          style={({ pressed }) => ({ opacity: !canSave ? 0.4 : pressed ? 0.8 : 1 })}>
          <View className="bg-sf-blue items-center rounded-xl py-3.5" style={{ borderCurve: 'continuous' }}>
            <Text className="text-sf-on-accent text-base font-semibold">
              {busy ? 'Saving…' : editing ? 'Save Changes' : 'Add Column'}
            </Text>
          </View>
        </Pressable>
      </View>

      {editing ? (
        <View className="px-4 pt-3">
          <Pressable
            onPress={() => setDeleteVisible(true)}
            disabled={busy}
            style={({ pressed }) => ({ opacity: busy ? 0.4 : pressed ? 0.7 : 1 })}>
            <View className="items-center rounded-xl py-3.5" style={{ borderCurve: 'continuous' }}>
              <Text className="text-sf-red text-base font-semibold">Delete Column</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      <NativeAlert
        visible={deleteVisible}
        title="Delete column"
        message="Delete this column and all of its cards?"
        confirmLabel="Delete"
        dismissLabel="Cancel"
        onDismiss={() => setDeleteVisible(false)}
        onConfirm={confirmDelete}
      />
      <NativeAlert
        visible={errorMessage != null}
        title="Column error"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </ScrollView>
  );
}
