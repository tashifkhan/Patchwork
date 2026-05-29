import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, Stack, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, RefreshControl } from 'react-native';

import { ApiError } from '@/api/client';
import type { Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { CreateTaskListForm } from '@/components/tasks/create-task-list-form';
import { DraggableColumn } from '@/components/tasks/draggable-column';
import { TagChipList } from '@/components/tasks/tag-chip-list';
import { TaskItem } from '@/components/tasks/task-item';
import { TaskListMenu } from '@/components/tasks/task-list-menu';
import { Fab } from '@/components/ui/fab';
import { Icon } from '@/components/ui/icon';
import { NativeAlert } from '@/components/ui/native-alert';
import {
  useReorderTasks,
  useCreateTaskList,
  useTaskLists,
  useTasks,
  useUpdateTask,
  type ReorderEntry,
} from '@/hooks/use-tasks';
import { useUiStore } from '@/stores/ui-store';
import { ScrollView, Text, View, useCSSVariable } from '@/tw';

type BucketKey = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none';

const BUCKET_ORDER: BucketKey[] = ['overdue', 'today', 'tomorrow', 'upcoming', 'none'];
const BUCKET_LABELS: Record<BucketKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  upcoming: 'Upcoming',
  none: 'No due date',
};

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

function bucketOf(task: Task): BucketKey {
  if (!task.due_at) return 'none';
  const date = new Date(task.due_at);
  if (Number.isNaN(date.getTime())) return 'none';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((dueDay - startOfToday) / 86_400_000);
  if (dayDiff < 0) return 'overdue';
  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'tomorrow';
  return 'upcoming';
}

