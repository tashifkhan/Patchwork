import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import { DeckCardForm, type DeckCardFormValues } from '@/components/deck/deck-card-form';
import { NewBoardChip } from '@/components/deck/new-board-chip';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useCreateDeckCard, useDeckBoard, useDeckBoards } from '@/hooks/use-deck';
import { ScrollView, Text, View } from '@/tw';

export default function NewDeckScreen() {
  const { boardId, stackId } = useLocalSearchParams<{ boardId?: string; stackId?: string }>();

  return (
    <SheetSurface>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive">
        <Stack.Screen options={{ title: 'New Card' }} />
        <NewCardBody boardId={boardId} stackId={stackId} />
      </ScrollView>
    </SheetSurface>
  );
}

function NewCardBody({ boardId, stackId }: { boardId?: string; stackId?: string }) {
  const requestedBoardId = parseOptionalNumber(boardId);
  const requestedStackId = parseOptionalNumber(stackId);
  const boardsQuery = useDeckBoards();
  const createCard = useCreateDeckCard();
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(requestedBoardId);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const boards = boardsQuery.data ?? [];
  const activeBoardId = boards.some((board) => board.id === selectedBoardId)
    ? selectedBoardId
    : (boards[0]?.id ?? null);
  const boardQuery = useDeckBoard(activeBoardId);
  const stacks = useMemo(
    () => boardQuery.data?.stacks.filter((stack) => typeof stack.id === 'number') ?? [],
    [boardQuery.data]
  );

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
      setAlert({ title: 'Create failed', message: error instanceof Error ? error.message : 'Could not create the card.' });
    }
  }

  if (boardsQuery.isLoading || (activeBoardId != null && boardQuery.isLoading)) {
    return <Centered text="Loading Deck…" />;
  }

  if (activeBoardId == null || stacks.length === 0) {
    return (
      <View className="gap-4 px-4 py-8">
        <Centered text={activeBoardId == null ? 'No Deck boards found.' : 'No Deck stacks available.'} />
        {activeBoardId == null ? <NewBoardChip /> : null}
        <BoardAlert alert={alert} onDismiss={() => setAlert(null)} />
      </View>
    );
  }

  return (
    <>
      {boards.length > 0 ? (
        <View className="gap-2 px-4 pt-4">
          <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Board</Text>
          <View className="flex-row flex-wrap gap-2">
            {boards.map((board) => {
              const selected = board.id === activeBoardId;
              return (
                <Pressable
                  key={board.id}
                  onPress={() => setSelectedBoardId(board.id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <View
                    className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-2'}`}
                    style={{ borderCurve: 'continuous' }}>
                    <Text className={`text-sm ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>
                      {board.title}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            <NewBoardChip />
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
      <BoardAlert alert={alert} onDismiss={() => setAlert(null)} />
    </>
  );
}

function BoardAlert({
  alert,
  onDismiss,
}: {
  alert: { title: string; message: string } | null;
  onDismiss: () => void;
}) {
  return (
    <NativeAlert
      visible={alert != null}
      title={alert?.title ?? ''}
      message={alert?.message ?? ''}
      onDismiss={onDismiss}
    />
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View className="items-center justify-center px-8 py-16">
      <Text className="text-sf-text-2 text-center">{text}</Text>
    </View>
  );
}

function parseOptionalNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
