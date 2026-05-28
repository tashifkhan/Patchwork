import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { useCreateDeckBoard } from '@/hooks/use-deck';
import { useUiStore } from '@/stores/ui-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function NewBoardScreen() {
  const { colors } = useTheme();
  const createBoard = useCreateDeckBoard();
  const setSelectedBoardId = useUiStore((s) => s.setSelectedBoardId);
  const [title, setTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canCreate = title.trim().length > 0 && !createBoard.isPending;

  async function submit() {
    if (!canCreate) return;
    try {
      const board = await createBoard.mutateAsync({ title: title.trim() });
      setSelectedBoardId(board.id);
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive">
      <Stack.Screen options={{ title: 'New Board' }} />
      <View className="gap-2 px-4 pt-4">
        <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Board name</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={submit}
          placeholder="e.g. Personal"
          placeholderTextColor={colors.text2}
          autoFocus
          returnKeyType="done"
          className="text-sf-text bg-sf-bg-2 rounded-xl px-3 py-3 text-base"
          style={{ borderCurve: 'continuous' }}
        />
        <Text className="text-sf-text-3 px-1 text-xs">
          New boards start with To do, Doing and Done columns.
        </Text>
      </View>

      <View className="px-4 pt-6">
        <Pressable
          onPress={submit}
          disabled={!canCreate}
          style={({ pressed }) => ({ opacity: !canCreate ? 0.4 : pressed ? 0.8 : 1 })}>
          <View className="bg-sf-blue items-center rounded-xl py-3.5" style={{ borderCurve: 'continuous' }}>
            <Text className="text-sf-on-accent text-base font-semibold">
              {createBoard.isPending ? 'Creating…' : 'Create Board'}
            </Text>
          </View>
        </Pressable>
      </View>

      <NativeAlert
        visible={errorMessage != null}
        title="Could not create board"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </ScrollView>
  );
}
