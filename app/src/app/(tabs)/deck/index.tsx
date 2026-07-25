import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView as RNScrollView, useWindowDimensions } from 'react-native';

import type { DeckCard as DeckCardType, DeckStack } from '@/api/types';
import { KanbanBoard, type CardMove } from '@/components/deck/kanban-board';
import { NewBoardChip } from '@/components/deck/new-board-chip';
import { useTheme } from '@/components/theme/context';
import { Fab } from '@/components/ui/fab';
import { Icon } from '@/components/ui/icon';
import { NativeAlert } from '@/components/ui/native-alert';
import { useDeckBoard, useDeckBoards, useReorderDeckCard } from '@/hooks/use-deck';
import { useUiStore } from '@/stores/ui-store';
import { useSyncStatusStore } from '@/stores/sync-status-store';
import { ScrollView, Text, View, useCSSVariable } from '@/tw';

export default function BoardsScreen() {
  const { colors } = useTheme();
  const blue = useCSSVariable('--sf-blue');
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const boardsQuery = useDeckBoards();
  const deckWarnings = useSyncStatusStore((state) => state.deckWarnings);
  const reorderCard = useReorderDeckCard();
  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);

  const selectedBoardId = useUiStore((s) => s.selectedBoardId);
  const setSelectedBoardId = useUiStore((s) => s.setSelectedBoardId);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeBoardId = boards.some((board) => board.id === selectedBoardId)
    ? selectedBoardId
    : (boards[0]?.id ?? null);

  const boardQuery = useDeckBoard(activeBoardId);
  const stacks = boardQuery.data?.stacks ?? [];
  const refreshing =
    (boardsQuery.isFetching && !boardsQuery.isLoading) ||
    (boardQuery.isFetching && !boardQuery.isLoading);

  function handleRefresh() {
    boardsQuery.refetch();
    if (activeBoardId != null) boardQuery.refetch();
  }

  function handleMoveCard(move: CardMove) {
    if (activeBoardId == null || typeof move.card.id !== 'number') return;
    reorderCard.mutate(
      {
        board_id: activeBoardId,
        stack_id: move.fromStackId,
        card_id: move.card.id,
        target_stack_id: move.toStackId,
        order: move.toIndex,
      },
      {
        onError: (error) =>
          setErrorMessage(error instanceof Error ? error.message : 'Could not move the card.'),
      }
    );
  }

  function handleOpenCard(stackId: number, card: DeckCardType) {
    if (activeBoardId == null || typeof card.id !== 'number') return;
    router.push({
      pathname: '/deck/card/[cardId]',
      params: { boardId: String(activeBoardId), stackId: String(stackId), cardId: String(card.id) },
    });
  }

  function handleAddCard(stackId: number) {
    if (activeBoardId == null) return;
    router.push({
      pathname: '/new-card',
      params: { boardId: String(activeBoardId), stackId: String(stackId) },
    });
  }

  function handleEditStack(stack: DeckStack) {
    if (activeBoardId == null || typeof stack.id !== 'number') return;
    const order = typeof stack.order === 'number' ? stack.order : 999;
    router.push({
      pathname: '/column',
      params: { boardId: String(activeBoardId), stackId: String(stack.id), title: stack.title ?? '', order: String(order) },
    });
  }

  function handleAddColumn() {
    if (activeBoardId == null) return;
    const order = (stacks.length + 1) * 10;
    router.push({
      pathname: '/column',
      params: { boardId: String(activeBoardId), order: String(order) },
    });
  }

  function handleAddTopCard() {
    if (activeBoardId == null) return;
    const firstStackId = stacks.find((stack) => typeof stack.id === 'number')?.id;
    router.push({
      pathname: '/new-card',
      params: { boardId: String(activeBoardId), ...(firstStackId ? { stackId: String(firstStackId) } : {}) },
    });
  }

  const boardSelector =
    boards.length > 0 ? (
      <RNScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
        {boards.map((board) => {
          const selected = board.id === activeBoardId;
          return (
            <Pressable
              key={board.id}
              onPress={() => setSelectedBoardId(board.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View
                className={`rounded-full px-4 py-1.5 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-2'}`}
                style={{ borderCurve: 'continuous' }}>
                <Text className={`text-sm ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>
                  {board.title}{boards.some((candidate) => candidate.account_id !== board.account_id) && board.account_name ? ` · ${board.account_name}` : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <NewBoardChip />
      </RNScrollView>
    ) : null;

  if (boardsQuery.isLoading) {
    return <Centered text="Loading boards…" refreshing={refreshing} onRefresh={handleRefresh} />;
  }

  if (boardsQuery.error) {
    const message =
      boardsQuery.error instanceof Error ? boardsQuery.error.message : 'Could not load your boards.';
    return <Centered text={message} iconName="alert-circle-outline" refreshing={refreshing} onRefresh={handleRefresh} />;
  }

  if (boards.length === 0) {
    return (
      <Centered text="No boards yet." iconName="view-column-outline" refreshing={refreshing} onRefresh={handleRefresh}>
        <NewBoardChip />
      </Centered>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={handleAddTopCard} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Icon name="plus" size={22} color={blue as string} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={[
          { paddingHorizontal: 24, paddingBottom: 112 },
          isWide ? { alignSelf: 'center', width: '100%', maxWidth: 720 } : null,
        ]}>
        <View style={{ marginHorizontal: -24 }}>{boardSelector}</View>
        {deckWarnings.length > 0 ? (
          <View className="bg-sf-bg-2 mb-3 flex-row items-start gap-3 rounded-xl px-3 py-3">
            <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={colors.orange} />
            <View className="flex-1 gap-1">
              <Text className="text-sf-text text-sm font-semibold">Some Deck accounts did not sync</Text>
              <Text selectable className="text-sf-text-2 text-xs">{deckWarnings[0]}</Text>
            </View>
          </View>
        ) : null}
        {boardQuery.isLoading ? (
          <View className="items-center py-16">
            <Text className="text-sf-text-2 text-sm">Loading cards…</Text>
          </View>
        ) : boardQuery.isError ? (
          <View className="items-center gap-3 py-16">
            <Text selectable className="text-sf-red text-center text-sm">
              {boardQuery.error instanceof Error ? boardQuery.error.message : 'Could not load this board.'}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => boardQuery.refetch()}>
              <Text className="text-sf-blue text-base font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <KanbanBoard
            stacks={stacks}
            indicatorColor={colors.accent}
            onMoveCard={handleMoveCard}
            onOpenCard={handleOpenCard}
            onAddCard={handleAddCard}
            onEditStack={handleEditStack}
            onAddColumn={handleAddColumn}
          />
        )}
      </ScrollView>

      {process.env.EXPO_OS === 'android' ? (
        <Fab onPress={handleAddTopCard} accessibilityLabel="Add card" />
      ) : null}
      <NativeAlert
        visible={errorMessage != null}
        title="Could not move card"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </>
  );
}

function Centered({
  text,
  iconName,
  refreshing,
  onRefresh,
  children,
}: {
  text: string;
  iconName?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  refreshing: boolean;
  onRefresh: () => void;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const bg = useCSSVariable('--sf-bg');
  return (
    <RNScrollView
      style={{ flex: 1, backgroundColor: bg as string }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View className="items-center gap-3">
        {iconName ? <MaterialCommunityIcons name={iconName} size={28} color={colors.accent} /> : null}
        <Text selectable className="text-sf-text-2 text-center">
          {text}
        </Text>
        {children}
      </View>
    </RNScrollView>
  );
}
