import { useMemo, useState } from 'react';
import { Pressable, ScrollView as RNScrollView, useWindowDimensions } from 'react-native';

import { ApiError } from '@/api/client';
import type { DeckStack } from '@/api/types';
import { DeckCard } from '@/components/deck/deck-card';
import { Icon } from '@/components/ui/icon';
import { useDeckBoard, useDeckBoards } from '@/hooks/use-deck';
import { ScrollView, Text, View, useCSSVariable } from '@/tw';

export default function DeckScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const boardsQuery = useDeckBoards();
  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const activeBoardId = boards.some((board) => board.id === selectedBoardId)
    ? selectedBoardId
    : (boards[0]?.id ?? null);

  const boardQuery = useDeckBoard(activeBoardId);
  const stacks = boardQuery.data?.stacks ?? [];

  const boardSelector = useMemo(
    () =>
      boards.length > 0 ? (
        <RNScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
          {boards.map((board) => {
            const selected = board.id === activeBoardId;
            return (
              <Pressable
                key={board.id}
                onPress={() => setSelectedBoardId(board.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <View
                  className={`rounded-full px-4 py-1.5 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-2'}`}
                  style={{ borderCurve: 'continuous' }}>
                  <Text className={`text-sm ${selected ? 'text-white' : 'text-sf-text-2'}`}>
                    {board.title}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </RNScrollView>
      ) : null,
    [boards, activeBoardId]
  );

  if (boardsQuery.isLoading) {
    return <Centered text="Loading boards…" />;
  }

  if (boardsQuery.error) {
    const message =
      boardsQuery.error instanceof ApiError ? boardsQuery.error.message : 'Could not load Deck.';
    return <Centered text={message} iconName="exclamationmark.triangle" />;
  }

  if (boards.length === 0) {
    return <Centered text="No Deck boards found." iconName="rectangle.split.3x1" />;
  }

  return (
    <View className="bg-sf-bg flex-1">
      <View className="pt-2">{boardSelector}</View>

      {isWide ? (
        <RNScrollView
          horizontal
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ gap: 12, padding: 16 }}>
          {stacks.map((stack, index) => (
            <DeckColumn key={stack.id ?? index} stack={stack} wide />
          ))}
        </RNScrollView>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-4 px-4 pb-8">
          {stacks.map((stack, index) => (
            <DeckColumn key={stack.id ?? index} stack={stack} />
          ))}
        </ScrollView>
      )}

      {boardQuery.isLoading ? (
        <View className="absolute inset-x-0 top-16 items-center">
          <Text className="text-sf-text-2 text-sm">Loading cards…</Text>
        </View>
      ) : null}
    </View>
  );
}

function DeckColumn({ stack, wide }: { stack: DeckStack; wide?: boolean }) {
  const cards = stack.cards ?? [];
  return (
    <View className="gap-3" style={wide ? { width: 300 } : undefined}>
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-sf-text text-lg font-semibold">{stack.title ?? 'Stack'}</Text>
        <Text className="text-sf-text-3 text-sm" style={{ fontVariant: ['tabular-nums'] }}>
          {cards.length}
        </Text>
      </View>
      {cards.map((card, index) => (
        <DeckCard key={card.id ?? index} card={card} />
      ))}
      {cards.length === 0 ? <Text className="text-sf-text-3 px-1 text-sm">No cards</Text> : null}
    </View>
  );
}

function Centered({ text, iconName }: { text: string; iconName?: string }) {
  const blue = useCSSVariable('--sf-blue');
  return (
    <View className="bg-sf-bg flex-1 items-center justify-center gap-3 px-8">
      {iconName ? <Icon name={iconName as never} size={28} color={blue as string} /> : null}
      <Text selectable className="text-sf-text-2 text-center">
        {text}
      </Text>
    </View>
  );
}
