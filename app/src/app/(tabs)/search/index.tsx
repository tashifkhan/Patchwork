import { Stack, router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import { TagChipList } from '@/components/tasks/tag-chip-list';
import { Icon } from '@/components/ui/icon';
import { useAllDeckCards, useDeckBoards } from '@/hooks/use-deck';
import { useTasks } from '@/hooks/use-tasks';
import { buildSearchNodes, createSearchIndex, type SearchNode } from '@/lib/search';
import { Text, TextInput, View, useCSSVariable } from '@/tw';

const TYPE_ICON: Record<SearchNode['type'], string> = {
  task: 'checklist',
  subtask: 'arrow.turn.down.right',
  'deck-card': 'rectangle.split.3x1',
};

const MD_TYPE_ICON: Record<SearchNode['type'], string> = {
  task: 'checkbox-marked-circle-outline',
  subtask: 'subdirectory-arrow-right',
  'deck-card': 'card-text-outline',
};

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const textSecondary = useCSSVariable('--sf-text-2');

  const tasksQuery = useTasks();
  const boardsQuery = useDeckBoards();
  const deckCards = useAllDeckCards(boardsQuery.data ?? []);

  const nodes = useMemo(
    () => buildSearchNodes(tasksQuery.data ?? [], deckCards),
    [tasksQuery.data, deckCards]
  );
  const fuse = useMemo(() => createSearchIndex(nodes), [nodes]);

  const results = useMemo(() => {
    const trimmed = deferredQuery.trim();
    if (!trimmed) return [];
    return fuse.search(trimmed, { limit: 50 }).map((r) => r.item);
  }, [fuse, deferredQuery]);

  function openNode(node: SearchNode) {
    if (node.type === 'deck-card') {
      router.push('/deck');
    } else if (node.taskUid) {
      router.push(`/task/${encodeURIComponent(node.taskUid)}`);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: Platform.OS === 'ios' ? {
            placeholder: 'Search tasks and cards',
            onChangeText: (e) => setQuery(e.nativeEvent.text),
            hideWhenScrolling: false,
          } : undefined,
        }}
      />
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          Platform.OS !== 'ios' ? (
            <View className="py-3">
              <View className="bg-sf-bg-2 flex-row items-center rounded-2xl px-3.5 py-1" style={{ borderCurve: 'continuous' }}>
                <MaterialCommunityIcons name="magnify" size={20} color={textSecondary as string} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search tasks and cards"
                  placeholderTextColor={textSecondary as string}
                  className="text-sf-text flex-1 px-2.5 py-2.5 text-base"
                  style={{ includeFontPadding: false }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={textSecondary as string} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openNode(item)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View className="border-sf-separator flex-row items-center gap-3 border-b py-3">
              {Platform.OS === 'ios' ? (
                <Icon name={TYPE_ICON[item.type] as never} size={18} color={textSecondary as string} />
              ) : (
                <MaterialCommunityIcons name={MD_TYPE_ICON[item.type] as any} size={18} color={textSecondary as string} />
              )}
              <View className="flex-1 gap-1">
                <Text numberOfLines={1} className="text-sf-text text-base">
                  {item.title}
                </Text>
                <Text numberOfLines={1} className="text-sf-text-2 text-xs">
                  {item.parentTitle ? `${item.parentTitle} · ` : ''}
                  {item.listName}
                </Text>
                {item.tags.length > 0 ? (
                  <TagChipList tags={item.tags.slice(0, 4)} scrollable={false} />
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="items-center gap-2 py-20">
            {Platform.OS === 'ios' ? (
              <Icon name="magnifyingglass" size={28} color={textSecondary as string} />
            ) : (
              <MaterialCommunityIcons name="magnify" size={28} color={textSecondary as string} />
            )}
            <Text className="text-sf-text-2 text-center">
              {query.trim() ? 'No matches found.' : 'Search across tasks, subtasks, and Deck cards.'}
            </Text>
          </View>
        }
      />
    </>
  );
}
