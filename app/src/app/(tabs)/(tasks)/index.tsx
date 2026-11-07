import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  type ScrollView as RNScrollView,
  StyleSheet,
} from 'react-native';

import { ApiError } from '@/api/client';
import type { GitHubIssue, Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { CreateTaskListForm } from '@/components/tasks/create-task-list-form';
import { DraggableColumn } from '@/components/tasks/draggable-column';
import { ListPicker } from '@/components/tasks/list-picker';
import { GitHubSection } from '@/components/tasks/github-section';
import { Section } from '@/components/tasks/task-section';
import { TaskActionBar } from '@/components/tasks/task-action-bar';
import {
  TaskCard,
  type TaskCardHandle,
  type TaskCardResult,
} from '@/components/tasks/task-card';
import { TagFilterTabs } from '@/components/tasks/tag-chip-list';
import { TaskDetailView, TaskPaneContext, type TaskPane } from '@/components/tasks/task-detail';
import { TaskItem } from '@/components/tasks/task-item';
import { ListHero, ListSwitcherSheet } from '@/components/tasks/list-switcher';
import { TaskListSkeleton } from '@/components/tasks/task-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Fab } from '@/components/ui/fab';
import { DictateFab } from '@/components/tasks/dictate-fab';
import { DictationSheet } from '@/components/tasks/dictation-sheet';
import { OutboxBanner } from '@/components/tasks/outbox-banner';
import { LOCAL_ACCOUNT_ID, LOCAL_ACCOUNT_NAME } from '@/lib/local-tasks';
import { LoadingBar, LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { READABLE_MAX_WIDTH, useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { haptics } from '@/lib/haptics';
import {
  useTabBarContentPadding,
  useTabBarFabOffset,
  useTabBarMinimizeOnScroll,
} from '@/lib/tab-bar';
import { cancelTaskReminder } from '@/lib/notifications';
import { setCreateHandoff } from '@/stores/create-handoff';
import {
  useCreateTask,
  useDeleteTask,
  useReorderTasks,
  useCreateTaskList,
  useTasks,
  useTaskLists,
  useUpdateTask,
  type ReorderEntry,
} from '@/hooks/use-tasks';
import { useGitHubIssues, useToggleGitHubIssue } from '@/hooks/use-github';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOf,
  byManualOrder,
  flattenTasks,
  type BucketKey,
} from '@/lib/task-buckets';
import { useSettingsStore } from '@/stores/settings-store';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { useUiStore } from '@/stores/ui-store';
import { useSyncStatusStore } from '@/stores/sync-status-store';
import { ScrollView, Text, View } from '@/tw';

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
  const onTabBarScroll = useTabBarMinimizeOnScroll();
  const contentBottom = useTabBarContentPadding(96);
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const updateTask = useUpdateTask();
  const createList = useCreateTaskList();
  const reorderTasks = useReorderTasks();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const fabBottom = useTabBarFabOffset();
  const taskWarnings = useSyncStatusStore((state) => state.taskWarnings);

  const selectedListId = useUiStore((s) => s.selectedListId);
  const selectedTag = useUiStore((s) => s.selectedTag);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);
  const setSelectedTag = useUiStore((s) => s.setSelectedTag);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ overdue: false, completed: true, github_open: false, github_closed: true });
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [createListOpen, setCreateListOpen] = useState(false);
  /** Task id open in place as a card, `'new'` for the inline new to-do, or null. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [moveListId, setMoveListId] = useState<string | null>(null);
  const [listSwitcherOpen, setListSwitcherOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  const insets = useSafeAreaInsets();
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  // Split view (iPad, unfolded foldables, tablets): the to-do open in the
  // detail pane. Phones open to-dos in place and push the full editor.
  const { twoPane, listPaneWidth, hingeGap } = useAdaptiveLayout();
  const [paneUid, setPaneUid] = useState<string | null>(null);
  const pane = useMemo<TaskPane>(
    () => ({ open: setPaneUid, close: () => setPaneUid(null) }),
    []
  );
  // Folding the device (or narrowing the iPad window) with a to-do open
  // keeps it open: it moves from the pane to a pushed screen.
  const handedOff = useRef<string | null>(null);
  useEffect(() => {
    if (twoPane) {
      handedOff.current = null;
    } else if (paneUid && handedOff.current !== paneUid) {
      handedOff.current = paneUid;
      router.push({ pathname: '/task/[uid]', params: { uid: paneUid } });
    }
  }, [twoPane, paneUid]);
  const cardRef = useRef<TaskCardHandle>(null);
  const scrollRef = useRef<RNScrollView>(null);
  const scrollY = useRef(0);

  const lists = useMemo(
    () => (listsQuery.data ?? []).filter((list) => !list.is_deck),
    [listsQuery.data]
  );
  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const selectedList = lists.find((l) => l.id === selectedListId) ?? null;
  const listCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of allTasks) {
      if (task.completed) continue;
      counts[task.list_id] = (counts[task.list_id] ?? 0) + 1;
    }
    return counts;
  }, [allTasks]);
  const openTotal = useMemo(() => allTasks.filter((t) => !t.completed).length, [allTasks]);
  const visibleOpen = selectedListId ? (listCounts[selectedListId] ?? 0) : openTotal;
  const allTags = useMemo(() => collectTags(allTasks), [allTasks]);
  const [dictating, setDictating] = useState(false);

  const githubQuery = useGitHubIssues();
  const toggleGitHubIssue = useToggleGitHubIssue();
  const githubConnection = useGitHubSessionStore((state) => state.state);
  const githubRepositories = useSettingsStore((s) => s.githubRepositories);
  const githubEnabled = githubRepositories.length > 0;
  /** A followed GitHub repository acts as a list: its id is `gh:<owner/repo>`. */
  const repoFilter = selectedListId?.startsWith('gh:') ? selectedListId.slice(3) : null;
  const allIssues = useMemo(() => githubQuery.data?.issues ?? [], [githubQuery.data?.issues]);
  const repoIssueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const issue of allIssues) {
      if (issue.completed) continue;
      counts[issue.repo.toLowerCase()] = (counts[issue.repo.toLowerCase()] ?? 0) + 1;
    }
    return counts;
  }, [allIssues]);
  const repoLabels = useMemo(() => {
    if (!repoFilter) return [];
    const set = new Set<string>();
    for (const issue of allIssues) {
      if (issue.repo.toLowerCase() !== repoFilter.toLowerCase()) continue;
      issue.labels.forEach((label) => set.add(label.name));
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allIssues, repoFilter]);

  const visibleTasks = useMemo(
    () =>
      allTasks.filter((task) => {
        if (selectedListId?.startsWith('gh:')) return false;
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

  /** Save and fold the open card, if any. Returns true when one was open. */
  const closeCard = useCallback(() => {
    if (expandedId == null) return false;
    Keyboard.dismiss();
    if (cardRef.current) cardRef.current.commit();
    else setExpandedId(null);
    return true;
  }, [expandedId]);

  // Things behavior: tapping a to-do opens it in place. Tapping another row
  // while one is open just closes the open one first.
  const handleOpen = useCallback(
    (task: Task) => {
      if (closeCard()) return;
      if (twoPane) {
        setPaneUid(task.uid);
        return;
      }
      setExpandedId(task.id);
    },
    [closeCard, twoPane]
  );

  const openNewCard = useCallback(() => {
    if (expandedId === 'new') return;
    if (repoFilter) {
      // An issue needs a repository and has no CalDAV fields, so it gets the
      // full add dialog, already pointed at this repo.
      haptics.impact('medium');
      router.push({ pathname: '/new-task', params: { repo: repoFilter } });
      return;
    }
    closeCard();
    haptics.impact('medium');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    // Let the previous card's close commit land before mounting the new one.
    requestAnimationFrame(() => setExpandedId('new'));
  }, [closeCard, expandedId, repoFilter]);

  const handleAddChild = useCallback(
    (parent: Task, title: string) => {
      createTask
        .mutateAsync({ list_id: parent.list_id, title, parent_uid: parent.uid })
        .catch((error) =>
          setAlert({
            title: 'Could not add checklist item',
            message: error instanceof ApiError ? error.message : 'Please try again.',
          })
        );
    },
    [createTask]
  );

  const handleCardClose = useCallback(
    async (result: TaskCardResult) => {
      setExpandedId(null);
      setMovePickerOpen(false);
      if (result.kind === 'update') {
        updateTask
          .mutateAsync({
            taskId: result.task.id,
            accountId: result.task.account_id,
            patch: result.patch,
          })
          .catch((error) =>
            setAlert({
              title: 'Could not save to-do',
              message: error instanceof ApiError ? error.message : 'Please try again.',
            })
          );
      } else if (result.kind === 'create') {
        try {
          const created = await createTask.mutateAsync(result.payload);
          haptics.success();
          for (const item of result.checklist) {
            await createTask.mutateAsync({
              list_id: created.list_id,
              title: item,
              parent_uid: created.uid,
            });
          }
        } catch (error) {
          setAlert({
            title: 'Could not create to-do',
            message: error instanceof ApiError ? error.message : 'Please try again.',
          });
        }
      }
    },
    [createTask, updateTask]
  );

  /** Scroll just enough that an opened card clears the header and the action bar. */
  const revealCard = useCallback(
    (top: number, bottom: number) => {
      // Measure the list itself: the tab bar sits below it, and the action bar
      // floats `fabBottom` above the list's bottom edge.
      scrollRef.current?.measureInWindow((_x, listTop, _w, listHeight) => {
        const visibleTop = listTop + 8;
        const visibleBottom = listTop + listHeight - fabBottom - 60 - 16;
        let delta = 0;
        if (bottom > visibleBottom) delta = bottom - visibleBottom;
        // Never push the top of the card off-screen to show its bottom.
        if (top - delta < visibleTop) delta = top - visibleTop;
        if (Math.abs(delta) < 4) return;
        scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: true });
      });
    },
    [fabBottom]
  );

  // Search hands over a task to open in place (Things Quick Find behavior).
  const openTaskUid = useUiStore((s) => s.openTaskUid);
  const requestOpenTask = useUiStore((s) => s.requestOpenTask);
  useEffect(() => {
    if (!openTaskUid || allTasks.length === 0) return;
    // A frame's delay lets the tab switch settle before the card springs open.
    const frame = requestAnimationFrame(() => {
      requestOpenTask(null);
      const found = flattenTasks(allTasks).find((t) => t.uid === openTaskUid);
      if (!found) return;
      // Subtasks open their parent; filters clear so the row is on screen.
      const target = found.parent_uid
        ? (allTasks.find((t) => t.uid === found.parent_uid) ?? found)
        : found;
      if (
        (selectedListId && target.list_id !== selectedListId) ||
        (selectedTag && !target.tags.includes(selectedTag))
      ) {
        setSelectedListId(null);
        setSelectedTag(null);
      }
      if (target.completed) setCollapsed((prev) => ({ ...prev, completed: false }));
      setExpandedId(target.id);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    allTasks,
    openTaskUid,
    requestOpenTask,
    selectedListId,
    selectedTag,
    setSelectedListId,
    setSelectedTag,
  ]);

  /** Move the inline new to-do into the full add dialog, keeping what was typed. */
  const openFullEditor = useCallback(() => {
    const draft = cardRef.current?.draft();
    cardRef.current?.discard();
    if (draft) {
      setCreateHandoff({
        title: draft.title,
        body: draft.notes,
        task: {
          list_id: draft.listId,
          tags: draft.tags,
          due_at: draft.due,
          reminder_at: null,
          priority: null,
          calendar_id: null,
          subtasks: draft.checklist,
          subtaskDraft: '',
        },
      });
    }
    router.push('/new-task');
  }, []);

  // Android back folds the open card instead of leaving the screen.
  useEffect(() => {
    if (expandedId == null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => closeCard());
    return () => sub.remove();
  }, [closeCard, expandedId]);

  // Every account that can own a list, plus this device.
  const listAccounts = useMemo(() => {
    // Web goes through the proxy, which owns its own accounts.
    if (process.env.EXPO_OS === 'web') return [];
    const seen = new Map<string, string>();
    for (const list of lists) {
      if (list.account_id && !seen.has(list.account_id)) {
        seen.set(list.account_id, list.account_name ?? list.account_id);
      }
    }
    if (!seen.has(LOCAL_ACCOUNT_ID)) seen.set(LOCAL_ACCOUNT_ID, LOCAL_ACCOUNT_NAME);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [lists]);
  const selectedListAccountId = lists.find((list) => list.id === selectedListId)?.account_id;

  const handleCreateList = useCallback(async (name: string, accountId?: string) => {
    try {
      const list = await createList.mutateAsync({
        name,
        account_id: accountId ?? selectedListAccountId ?? listAccounts[0]?.id,
      });
      setSelectedListId(list.id);
      setCreateListOpen(false);
    } catch (error) {
      setAlert({
        title: 'Could not create list',
        message: error instanceof Error && error.message ? error.message : 'Please try again.',
      });
    }
  }, [createList, listAccounts, selectedListAccountId, setSelectedListId]);

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

  // Issues follow the same list and tag filters as to-dos: a CalDAV list hides
  // them, a repo list shows only its own, and a tag matches label names.
  const githubIssues = useMemo(
    () =>
      selectedList
        ? []
        : allIssues.filter((issue) => {
            if (repoFilter && issue.repo.toLowerCase() !== repoFilter.toLowerCase()) return false;
            if (selectedTag && !issue.labels.some((l) => l.name === selectedTag)) return false;
            return true;
          }),
    [allIssues, repoFilter, selectedList, selectedTag]
  );
  const isLoading = tasksQuery.isLoading;
  const isFetching = tasksQuery.isFetching || (githubEnabled && githubQuery.isFetching);
  const isEmpty = visibleTasks.length === 0 && (!githubEnabled || githubIssues.length === 0);
  const showCenteredState = isEmpty && !githubEnabled && !isLoading;
  const needsCalDavAccount = isMissingCalDavAccountError(tasksQuery.error);
  const showingOffline = taskWarnings[0]?.startsWith("You're offline") ?? false;

  const repoOpen = repoFilter ? (repoIssueCounts[repoFilter.toLowerCase()] ?? 0) : 0;
  const heroTitle = repoFilter
    ? (repoFilter.split('/')[1] ?? repoFilter)
    : (selectedList?.name ?? 'All Tasks');
  const heroSubtitle = repoFilter
    ? `${repoOpen} open issue${repoOpen === 1 ? '' : 's'} · ${repoFilter.split('/')[0]}`
    : `${visibleOpen} open${selectedList?.account_name ? ` · ${selectedList.account_name}` : ''}`;

  const listView = (
    <>
      {/* Things-style: the list name is the page title, so no nav header. */}
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={{ backgroundColor: colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
          onTabBarScroll(event);
        }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          // Medium windows that stay single-pane (an iPad in Split View, a
          // landscape phone) keep rows at a readable width.
          width: '100%',
          maxWidth: READABLE_MAX_WIDTH,
          alignSelf: 'center',
          // Room for the floating action bar so the last card can scroll clear of it.
          paddingBottom: contentBottom + (expandedId ? 140 : 0),
        }}
        refreshControl={
          <RefreshControl
            // No nav header any more, so start the spinner below the status bar.
            progressViewOffset={Platform.OS === 'android' ? insets.top + 12 : undefined}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bg3}
            // Only a pull shows the spinner; background syncs use the quiet bar.
            refreshing={pulling}
            onRefresh={() => {
              haptics.impact('light');
              setPulling(true);
              Promise.allSettled([
                tasksQuery.refetch(),
                githubEnabled ? githubQuery.refetch() : Promise.resolve(),
              ]).finally(() => setPulling(false));
            }}
          />
        }>
        {/* Tapping empty space around an open card saves and closes it. */}
        <Pressable
          onPress={closeCard}
          disabled={expandedId == null}
          accessible={false}
          style={{ flexGrow: 1 }}>
        <View
          pointerEvents={expandedId ? 'none' : 'auto'}
          style={{
            paddingTop: Platform.OS === 'android' ? insets.top + 16 : 8,
            paddingBottom: 4,
            gap: 12,
            opacity: expandedId ? 0.38 : 1,
          }}>
          <ListHero
            title={heroTitle}
            subtitle={heroSubtitle}
            kind={repoFilter ? 'repo' : selectedList ? 'list' : 'all'}
            onPress={() => setListSwitcherOpen(true)}
          />
          {/* Background refresh: under the title, clear of the status bar and cutout. */}
          {isFetching && !isLoading && !pulling ? <LoadingBar style={{ marginTop: -4 }} /> : null}
          <TagFilterTabs
            tags={repoFilter ? repoLabels : allTags}
            selectedTag={selectedTag}
            onSelect={setSelectedTag}
          />
        </View>
        {expandedId === 'new' ? (
          <TaskCard
            ref={cardRef}
            task={null}
            lists={lists}
            defaultListId={selectedListId ?? lists[0]?.id ?? ''}
            defaultTags={selectedTag ? [selectedTag] : []}
            availableTags={allTags}
            onClose={handleCardClose}
            onOpenAi={openFullEditor}
          />
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
            <MaterialCommunityIcons
              name={showingOffline ? 'cloud-off-outline' : 'cloud-alert-outline'}
              size={20}
              color={colors.orange}
            />
            <View className="flex-1 gap-1">
              <Text className="text-sf-text text-sm font-semibold">
                {showingOffline ? 'Offline' : 'Partially synchronized'}
              </Text>
              <Text selectable className="text-sf-text-2 text-xs">{taskWarnings[0]}</Text>
              <Pressable accessibilityRole="button" onPress={() => tasksQuery.refetch()}>
                <Text className="text-sf-blue text-sm font-semibold">
                  {showingOffline ? 'Try again' : 'Retry all sources'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {process.env.EXPO_OS !== 'web' ? <OutboxBanner /> : null}

        {isLoading ? (
          // Full M3 loading first (visible on AMOLED); skeleton is for soft reloads only.
          allTasks.length === 0 ? (
            <View className="flex-1 justify-center">
              <LoadingState
                message="Loading tasks…"
                subtitle="Syncing CalDAV and your lists"
                fullScreen={false}
              />
            </View>
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
                onToggle={() => (closeCard() ? undefined : toggleSection(key))}>
                <DraggableColumn
                  data={buckets[key]}
                  keyExtractor={(task) => task.id}
                  onReorder={handleReorder}
                  indicatorColor={colors.accent}
                  dragEnabled={expandedId == null}
                  renderItem={(task) =>
                    task.id === expandedId ? (
                      <TaskCard
                        ref={cardRef}
                        task={task}
                        lists={lists}
                        defaultListId={task.list_id}
                        availableTags={allTags}
                        onClose={handleCardClose}
                        onToggleComplete={handleToggle}
                        onToggleChild={handleToggle}
                        onAddChild={handleAddChild}
                        onPlaced={revealCard}
                      />
                    ) : (
                      <TaskItem
                        task={task}
                        onToggle={handleToggle}
                        onOpen={handleOpen}
                        showList={!selectedListId}
                        dimmed={expandedId != null}
                        selected={twoPane && task.uid === paneUid}
                      />
                    )
                  }
                />
              </Section>
            ))}

            {completed.length > 0 ? (
              <Section
                title="Completed"
                count={completed.length}
                collapsed={!!collapsed.completed}
                onToggle={() => (closeCard() ? undefined : toggleSection('completed'))}>
                {completed.map((task) =>
                  task.id === expandedId ? (
                    <TaskCard
                      key={task.id}
                      ref={cardRef}
                      task={task}
                      lists={lists}
                      defaultListId={task.list_id}
                      availableTags={allTags}
                      onClose={handleCardClose}
                      onToggleComplete={handleToggle}
                      onToggleChild={handleToggle}
                      onAddChild={handleAddChild}
                      onPlaced={revealCard}
                    />
                  ) : (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={handleToggle}
                      onOpen={handleOpen}
                      showList={!selectedListId}
                      dimmed={expandedId != null}
                      selected={twoPane && task.uid === paneUid}
                    />
                  )
                )}
              </Section>
            ) : null}

            {githubEnabled && !selectedList ? (
              <GitHubSection
                issues={githubIssues}
                repoMode={repoFilter != null}
                loading={githubQuery.isLoading}
                error={githubQuery.isError ? githubQuery.error : null}
                warnings={githubQuery.data?.warnings ?? []}
                connection={githubConnection}
                collapsed={collapsed}
                dimmed={expandedId != null}
                onToggleSection={(key) => (closeCard() ? undefined : toggleSection(key))}
                onToggleIssue={handleGitHubToggle}
                onRetry={() => githubQuery.refetch()}
              />
            ) : null}
          </>
        )}
        </Pressable>
      </ScrollView>
      {process.env.EXPO_OS !== 'web' && expandedId == null ? (
        <>
          <DictateFab onPress={() => setDictating(true)} />
          <Fab onPress={openNewCard} accessibilityLabel="New to-do" />
        </>
      ) : null}
      <DictationSheet
        visible={dictating}
        lists={lists}
        availableTags={allTags}
        defaultListId={selectedListId && !selectedListId.startsWith('gh:') ? selectedListId : lists[0]?.id}
        onClose={() => setDictating(false)}
      />
      <ListSwitcherSheet
        visible={listSwitcherOpen}
        lists={lists}
        repos={githubConnection.status === 'connected' ? githubRepositories : []}
        repoCounts={repoIssueCounts}
        counts={listCounts}
        totalCount={openTotal}
        selectedListId={selectedListId}
        onSelect={setSelectedListId}
        onCreate={() => setCreateListOpen(true)}
        onEdit={() => {
          if (!selectedList) return;
          router.push({
            pathname: '/edit-list',
            params: { listId: selectedList.id, name: selectedList.name },
          });
        }}
        onClose={() => setListSwitcherOpen(false)}
      />
      {expandedId != null ? (
        <TaskActionBar
          bottom={fabBottom}
          deleteLabel={expandedId === 'new' ? 'Discard' : 'Delete'}
          onMove={() => {
            setMoveListId(cardRef.current?.listId() ?? null);
            setMovePickerOpen(true);
          }}
          onDelete={() => {
            if (expandedId === 'new') {
              cardRef.current?.discard();
              return;
            }
            const task = visibleTasks.find((t) => t.id === expandedId);
            if (task) setDeleteTarget(task);
          }}
          onDetails={() => {
            if (expandedId === 'new') {
              openFullEditor();
              return;
            }
            const task = visibleTasks.find((t) => t.id === expandedId);
            cardRef.current?.commit();
            if (!task) return;
            if (twoPane) {
              setExpandedId(null);
              setPaneUid(task.uid);
            } else {
              router.push({ pathname: '/task/[uid]', params: { uid: task.uid } });
            }
          }}
        />
      ) : null}
      <ListPicker
        visible={movePickerOpen}
        lists={lists}
        selectedId={moveListId}
        onSelect={(list) => {
          cardRef.current?.setListId(list.id);
          setMovePickerOpen(false);
        }}
        onClose={() => setMovePickerOpen(false)}
      />
      <NativeAlert
        visible={deleteTarget != null}
        title="Delete to-do"
        message={deleteTarget ? `Delete "${deleteTarget.title}"?` : ''}
        confirmLabel="Delete"
        dismissLabel="Cancel"
        onDismiss={() => setDeleteTarget(null)}
        onConfirm={() => {
          const task = deleteTarget;
          setDeleteTarget(null);
          if (!task) return;
          cardRef.current?.discard();
          haptics.warning();
          deleteTask
            .mutateAsync({ taskId: task.id, accountId: task.account_id, etag: task.etag })
            .then(() => cancelTaskReminder(task.uid))
            .catch(() =>
              setAlert({ title: 'Delete failed', message: 'Could not delete the to-do.' })
            );
        }}
      />
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
              accounts={listAccounts}
              defaultAccountId={selectedListAccountId}
              defaultOpen
              onCancel={() => setCreateListOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  if (!twoPane) return listView;

  // List + detail. The list pane has its own FABs and action bar, so they
  // stay over the list; on a foldable the panes meet at the hinge.
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <View style={{ width: listPaneWidth }}>{listView}</View>
      <View
        style={{
          width: hingeGap || StyleSheet.hairlineWidth,
          backgroundColor: hingeGap ? colors.bg : colors.separator,
        }}
      />
      <View style={{ flex: 1 }}>
        {paneUid ? (
          <TaskPaneContext value={pane}>
            <TaskDetailView key={paneUid} uid={paneUid} />
          </TaskPaneContext>
        ) : (
          <View className="flex-1 items-center justify-center gap-3 px-10">
            <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={48} color={colors.text3} />
            <Text className="text-sf-text-2 text-center text-base">
              Select a to-do to see its notes, checklist and dates.
            </Text>
          </View>
        )}
      </View>
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
