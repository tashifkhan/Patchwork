import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useDeleteTaskList, useUpdateTaskList } from '@/hooks/use-tasks';
import { useUiStore } from '@/stores/ui-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function EditListScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ listId?: string; name?: string }>();
  const listId = typeof params.listId === 'string' ? params.listId : '';
  const updateList = useUpdateTaskList();
  const deleteList = useDeleteTaskList();
  const selectedListId = useUiStore((state) => state.selectedListId);
  const setSelectedListId = useUiStore((state) => state.setSelectedListId);

  const [title, setTitle] = useState(typeof params.name === 'string' ? params.name : '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const busy = updateList.isPending || deleteList.isPending;
  const canSave = title.trim().length > 0 && Boolean(listId) && !busy;

  async function submit() {
    if (!canSave) return;
    try {
      await updateList.mutateAsync({ listId, name: title.trim() });
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function confirmDelete() {
    if (!listId) return;
    setDeleteVisible(false);
    try {
      await deleteList.mutateAsync(listId);
      if (selectedListId === listId) setSelectedListId(null);
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the list.');
    }
  }

  return (
    <SheetSurface title="Edit list" subtitle="Rename this list or delete it and its tasks">
      <Stack.Screen options={{ title: 'Edit List' }} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="gap-2 px-5 pt-4">
          <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">List name</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={submit}
            placeholder="e.g. Personal"
            placeholderTextColor={colors.text2}
            autoFocus
            returnKeyType="done"
            className="text-sf-text rounded-2xl px-4 py-3.5 text-base"
            style={{
              backgroundColor: colors.bg3,
              borderCurve: 'continuous',
              minHeight: 52,
            }}
          />
        </View>

        <View className="gap-3 px-5 pt-8">
          <Button
            label={busy ? 'Saving…' : 'Save changes'}
            disabled={!canSave}
            loading={busy && !deleteVisible}
            onPress={submit}
          />
          <Button
            variant="danger"
            label="Delete list"
            disabled={busy || !listId}
            onPress={() => setDeleteVisible(true)}
          />
        </View>

        <NativeAlert
          visible={deleteVisible}
          title="Delete list"
          message="Delete this list and all of its tasks? This cannot be undone."
          confirmLabel="Delete"
          dismissLabel="Cancel"
          onDismiss={() => setDeleteVisible(false)}
          onConfirm={confirmDelete}
        />
        <NativeAlert
          visible={errorMessage != null}
          title="List error"
          message={errorMessage ?? ''}
          onDismiss={() => setErrorMessage(null)}
        />
      </ScrollView>
    </SheetSurface>
  );
}
