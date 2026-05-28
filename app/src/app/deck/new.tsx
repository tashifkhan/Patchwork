import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import { DeckCardForm, type DeckCardFormValues } from '@/components/deck/deck-card-form';
import { NativeAlert } from '@/components/ui/native-alert';
import { useCreateDeckCard, useDeckBoard, useDeckBoards } from '@/hooks/use-deck';
import { ScrollView, Text, View } from '@/tw';

export default function NewDeckCardScreen() {
  const { boardId, stackId } = useLocalSearchParams<{ boardId?: string; stackId?: string }>();
  const boardsQuery = useDeckBoards();
  const createCard = useCreateDeckCard();
  const requestedBoardId = parseOptionalNumber(boardId);
  const requestedStackId = parseOptionalNumber(stackId);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(requestedBoardId);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const boards = boardsQuery.data ?? [];
  const activeBoardId = boards.some((board) => board.id === selectedBoardId)
    ? selectedBoardId
    : (boards[0]?.id ?? null);
  const boardQuery = useDeckBoard(activeBoardId);
  const stacks = useMemo(() => boardQuery.data?.stacks.filter((stack) => typeof stack.id === 'number') ?? [], [boardQuery.data]);

  async function handleSubmit(values: DeckCardFormValues) {
    if (activeBoardId == null) return;
    try {
      await createCard.mutateAsync({
        board_id: activeBoardId,
        stack_id: values.stack_id,
        title: values.title,
        description: values.description,
        duedate: values.duedate,
      });
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create the card.');
    }
  }

  if (boardsQuery.isLoading || boardQuery.isLoading) {
    return <Centered text="Loading Deck…" />;
  }

  if (!activeBoardId || stacks.length === 0) {
    return <Centered text="No Deck stacks available." />;
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive">
      <Stack.Screen options={{ title: 'New Card' }} />
      {boards.length > 1 ? (
        <View className="gap-2 px-4 pt-4">
          <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Board</Text>
          <View className="flex-row flex-wrap gap-2">
            {boards.map((board) => {
              const selected = board.id === activeBoardId;
              return (
                <Pressable key={board.id} onPress={() => setSelectedBoardId(board.id)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <View className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-2'}`} style={{ borderCurve: 'continuous' }}>
                    <Text className={`text-sm ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>{board.title}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <DeckCardForm
        key={`${activeBoardId}:${stacks.map((stack) => stack.id).join(',')}`}
        stacks={stacks}
        initial={{ stack_id: requestedStackId ?? (stacks[0].id as number) }}
        submitting={createCard.isPending}
        submitLabel={createCard.isPending ? 'Creating…' : 'Create Card'}
        onSubmit={handleSubmit}
      />
      <NativeAlert
        visible={errorMessage != null}
        title="Create failed"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </ScrollView>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View className="bg-sf-bg flex-1 items-center justify-center px-8">
      <Text className="text-sf-text-2 text-center">{text}</Text>
    </View>
  );
}

function parseOptionalNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
