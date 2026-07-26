import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, Stack, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, RefreshControl } from 'react-native';

import { ApiError } from '@/api/client';
import type { GitHubIssue, Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { CreateTaskListForm } from '@/components/tasks/create-task-list-form';
import { DraggableColumn } from '@/components/tasks/draggable-column';
import { TagChipList } from '@/components/tasks/tag-chip-list';
import { TaskItem } from '@/components/tasks/task-item';
import { TaskListMenu } from '@/components/tasks/task-list-menu';
import { TaskListSkeleton } from '@/components/tasks/task-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Fab } from '@/components/ui/fab';
import { Icon } from '@/components/ui/icon';
import { LoadingBar, LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { haptics } from '@/lib/haptics';
import { useTabBarContentPadding, useTabBarMinimizeOnScroll } from '@/lib/tab-bar';
import {
  useReorderTasks,
  useCreateTaskList,
  useTasks,
  useTaskLists,
  useUpdateTask,
  type ReorderEntry,
} from '@/hooks/use-tasks';
import { useGitHubIssues, useToggleGitHubIssue } from '@/hooks/use-github';
import { GitHubIssueItem } from '@/components/tasks/github-issue-item';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOf,
  byManualOrder,
  type BucketKey,
} from '@/lib/task-buckets';
import { useSettingsStore } from '@/stores/settings-store';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { useUiStore } from '@/stores/ui-store';
import { useSyncStatusStore } from '@/stores/sync-status-store';
import { ScrollView, Text, View, useCSSVariable } from '@/tw';

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

function isMissingCalDavAccountError(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  return (
    error.status === 503 ||
    /no caldav accounts|not configured|no account/i.test(error.message)
  );
}

export default function TasksScreen() {
  const { colors } = useTheme();
  const blue = useCSSVariable('--sf-blue');
  const onTabBarScroll = useTabBarMinimizeOnScroll();
  const contentBottom = useTabBarContentPadding(96);
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const updateTask = useUpdateTask();
  const createList = useCreateTaskList();
  const reorderTasks = useReorderTasks();
  const taskWarnings = useSyncStatusStore((state) => state.taskWarnings);

  const selectedListId = useUiStore((s) => s.selectedListId);
  const selectedTag = useUiStore((s) => s.selectedTag);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);
  const setSelectedTag = useUiStore((s) => s.setSelectedTag);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ overdue: false, completed: true, github_open: false, github_closed: true });
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [createListOpen, setCreateListOpen] = useState(false);

  const lists = useMemo(
    () => (listsQuery.data ?? []).filter((list) => !list.is_deck),
    [listsQuery.data]
  );
  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const allTags = useMemo(() => collectTags(allTasks), [allTasks]);

  const githubQuery = useGitHubIssues();
  const toggleGitHubIssue = useToggleGitHubIssue();
  const githubConnection = useGitHubSessionStore((state) => state.state);

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
          accountId: task.account_id,
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

  const handleGitHubToggle = useCallback(
    async (issue: GitHubIssue) => {
      if (issue.readOnly) return;
      try {
        await toggleGitHubIssue.mutateAsync(issue);
      } catch (error) {
        setAlert({ title: 'Could not update issue', message: error instanceof Error ? error.message : 'Please try again.' });
      }
    },
    [toggleGitHubIssue]
  );

  const handleOpen = useCallback((task: Task) => {
    // Use object form so expo-router encodes params correctly and the detail
    // screen always receives a decoded uid (fixes "tap shows nothing").
    router.push({
      pathname: '/task/[uid]',
      params: { uid: task.uid },
    });
  }, []);

  const handleCreateList = useCallback(async (name: string) => {
    try {
      const selectedAccountId = lists.find((list) => list.id === selectedListId)?.account_id;
      const accountIds = [...new Set(lists.map((list) => list.account_id).filter(Boolean))];
      if (!selectedAccountId && accountIds.length > 1) {
        setAlert({
          title: 'Choose an account',
          message: 'Select one of that account’s lists first, then create the new list.',
        });
        return;
      }
      const list = await createList.mutateAsync({
        name,
        account_id: selectedAccountId ?? accountIds[0],
      });
      setSelectedListId(list.id);
      setCreateListOpen(false);
    } catch (error) {
      setAlert({ title: 'Could not create list', message: error instanceof ApiError ? error.message : 'Please try again.' });
    }
  }, [createList, lists, selectedListId, setSelectedListId]);

  const handleReorder = useCallback(
    (next: Task[]) => {
      const entries: ReorderEntry[] = [];
      next.forEach((task, index) => {
        const order = (index + 1) * 10;
        if (task.sort_order !== order) {
          entries.push({
            taskId: task.id,
            accountId: task.account_id,
            sort_order: order,
            etag: task.etag,
          });
        }
      });
      if (entries.length > 0) reorderTasks.mutate(entries);
    },
    [reorderTasks]
  );

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const githubRepositories = useSettingsStore((s) => s.githubRepositories);
  const githubEnabled = githubRepositories.length > 0;
  const githubIssues = useMemo(
    () => githubQuery.data?.issues ?? [],
    [githubQuery.data?.issues]
  );
  const isLoading = tasksQuery.isLoading;
  const isFetching = tasksQuery.isFetching || (githubEnabled && githubQuery.isFetching);
  const isEmpty = visibleTasks.length === 0 && (!githubEnabled || githubIssues.length === 0);
  const showCenteredState = isEmpty && !githubEnabled && !isLoading;
  const needsCalDavAccount = isMissingCalDavAccountError(tasksQuery.error);

  const githubOpen = useMemo(() => githubIssues.filter((i) => !i.completed), [githubIssues]);
  const githubClosed = useMemo(() => githubIssues.filter((i) => i.completed), [githubIssues]);

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
        scrollEventThrottle={16}
        onScroll={onTabBarScroll}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingBottom: contentBottom,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => {
              haptics.impact('light');
              tasksQuery.refetch();
              if (githubEnabled) githubQuery.refetch();
            }}
          />
        }>
        {isFetching && !isLoading ? (
          <View className="mb-1 pt-1">
            <LoadingBar />
          </View>
        ) : null}
        {allTags.length > 0 ? (
          <View className="gap-3 py-2">
            <TagChipList tags={allTags} selectedTag={selectedTag} onSelect={setSelectedTag} />
          </View>
        ) : null}

        {needsCalDavAccount && !showCenteredState ? (
          <View className="bg-sf-bg-2 mt-2 flex-row items-start gap-3 rounded-xl px-3 py-3">
            <MaterialCommunityIcons name="cloud-plus-outline" size={20} color={colors.accent} />
            <View className="flex-1 gap-1">
              <Text className="text-sf-text text-sm font-semibold">
                CalDAV account not connected
              </Text>
              <Text selectable className="text-sf-text-2 text-xs">
                GitHub issues are still available. Connect CalDAV to add synchronized tasks.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/settings/account')}>
                <Text className="text-sf-blue text-sm font-semibold">Connect account</Text>
              </Pressable>
            </View>
          </View>
        ) : tasksQuery.isError && !showCenteredState ? (
          <View className="bg-sf-bg-2 mt-2 flex-row items-start gap-3 rounded-xl px-3 py-3">
            <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={colors.red} />
            <View className="flex-1 gap-1">
              <Text className="text-sf-text text-sm font-semibold">CalDAV sync failed</Text>
              <Text selectable className="text-sf-text-2 text-xs">
                {tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Tasks could not be refreshed.'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => tasksQuery.refetch()}>
                <Text className="text-sf-blue text-sm font-semibold">Retry</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {!tasksQuery.isError && taskWarnings.length > 0 ? (
          <View className="bg-sf-bg-2 mt-2 flex-row items-start gap-3 rounded-xl px-3 py-3">
            <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={colors.orange} />
            <View className="flex-1 gap-1">
              <Text className="text-sf-text text-sm font-semibold">Partially synchronized</Text>
              <Text selectable className="text-sf-text-2 text-xs">{taskWarnings[0]}</Text>
              <Pressable accessibilityRole="button" onPress={() => tasksQuery.refetch()}>
                <Text className="text-sf-blue text-sm font-semibold">Retry all sources</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {isLoading ? (
          // Full M3 loading first (visible on AMOLED); skeleton is for soft reloads only.
          allTasks.length === 0 ? (
            <LoadingState
              message="Loading tasks…"
              subtitle="Syncing CalDAV and your lists"
              fullScreen={false}
            />
          ) : (
            <TaskListSkeleton />
          )
        ) : showCenteredState ? (
          <View className="flex-1 justify-center">
            <TasksEmptyState
              error={tasksQuery.error}
              onRetry={() => tasksQuery.refetch()}
              onConnect={() => router.push('/settings/account')}
              onAdd={() => router.push('/new-task')}
            />
          </View>
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

            {githubEnabled ? (
              <View className="mt-8">
                <View className="mb-2 flex-row items-center gap-2">
                  <MaterialCommunityIcons name="github" size={24} color={colors.text} />
                  <Text className="text-sf-text text-lg font-bold">GitHub Issues</Text>
                </View>

                {githubQuery.data?.warnings.map((warning) => (
                  <View
                    key={`${warning.repository}:${warning.code}`}
                    className="bg-sf-bg-2 mb-2 flex-row items-start gap-2 rounded-xl px-3 py-3"
                    style={{ borderCurve: 'continuous' }}>
                    <MaterialCommunityIcons name="alert-outline" size={18} color={colors.orange} />
                    <Text selectable className="text-sf-text-2 flex-1 text-xs">
                      {warning.repository}: {warning.message}
                    </Text>
                  </View>
                ))}

                {githubQuery.isLoading ? (
                  <LoadingState
                    message="Loading GitHub issues…"
                    subtitle="Syncing selected repositories"
                    fullScreen={false}
                  />
                ) : githubConnection.status === 'expired' ? (
                  <View className="bg-sf-bg-2 gap-2 rounded-xl px-3 py-3" style={{ borderCurve: 'continuous' }}>
                    <Text className="text-sf-text text-sm font-semibold">GitHub needs to reconnect</Text>
                    <Text selectable className="text-sf-text-2 text-xs">
                      {githubConnection.message}
                    </Text>
                    <Pressable onPress={() => router.push('/settings/github')}>
                      <Text className="text-sf-blue text-sm font-semibold">Open GitHub settings</Text>
                    </Pressable>
                  </View>
                ) : githubQuery.isError ? (
                  <View className="bg-sf-bg-2 gap-2 rounded-xl px-3 py-3" style={{ borderCurve: 'continuous' }}>
                    <Text className="text-sf-text text-sm">Could not load GitHub issues</Text>
                    <Text selectable className="text-sf-text-2 text-xs">
                      {githubQuery.error instanceof Error
                        ? githubQuery.error.message
                        : 'Unknown error'}
                    </Text>
                    <Pressable
                      onPress={() => githubQuery.refetch()}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                      <Text className="text-sf-blue text-sm font-medium">Retry</Text>
                    </Pressable>
                  </View>
                ) : githubQuery.data && githubIssues.length === 0 ? (
                  <View className="bg-sf-bg-2 gap-1 rounded-xl px-3 py-3" style={{ borderCurve: 'continuous' }}>
                    <Text className="text-sf-text text-sm">No issues found</Text>
                    <Text className="text-sf-text-2 text-xs">
                      No issues match the selected repositories, scope, and state.
                    </Text>
                  </View>
                ) : (
                  <>
                    {githubOpen.length > 0 ? (
                      <Section
                        title="Open"
                        count={githubOpen.length}
                        collapsed={!!collapsed.github_open}
                        onToggle={() => toggleSection('github_open')}>
                        {githubOpen.map((issue) => (
                          <GitHubIssueItem key={issue.id} issue={issue} onToggle={handleGitHubToggle} />
                        ))}
                      </Section>
                    ) : null}

                    {githubClosed.length > 0 ? (
                      <Section
                        title="Closed"
                        count={githubClosed.length}
                        collapsed={!!collapsed.github_closed}
                        onToggle={() => toggleSection('github_closed')}>
                        {githubClosed.map((issue) => (
                          <GitHubIssueItem key={issue.id} issue={issue} onToggle={handleGitHubToggle} />
                        ))}
                      </Section>
                    ) : null}
                  </>
                )}
              </View>
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
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${title}, ${count} items`}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 44, justifyContent: 'center' })}>
        <View className="flex-row items-center justify-between py-2">
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

function TasksEmptyState({
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
      error instanceof ApiError ? error.message : 'Could not load tasks.';
    const needsAccount = isMissingCalDavAccountError(error);

    if (needsAccount) {
      return (
        <EmptyState
          icon="cloud-outline"
          title="Connect a CalDAV account"
          subtitle="Patchwork syncs tasks from Nextcloud, iCloud, or any CalDAV server. Add an account to get started."
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
        title="Couldn't load tasks"
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
      icon="checkbox-marked-circle-outline"
      title="No tasks yet"
      subtitle={
        Platform.OS === 'web'
          ? 'Create a task to fill this list.'
          : 'Tap + to add your first task, or pull down to refresh.'
      }
      actions={
        Platform.OS !== 'web'
          ? [{ label: 'Add task', onPress: onAdd, variant: 'filled' }]
          : undefined
      }
    />
  );
}
