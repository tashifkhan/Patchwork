import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView as RNScrollView, useWindowDimensions } from 'react-native';

import { ApiError } from '@/api/client';
import type { DeckCard as DeckCardType, DeckStack } from '@/api/types';
import { KanbanBoard, type CardMove } from '@/components/deck/kanban-board';
import { NewBoardChip } from '@/components/deck/new-board-chip';
import { useTheme } from '@/components/theme/context';
import { EmptyState } from '@/components/ui/empty-state';
import { Fab } from '@/components/ui/fab';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { useDeckBoard, useDeckBoards, useReorderDeckCard } from '@/hooks/use-deck';
import { useTabBarContentPadding, useTabBarMinimizeOnScroll } from '@/lib/tab-bar';
import { useUiStore } from '@/stores/ui-store';
import { useSyncStatusStore } from '@/stores/sync-status-store';
import { ScrollView, Text, View, useCSSVariable } from '@/tw';

export default function BoardsScreen() {
  const { colors } = useTheme();
  const blue = useCSSVariable('--sf-blue');
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const onTabBarScroll = useTabBarMinimizeOnScroll();
  const contentBottom = useTabBarContentPadding(112);

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
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <LoadingState
          message="Loading boards…"
          subtitle="Syncing Deck from your servers"
        />
      </View>
    );
  }

  if (boardsQuery.error || boards.length === 0) {
    // Plain flex View (not ScrollView): iOS large-title content insets make
    // flexGrow + justifyContent center land the empty state in the lower half.
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <BoardsEmptyState
          error={boardsQuery.error}
          onRetry={handleRefresh}
          onConnect={() => router.push('/settings/account')}
          onAdd={() => router.push('/new-board')}
        />
      </View>
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
        scrollEventThrottle={16}
        onScroll={onTabBarScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={[
          { paddingHorizontal: 24, paddingBottom: contentBottom },
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
          <LoadingState message="Loading cards…" subtitle="Syncing this board" fullScreen={false} />
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

function BoardsEmptyState({
  error,
  onRetry,
  onConnect,
  onAdd,
}: {
  error: unknown;
  onRetry: () => void;
  onConnect: () => void;
  onAdd: () => void;
}) {
  if (error) {
    const message =
      error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Could not load boards.';
    const needsAccount =
      error instanceof ApiError &&
      (error.status === 503 ||
        /no caldav accounts|not configured|no account/i.test(message));

    if (needsAccount) {
      return (
        <EmptyState
          icon="cloud-outline"
          title="Connect a CalDAV account"
          subtitle="Patchwork syncs boards from Nextcloud Deck. Add a CalDAV account to get started."
          actions={[
            { label: 'Connect account', onPress: onConnect, variant: 'filled' },
            { label: 'Retry', onPress: onRetry, variant: 'tonal' },
          ]}
        />
      );
    }

    return (
      <EmptyState
        icon="cloud-alert-outline"
        title="Couldn't load boards"
        subtitle={message}
        actions={[
          { label: 'Retry', onPress: onRetry, variant: 'filled' },
          { label: 'Connect account', onPress: onConnect, variant: 'tonal' },
        ]}
      />
    );
  }

  return (
    <EmptyState
      icon="view-column-outline"
      title="No boards yet"
      subtitle={
        Platform.OS === 'web'
          ? 'Create a board to start organizing cards in columns.'
          : 'Tap + to add your first board, or pull down to refresh.'
      }
      actions={
        Platform.OS !== 'web'
          ? [{ label: 'Add board', onPress: onAdd, variant: 'filled' }]
          : undefined
      }>
      {Platform.OS === 'web' ? <NewBoardChip /> : null}
    </EmptyState>
  );
}


