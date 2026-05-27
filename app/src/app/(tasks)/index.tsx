import { Link, Stack, router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl } from 'react-native';

import { ApiError } from '@/api/client';
import type { Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { TagChipList } from '@/components/tasks/tag-chip-list';
import { TaskItem } from '@/components/tasks/task-item';
import { Icon } from '@/components/ui/icon';
import { useTaskLists, useTasks, useUpdateTask } from '@/hooks/use-tasks';
import { useUiStore } from '@/stores/ui-store';
import { Text, View, useCSSVariable } from '@/tw';

function collectTags(tasks: Task[]): string[] {
  const set = new Set<string>();
  const walk = (items: Task[]) => {
    for (const item of items) {
      item.tags.forEach((tag) => set.add(tag));
      walk(item.children);
    }
  };
  walk(tasks);
  return [...set].sort();
}

export default function TasksScreen() {
  const { colors } = useTheme();
  const blue = useCSSVariable('--sf-blue');
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const updateTask = useUpdateTask();

  const selectedListId = useUiStore((s) => s.selectedListId);
  const selectedTag = useUiStore((s) => s.selectedTag);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);
  const setSelectedTag = useUiStore((s) => s.setSelectedTag);

  const lists = useMemo(
    () => (listsQuery.data ?? []).filter((list) => !list.is_deck),
    [listsQuery.data]
  );
  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const allTags = useMemo(() => collectTags(allTasks), [allTasks]);

  const visibleTasks = useMemo(
    () =>
      allTasks.filter((task) => {
        if (selectedListId && task.list_id !== selectedListId) return false;
        if (selectedTag && !task.tags.includes(selectedTag)) return false;
        return true;
      }),
    [allTasks, selectedListId, selectedTag]
  );

  const handleToggle = useCallback(
    async (task: Task) => {
      try {
        await updateTask.mutateAsync({
          taskId: task.id,
          patch: { completed: !task.completed, etag: task.etag },
        });
      } catch (error) {
        if (error instanceof ApiError && error.isNotImplemented) {
          Alert.alert('Not available yet', 'The server does not support editing tasks yet.');
        } else if (error instanceof ApiError) {
          Alert.alert('Could not update task', error.message);
        }
      }
    },
    [updateTask]
  );

  const handleOpen = useCallback((task: Task) => {
    router.push(`/task/${encodeURIComponent(task.uid)}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Task }) => (
      <TaskItem task={item} onToggle={handleToggle} onOpen={handleOpen} />
    ),
    [handleToggle, handleOpen]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/new" asChild>
              <Pressable hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Icon name="plus" size={22} color={blue as string} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <FlatList
        data={visibleTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={{ backgroundColor: colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingBottom: 32,
          justifyContent: visibleTasks.length === 0 ? 'center' : 'flex-start',
        }}
        refreshControl={
          <RefreshControl
            refreshing={tasksQuery.isFetching && !tasksQuery.isLoading}
            onRefresh={() => tasksQuery.refetch()}
          />
        }
        ListHeaderComponent={
          (lists.length > 1 || allTags.length > 0) ? (
            <View className="gap-3 py-2">
              {lists.length > 1 ? (
                <TagChipList
                  tags={lists.map((list) => list.name)}
                  selectedTag={lists.find((l) => l.id === selectedListId)?.name ?? null}
                  onSelect={(name) => {
                    const match = lists.find((l) => l.name === name);
                    setSelectedListId(match ? match.id : null);
                  }}
                />
              ) : null}
              {allTags.length > 0 ? (
                <TagChipList tags={allTags} selectedTag={selectedTag} onSelect={setSelectedTag} />
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            loading={tasksQuery.isLoading}
            error={tasksQuery.error}
            onRetry={() => tasksQuery.refetch()}
          />
        }
      />
    </>
  );
}

function EmptyState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const blue = useCSSVariable('--sf-blue');

  if (loading) {
    return (
      <View className="items-center py-20">
        <Text className="text-sf-text-2">Loading tasks…</Text>
      </View>
    );
  }

  if (error) {
    const message = error instanceof ApiError ? error.message : 'Could not reach the proxy.';
    return (
      <View className="items-center gap-3 py-20">
        <Icon name="exclamationmark.triangle" size={28} color={blue as string} />
        <Text selectable className="text-sf-text-2 px-8 text-center">
          {message}
        </Text>
        <Pressable onPress={onRetry} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text className="text-sf-blue text-base">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="items-center gap-2 py-20">
      <Icon name="checklist" size={28} color={blue as string} />
      <Text className="text-sf-text-2">No tasks here yet.</Text>
      {Platform.OS !== 'web' ? (
        <Text className="text-sf-text-3 text-sm">Tap + to add one.</Text>
      ) : null}
    </View>
  );
}