function byManualOrder(a: Task, b: Task): number {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const ad = a.due_at ?? '';
  const bd = b.due_at ?? '';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export default function TasksScreen() {
  const { colors } = useTheme();
  const blue = useCSSVariable('--sf-blue');
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const updateTask = useUpdateTask();
  const createList = useCreateTaskList();
  const reorderTasks = useReorderTasks();

  const selectedListId = useUiStore((s) => s.selectedListId);
  const selectedTag = useUiStore((s) => s.selectedTag);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);
  const setSelectedTag = useUiStore((s) => s.setSelectedTag);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ overdue: false, completed: true });
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [createListOpen, setCreateListOpen] = useState(false);

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

  const { buckets, completed } = useMemo(() => {
    const active = visibleTasks.filter((task) => !task.completed);
    const done = visibleTasks.filter((task) => task.completed).sort(byManualOrder);
    const grouped: Record<BucketKey, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      upcoming: [],
      none: [],
    };
    for (const task of active) grouped[bucketOf(task)].push(task);
    for (const key of BUCKET_ORDER) grouped[key].sort(byManualOrder);
    return { buckets: grouped, completed: done };
  }, [visibleTasks]);

  const handleToggle = useCallback(
    async (task: Task) => {
      try {
        await updateTask.mutateAsync({
          taskId: task.id,
          patch: { completed: !task.completed, etag: task.etag },
        });
      } catch (error) {
        if (error instanceof ApiError && error.isNotImplemented) {
          setAlert({ title: 'Not available yet', message: 'The server does not support editing tasks yet.' });
        } else if (error instanceof ApiError) {
          setAlert({ title: 'Could not update task', message: error.message });
        }
      }
    },
    [updateTask]
  );

  const handleOpen = useCallback((task: Task) => {
    router.push(`/task/${encodeURIComponent(task.uid)}`);
  }, []);

  const handleCreateList = useCallback(async (name: string) => {
    try {
      const list = await createList.mutateAsync({ name });
      setSelectedListId(list.id);
      setCreateListOpen(false);
    } catch (error) {
      setAlert({ title: 'Could not create list', message: error instanceof ApiError ? error.message : 'Please try again.' });
    }
  }, [createList, setSelectedListId]);

  const handleReorder = useCallback(
    (next: Task[]) => {
      const entries: ReorderEntry[] = [];
      next.forEach((task, index) => {
        const order = (index + 1) * 10;
        if (task.sort_order !== order) {
          entries.push({ taskId: task.id, sort_order: order, etag: task.etag });
        }
      });
      if (entries.length > 0) reorderTasks.mutate(entries);
    },
    [reorderTasks]
  );

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isEmpty = visibleTasks.length === 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerTitleAlign: 'left',
          headerTitle: () => (
            <TaskListMenu
              lists={lists.map((l) => ({ id: l.id, name: l.name }))}
              selectedListId={selectedListId}
              onSelect={setSelectedListId}
              onCreate={() => setCreateListOpen(true)}
            />
          ),
          headerRight: () => (
            <Link href="/new-task" asChild>
              <Pressable hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Icon name="plus" size={22} color={blue as string} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingBottom: 96,
          justifyContent: isEmpty ? 'center' : 'flex-start',
        }}
        refreshControl={
          <RefreshControl
            refreshing={tasksQuery.isFetching && !tasksQuery.isLoading}
            onRefresh={() => tasksQuery.refetch()}
          />
        }>
        {allTags.length > 0 ? (
          <View className="gap-3 py-2">
            <TagChipList tags={allTags} selectedTag={selectedTag} onSelect={setSelectedTag} />
          </View>
        ) : null}

        {isEmpty ? (
          <EmptyState
            loading={tasksQuery.isLoading}
            error={tasksQuery.error}
            onRetry={() => tasksQuery.refetch()}
          />
        ) : (
          <>
            {BUCKET_ORDER.filter((key) => buckets[key].length > 0).map((key) => (
              <Section
                key={key}
                title={BUCKET_LABELS[key]}
                count={buckets[key].length}
                collapsed={!!collapsed[key]}
                onToggle={() => toggleSection(key)}>
                <DraggableColumn
                  data={buckets[key]}
                  keyExtractor={(task) => task.id}
                  onReorder={handleReorder}
                  indicatorColor={colors.accent}
                  renderItem={(task) => (
                    <TaskItem task={task} onToggle={handleToggle} onOpen={handleOpen} />
                  )}
                />
              </Section>
            ))}

            {completed.length > 0 ? (
              <Section
                title="Completed"
                count={completed.length}
                collapsed={!!collapsed.completed}
                onToggle={() => toggleSection('completed')}>
                {completed.map((task) => (
                  <TaskItem key={task.id} task={task} onToggle={handleToggle} onOpen={handleOpen} />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
      {process.env.EXPO_OS === 'android' ? (
        <Fab onPress={() => router.push('/new-task')} accessibilityLabel="Add task" />
      ) : null}
      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />
      <Modal
        visible={createListOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateListOpen(false)}>
        <Pressable
          onPress={() => setCreateListOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Pressable onPress={() => {}}>
            <CreateTaskListForm
              busy={createList.isPending}
              onCreate={handleCreateList}
              defaultOpen
              onCancel={() => setCreateListOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Section({
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="pt-4">
      <Pressable onPress={onToggle} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <View className="flex-row items-center justify-between py-1">
          <Text className="text-sf-text-2 text-sm font-semibold uppercase">
            {title} · {count}
          </Text>
          <MaterialCommunityIcons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={20}
            color={colors.text2}
          />
        </View>
      </Pressable>
      {collapsed ? null : <View className="pt-1">{children}</View>}
    </View>
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
  const { colors } = useTheme();

  if (loading) {
    return (
      <View className="items-center py-20">
        <Text className="text-sf-text-2">Loading tasks…</Text>
      </View>
    );
  }

  if (error) {
    const message = error instanceof ApiError ? error.message : 'Could not load tasks.';
    return (
      <View className="items-center gap-3 py-20">
        <MaterialCommunityIcons name="alert-circle-outline" size={28} color={colors.accent} />
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
      <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={28} color={colors.accent} />
      <Text className="text-sf-text-2">No tasks here yet.</Text>
      {Platform.OS !== 'web' ? (
        <Text className="text-sf-text-3 text-sm">Tap + to add one.</Text>
      ) : null}
    </View>
  );
}
