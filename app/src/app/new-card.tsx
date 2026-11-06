import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';

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
import { NewBoardChip } from '@/components/deck/new-board-chip';
import { HeaderTextButton } from '@/components/settings/settings-list';
import { DateField } from '@/components/tasks/date-field';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useCreateDeckCard, useDeckBoard, useDeckBoards } from '@/hooks/use-deck';
import { haptics } from '@/lib/haptics';
import { ScrollView, Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

/**
 * New Deck card, laid out like the New To-Do sheet: big title, live Markdown
 * description, then board, column and due date in one details card.
 */
export default function NewCardScreen() {
  const { boardId, stackId } = useLocalSearchParams<{ boardId?: string; stackId?: string }>();
  const requestedBoardId = parseOptionalNumber(boardId);
  const requestedStackId = parseOptionalNumber(stackId);
  const boardsQuery = useDeckBoards();
  const createCard = useCreateDeckCard();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duedate, setDuedate] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(requestedBoardId);
  const [selectedStackId, setSelectedStackId] = useState<number | null>(requestedStackId);
  const [picker, setPicker] = useState<'board' | 'column' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const boards = boardsQuery.data ?? [];
  const activeBoardId = boards.some((board) => board.id === selectedBoardId)
    ? selectedBoardId
    : (boards[0]?.id ?? null);
  const activeBoard = boards.find((board) => board.id === activeBoardId);
  const boardQuery = useDeckBoard(activeBoardId);
  const columns = useMemo(
    () =>
      (boardQuery.data?.stacks ?? []).filter(
        (stack): stack is typeof stack & { id: number } => typeof stack.id === 'number'
      ),
    [boardQuery.data]
  );
  const column = columns.find((stack) => stack.id === selectedStackId) ?? columns[0];
  const canCreate = title.trim().length > 0 && activeBoardId != null && column != null && !createCard.isPending;

  async function create() {
    if (!canCreate || activeBoardId == null || !column) return;
    try {
      await createCard.mutateAsync({
        board_id: activeBoardId,
        stack_id: column.id,
        title: title.trim(),
        description: description.trim(),
        duedate,
      });
      haptics.success();
      router.back();
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : 'Could not create the card.');
    }
  }

  if (boardsQuery.isLoading) {
    return (
      <SheetSurface title="New Card">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <LoadingState message="Loading boards…" fullScreen={false} />
        </View>
      </SheetSurface>
    );
  }

  if (boards.length === 0) {
    return (
      <SheetSurface title="New Card">
        <View className="gap-4 px-5 py-10">
          <Text className="text-sf-text-2 text-center">No Deck boards yet. Create one to add cards.</Text>
          <NewBoardChip />
        </View>
      </SheetSurface>
    );
  }

  return (
    <SheetSurface title="New Card">
      {IOS ? (
        <Stack.Screen
          options={{
            headerLeft: () => <HeaderTextButton label="Cancel" bold={false} onPress={() => router.back()} />,
            headerRight: () => (
              <HeaderTextButton label="Add" onPress={create} disabled={!canCreate} loading={createCard.isPending} />
            ),
          }}
        />
      ) : null}
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={IOS}
        contentContainerStyle={{ ...EDITOR_CONTENT, paddingBottom: 32 }}>
        <EditorTitle value={title} onChangeText={setTitle} placeholder="New Card" autoFocus />
        <EditorNotes value={description} onChangeText={setDescription} placeholder="Description" />

        <EditorHeading title="Details" />
        <DetailsCard>
          <DetailRow
            icon="view-dashboard-outline"
            label="Board"
            value={activeBoard?.title ?? 'Board'}
            onPress={() => setPicker('board')}
          />
          <DetailRow
            icon="view-column-outline"
            label="Column"
            value={boardQuery.isLoading ? 'Loading…' : (column?.title ?? 'No columns')}
            onPress={columns.length > 0 ? () => setPicker('column') : undefined}
          />
          <View style={{ paddingVertical: 12 }}>
            <DateField label="Due date" iconName="flag-outline" value={duedate} onChange={setDuedate} />
          </View>
        </DetailsCard>

        {!IOS ? (
          <EditorPrimaryButton
            label="Add card"
            busyLabel="Adding…"
            icon="plus"
            busy={createCard.isPending}
            disabled={!canCreate}
            onPress={create}
          />
        ) : null}
      </ScrollView>

      <PickerSheet
        visible={picker === 'board'}
        title="Board"
        items={boards.map((board) => ({
          key: String(board.id),
          label: board.title,
          subtitle: board.account_name,
          icon: 'view-dashboard-outline' as const,
          selected: board.id === activeBoardId,
          onPress: () => {
            haptics.selection();
            setSelectedBoardId(board.id);
            setSelectedStackId(null);
            setPicker(null);
          },
        }))}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'column'}
        title="Column"
        items={columns.map((stack) => ({
          key: String(stack.id),
          label: stack.title ?? 'Column',
          icon: 'view-column-outline' as const,
          selected: stack.id === column?.id,
          onPress: () => {
            haptics.selection();
            setSelectedStackId(stack.id);
            setPicker(null);
          },
        }))}
        onClose={() => setPicker(null)}
      />
      <NativeAlert
        visible={error != null}
        title="Could not add"
        message={error ?? ''}
        onDismiss={() => setError(null)}
      />
    </SheetSurface>
  );
}

function parseOptionalNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
