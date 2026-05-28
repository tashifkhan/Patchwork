import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { DeckCard, DeckStack } from '@/api/types';
import { DeckCardForm, type DeckCardFormValues } from '@/components/deck/deck-card-form';
import { NativeAlert } from '@/components/ui/native-alert';
import { useDeckBoard, useDeleteDeckCard, useUpdateDeckCard } from '@/hooks/use-deck';
import { ScrollView, Text, View } from '@/tw';

export default function DeckCardDetailScreen() {
  const { boardId, stackId, cardId } = useLocalSearchParams<{ boardId?: string; stackId?: string; cardId?: string }>();
  const boardNumber = parseRequiredNumber(boardId);
  const stackNumber = parseRequiredNumber(stackId);
  const cardNumber = parseRequiredNumber(cardId);
  const boardQuery = useDeckBoard(boardNumber);
  const updateCard = useUpdateDeckCard();
  const deleteCard = useDeleteDeckCard();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const found = findCard(boardQuery.data?.stacks ?? [], stackNumber, cardNumber);
  const card = found?.card ?? null;
  const stack = found?.stack ?? null;

  async function handleSubmit(values: DeckCardFormValues) {
    if (!card || boardNumber == null || stackNumber == null || cardNumber == null) return;
    try {
      await updateCard.mutateAsync({
        board_id: boardNumber,
        stack_id: stackNumber,
        card_id: cardNumber,
        title: values.title,
        description: values.description,
        duedate: values.duedate,
      });
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update the card.');
    }
  }

  async function confirmDelete() {
    if (boardNumber == null || stackNumber == null || cardNumber == null) return;
    setDeleteVisible(false);
    try {
      await deleteCard.mutateAsync({ board_id: boardNumber, stack_id: stackNumber, card_id: cardNumber });
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the card.');
    }
  }

  if (boardQuery.isLoading) {
    return <Centered text="Loading card…" />;
  }

  if (!card || !stack || stackNumber == null) {
    return <Centered text="Card not found." />;
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive">
      <Stack.Screen options={{ title: stack.title ?? 'Card' }} />
      <DeckCardForm
        key={card.id ?? cardNumber}
        stacks={[stack]}
        initial={{
          title: card.title ?? '',
          description: card.description ?? '',
          stack_id: stackNumber,
          duedate: card.duedate ?? null,
        }}
        submitting={updateCard.isPending}
        submitLabel={updateCard.isPending ? 'Saving…' : 'Save Changes'}
        onSubmit={handleSubmit}
        onDelete={() => setDeleteVisible(true)}
      />
      <NativeAlert
        visible={deleteVisible}
        title="Delete card"
        message={`Delete “${card.title ?? 'Untitled'}”?`}
        confirmLabel="Delete"
        dismissLabel="Cancel"
        onDismiss={() => setDeleteVisible(false)}
        onConfirm={confirmDelete}
      />
      <NativeAlert
        visible={errorMessage != null}
        title="Deck error"
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

function findCard(stacks: DeckStack[], stackId: number | null, cardId: number | null): { stack: DeckStack; card: DeckCard } | null {
  if (stackId == null || cardId == null) return null;
  for (const stack of stacks) {
    if (stack.id !== stackId) continue;
    const card = stack.cards?.find((item) => item.id === cardId);
    if (card) return { stack, card };
  }
  return null;
}

function parseRequiredNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
