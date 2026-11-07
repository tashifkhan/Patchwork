import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import type { DeckCard, DeckStack } from '@/api/types';
import {
  DetailRow,
  DetailsCard,
  EDITOR_CONTENT,
  EditorHeading,
  EditorNotes,
  EditorPrimaryButton,
  EditorTitle,
} from '@/components/boards/item-editor';
import { PickerSheet } from '@/components/boards/picker-sheet';
import { MoveToTasks } from '@/components/deck/move-to-tasks';
import { HeaderTextButton } from '@/components/settings/settings-list';
import { DateField } from '@/components/tasks/date-field';
import { TaskActionBar } from '@/components/tasks/task-action-bar';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { useDeckBoard, useDeleteDeckCard, useUpdateDeckCard } from '@/hooks/use-deck';
import { haptics } from '@/lib/haptics';
import { useTabBarFabOffset } from '@/lib/tab-bar';
import { ScrollView, Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

/**
 * A Deck card, laid out like the New To-Do sheet: big title, live Markdown
 * description, and one card of details (column, due date, move to Tasks).
 * Nothing is sent until Save.
 */
export default function DeckCardDetailScreen() {
  const { boardId, stackId, cardId } = useLocalSearchParams<{ boardId?: string; stackId?: string; cardId?: string }>();
  const boardNumber = parseRequiredNumber(boardId);
  const stackNumber = parseRequiredNumber(stackId);
  const cardNumber = parseRequiredNumber(cardId);
  const boardQuery = useDeckBoard(boardNumber);

  const stacks = boardQuery.data?.stacks ?? [];
  const found = findCard(stacks, stackNumber, cardNumber);

  if (boardQuery.isLoading) {
    return <LoadingState message="Loading card…" subtitle="Opening from Deck" />;
  }
  if (!found || boardNumber == null || stackNumber == null || cardNumber == null) {
    return (
      <View className="bg-sf-bg flex-1 items-center justify-center px-8">
        <Stack.Screen options={{ title: 'Card' }} />
        <Text className="text-sf-text-2 text-center">Card not found.</Text>
      </View>
    );
  }
  return (
    <CardEditor
      key={found.card.id ?? cardNumber}
      boardId={boardNumber}
      stackId={stackNumber}
      cardId={cardNumber}
      card={found.card}
      stacks={stacks}
    />
  );
}

function CardEditor({
  boardId,
  stackId,
  cardId,
  card,
  stacks,
}: {
  boardId: number;
  stackId: number;
  cardId: number;
  card: DeckCard;
  stacks: DeckStack[];
}) {
  const updateCard = useUpdateDeckCard();
  const deleteCard = useDeleteDeckCard();
  const [title, setTitle] = useState(card.title ?? '');
  const [description, setDescription] = useState(card.description ?? '');
  const [duedate, setDuedate] = useState<string | null>(card.duedate ?? null);
  const [targetStackId, setTargetStackId] = useState(stackId);
  const [columnOpen, setColumnOpen] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const barBottom = useTabBarFabOffset();

  const columns = stacks.filter((stack): stack is DeckStack & { id: number } => typeof stack.id === 'number');
  const column = columns.find((stack) => stack.id === targetStackId);
  const dirty =
    title !== (card.title ?? '') ||
    description !== (card.description ?? '') ||
    duedate !== (card.duedate ?? null) ||
    targetStackId !== stackId;
  const canSave = dirty && title.trim().length > 0 && !updateCard.isPending;

  async function save() {
    if (!canSave) return;
    try {
      await updateCard.mutateAsync({
        board_id: boardId,
        stack_id: stackId,
        card_id: cardId,
        title: title.trim(),
        description,
        duedate,
        target_stack_id: targetStackId,
      });
      haptics.success();
      router.back();
    } catch (error) {
      haptics.error();
      setErrorMessage(error instanceof Error ? error.message : 'Could not update the card.');
    }
  }

  async function confirmDelete() {
    setDeleteVisible(false);
    try {
      await deleteCard.mutateAsync({ board_id: boardId, stack_id: stackId, card_id: cardId });
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the card.');
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: column?.title ?? 'Card',
          ...(IOS
            ? {
                headerRight: () => (
                  <HeaderTextButton label="Save" onPress={save} disabled={!canSave} loading={updateCard.isPending} />
                ),
              }
            : {}),
        }}
      />
      <ScrollView
        className="bg-sf-bg flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={IOS}
        contentContainerStyle={{ ...EDITOR_CONTENT, paddingBottom: barBottom + 96 }}>
        <EditorTitle value={title} onChangeText={setTitle} placeholder="Card title" />
        <EditorNotes value={description} onChangeText={setDescription} placeholder="Description" />

        <EditorHeading title="Details" />
        <DetailsCard>
          <DetailRow
            icon="view-column-outline"
            label="Column"
            value={column?.title ?? 'Column'}
            onPress={() => setColumnOpen(true)}
          />
          <View style={{ paddingVertical: 12 }}>
            <DateField label="Due date" iconName="flag-outline" value={duedate} onChange={setDuedate} />
          </View>
          <MoveToTasks
            boardId={boardId}
            stackId={stackId}
            cardId={cardId}
            title={title.trim() || (card.title ?? 'Untitled')}
            description={description}
            duedate={duedate}
          />
        </DetailsCard>

        {!IOS ? (
          <EditorPrimaryButton
            label="Save changes"
            busyLabel="Saving…"
            busy={updateCard.isPending}
            disabled={!canSave}
            onPress={save}
          />
        ) : null}
      </ScrollView>

      <TaskActionBar
        bottom={barBottom}
        onMove={() => setColumnOpen(true)}
        onDelete={() => setDeleteVisible(true)}
        deleteLabel="Delete card"
      />

      <PickerSheet
        visible={columnOpen}
        title="Column"
        items={columns.map((stack) => ({
          key: String(stack.id),
          label: stack.title ?? 'Column',
          subtitle: `${stack.cards?.length ?? 0} cards`,
          icon: 'view-column-outline' as const,
          selected: stack.id === targetStackId,
          onPress: () => {
            haptics.selection();
            setTargetStackId(stack.id);
            setColumnOpen(false);
          },
        }))}
        onClose={() => setColumnOpen(false)}
      />
      <NativeAlert
        visible={deleteVisible}
        title="Delete card?"
        message={`"${card.title ?? 'Untitled'}" is removed from Deck.`}
        confirmLabel="Delete"
        dismissLabel="Cancel"
        onDismiss={() => setDeleteVisible(false)}
        onConfirm={confirmDelete}
      />
      <NativeAlert
        visible={errorMessage != null}
        title="Deck"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </>
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
