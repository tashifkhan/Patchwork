import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import type { DeckCard, DeckStack } from '@/api/types';
import { DeckCardForm, type DeckCardFormValues } from '@/components/deck/deck-card-form';
import { MoveToTasks } from '@/components/deck/move-to-tasks';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { useDeckBoard, useDeleteDeckCard, useReorderDeckCard, useUpdateDeckCard } from '@/hooks/use-deck';
import { ScrollView, Text, View } from '@/tw';

export default function DeckCardDetailScreen() {
  const { colors } = useTheme();
  const { boardId, stackId, cardId } = useLocalSearchParams<{ boardId?: string; stackId?: string; cardId?: string }>();
  const boardNumber = parseRequiredNumber(boardId);
  const stackNumber = parseRequiredNumber(stackId);
  const cardNumber = parseRequiredNumber(cardId);
  const boardQuery = useDeckBoard(boardNumber);
  const updateCard = useUpdateDeckCard();
  const reorderCard = useReorderDeckCard();
  const deleteCard = useDeleteDeckCard();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const stacks = boardQuery.data?.stacks ?? [];
  const found = findCard(stacks, stackNumber, cardNumber);
  const card = found?.card ?? null;
  const stack = found?.stack ?? null;
  const stackIndex = stacks.findIndex((item) => item.id === stackNumber);
  const previousStack = stackIndex > 0 ? stacks[stackIndex - 1] : null;
  const nextStack = stackIndex >= 0 ? stacks[stackIndex + 1] : null;
  const movingOrSaving = updateCard.isPending || reorderCard.isPending;

  async function handleSubmit(values: DeckCardFormValues) {
    if (!card || boardNumber == null || stackNumber == null || cardNumber == null) return;
    const targetStack = stacks.find((item) => item.id === values.stack_id);
    const targetStackId = typeof targetStack?.id === 'number' ? targetStack.id : stackNumber;
    const contentChanged =
      values.title !== (card.title ?? '') ||
      values.description !== (card.description ?? '') ||
      values.duedate !== (card.duedate ?? null);
    try {
      if (contentChanged) {
        await updateCard.mutateAsync({
          board_id: boardNumber,
          stack_id: stackNumber,
          card_id: cardNumber,
          title: values.title,
          description: values.description,
          duedate: values.duedate,
        });
      }
      if (targetStackId !== stackNumber) {
        await reorderCard.mutateAsync({
          board_id: boardNumber,
          stack_id: stackNumber,
          card_id: cardNumber,
          target_stack_id: targetStackId,
          order: targetStack?.cards?.length ?? 0,
        });
      }
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update the card.');
    }
  }

  async function moveToStack(targetStack: DeckStack | null) {
    if (!targetStack || typeof targetStack.id !== 'number' || !card || boardNumber == null || stackNumber == null || cardNumber == null) return;
    try {
      await reorderCard.mutateAsync({
        board_id: boardNumber,
        stack_id: stackNumber,
        card_id: cardNumber,
        target_stack_id: targetStack.id,
        order: targetStack.cards?.length ?? 0,
      });
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not move the card.');
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

  if (!card || !stack || stackNumber == null || cardNumber == null) {
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
        stacks={stacks}
        initial={{
          title: card.title ?? '',
          description: card.description ?? '',
          stack_id: stackNumber,
          duedate: card.duedate ?? null,
        }}
        submitting={movingOrSaving}
        submitLabel={movingOrSaving ? 'Saving…' : 'Save Changes'}
        onSubmit={handleSubmit}
        onDelete={() => setDeleteVisible(true)}
      />
      <View className="gap-2 px-4 pb-4">
        <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Kanban movement</Text>
        <View className="flex-row gap-3">
          <MoveButton
            label={previousStack?.title ? `Demote to ${previousStack.title}` : 'Demote'}
            disabled={!previousStack || movingOrSaving}
            onPress={() => moveToStack(previousStack)}
            color={colors.text2 as string}
          />
          <MoveButton
            label={nextStack?.title ? `Promote to ${nextStack.title}` : 'Promote'}
            disabled={!nextStack || movingOrSaving}
            onPress={() => moveToStack(nextStack)}
            color={colors.accent as string}
          />
        </View>
      </View>
      {boardNumber != null ? (
        <MoveToTasks
          boardId={boardNumber}
          stackId={stackNumber}
          cardId={cardNumber}
          title={card.title ?? 'Untitled'}
          description={card.description ?? ''}
          duedate={card.duedate ?? null}
        />
      ) : null}
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

function MoveButton({ label, disabled, onPress, color }: { label: string; disabled: boolean; onPress: () => void; color: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ flex: 1, opacity: disabled ? 0.35 : pressed ? 0.75 : 1 })}>
      <View className="bg-sf-bg-2 items-center rounded-xl px-3 py-3" style={{ borderCurve: 'continuous' }}>
        <Text className="text-center text-base font-semibold" style={{ color }}>
          {label}
        </Text>
      </View>
    </Pressable>
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
