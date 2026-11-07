import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { updateDeckStack } from '@/api/deck';
import type { DeckBoardDetail, DeckStack } from '@/api/types';
import { DraggableColumn } from '@/components/tasks/draggable-column';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useDeckBoard } from '@/hooks/use-deck';
import { haptics } from '@/lib/haptics';
import { queryKeys } from '@/lib/query-client';
import { ScrollView, Text, View } from '@/tw';

type Column = DeckStack & { id: number };

/**
 * Put a Deck board's columns in a new order: hold a row and drag it. Nothing
 * is sent until Save, then each column whose place changed gets its new
 * position, spaced by 10 like new columns are.
 */
export default function ReorderColumnsScreen() {
  const { colors } = useTheme();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ boardId?: string }>();
  const boardId = Number(params.boardId);
  const board = useDeckBoard(Number.isFinite(boardId) ? boardId : null);
  const original = (board.data?.stacks ?? []).filter((stack): stack is Column => typeof stack.id === 'number');

  const [draft, setDraft] = useState<Column[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const columns = draft ?? original;
  const changed = draft != null && draft.some((stack, index) => stack.id !== original[index]?.id);

  async function save() {
    if (!changed || saving || !draft) return;
    setSaving(true);
    const key = queryKeys.deckBoard(boardId);
    const previous = client.getQueryData<DeckBoardDetail>(key);
    // Show the new order on the board straight away.
    if (previous) client.setQueryData<DeckBoardDetail>(key, { ...previous, stacks: draft });
    try {
      for (const [index, stack] of draft.entries()) {
        if (original[index]?.id === stack.id) continue;
        await updateDeckStack({
          board_id: boardId,
          stack_id: stack.id,
          title: stack.title ?? '',
          order: (index + 1) * 10,
        });
      }
      haptics.success();
      router.back();
    } catch (error) {
      haptics.error();
      if (previous) client.setQueryData(key, previous);
      setErrorMessage(error instanceof Error ? error.message : 'Could not save the new order.');
    } finally {
      setSaving(false);
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: queryKeys.deckBoards });
    }
  }

  return (
    <SheetSurface title="Reorder columns" subtitle="Hold a column and drag it to a new place">
      <Stack.Screen options={{ title: 'Reorder Columns' }} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4">
          {board.isLoading ? (
            <Text className="text-sf-text-2 py-6 text-center">Loading columns…</Text>
          ) : (
            <DraggableColumn
              data={columns}
              keyExtractor={(stack) => String(stack.id)}
              onReorder={setDraft}
              indicatorColor={colors.accent}
              dragEnabled={!saving}
              renderItem={(stack) => (
                <View
                  className="flex-row items-center"
                  style={{
                    gap: 12,
                    marginBottom: 8,
                    minHeight: 56,
                    paddingHorizontal: 16,
                    borderRadius: 16,
                    borderCurve: 'continuous',
                    backgroundColor: colors.bg3,
                  }}>
                  <MaterialCommunityIcons name="drag-horizontal-variant" size={22} color={colors.text3} />
                  <Text numberOfLines={1} className="text-sf-text flex-1 text-base font-medium">
                    {stack.title || 'Untitled'}
                  </Text>
                  <Text className="text-sf-text-2 text-sm">{stack.cards?.length ?? 0}</Text>
                </View>
              )}
            />
          )}
        </View>

        <View className="gap-3 px-5 pt-6">
          <Button
            label={saving ? 'Saving…' : 'Save order'}
            disabled={!changed || saving}
            loading={saving}
            onPress={save}
          />
        </View>

        <NativeAlert
          visible={errorMessage != null}
          title="Columns"
          message={errorMessage ?? ''}
          onDismiss={() => setErrorMessage(null)}
        />
      </ScrollView>
    </SheetSurface>
  );
}
