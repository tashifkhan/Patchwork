import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';

import { ApiError } from '@/api/error';
import type { GitHubIssue, Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { CreateTaskListForm } from '@/features/tasks/create-task-list-form';
import { DraggableColumn } from '@/features/tasks/draggable-column';
import { ListPicker } from '@/features/tasks/list-picker';
import { GitHubSection } from '@/features/github/github-section';
import { Section } from '@/features/tasks/task-section';
import { SelectionBar, TaskActionBar } from '@/features/tasks/task-action-bar';
import {
  TaskCard,
  type TaskCardHandle,
  type TaskCardResult,
} from '@/features/tasks/task-card';
import { TagFilterTabs } from '@/features/tasks/tag-chip-list';
import { matchesTask, taskKey, taskRef, type TaskRef } from '@/features/tasks/model';
import { TaskDetailView, TaskPaneContext, type TaskPane } from '@/features/tasks/task-detail';
import { TaskItem } from '@/features/tasks/task-item';
import { ListHero } from '@/features/tasks/list-hero';
import { useIsOffline, useOfflineBannerStore } from '@/hooks/use-offline';
import { TaskListSkeleton } from '@/features/tasks/task-skeleton';
import { SmartTiles } from '@/features/tasks/smart-tiles';
import { ConnectedButtonGroup } from '@/components/ui/button-group';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ACTION_BAR_CLEARANCE,
  FIELD_CLEARANCE,
  isKeyboardVisible,
  KeyboardScrollView,
  type KeyboardAwareScrollViewRef,
} from '@/components/ui/keyboard';
import { ElasticPressable } from '@/components/ui/motion';
import { Fab } from '@/components/ui/fab';
import { Frost } from '@/components/ui/frost';
import { DictateFab } from '@/features/ai/dictate-fab';
import { DictationSheet } from '@/features/ai/dictation-sheet';
import { SyncBanner } from '@/features/sync/sync-banner';
import { StatusBanner } from '@/components/ui/status-banner';
import { LOCAL_ACCOUNT_ID, LOCAL_ACCOUNT_NAME } from '@/features/tasks/local-tasks';
import { LoadingBar, LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { READABLE_MAX_WIDTH, useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { celebrate, playSound } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { matchesSmart, smartCounts, type SmartKey } from '@/lib/smart-lists';
import { completionPercent, togglePatch } from '@/lib/task-actions';
import {
  useTabBarContentPadding,
  useTabBarFabOffset,
  useTabBarMinimizeOnScroll,
} from '@/lib/tab-bar';
import { cancelTaskReminder } from '@/lib/notifications';
import { setCreateHandoff } from '@/features/tasks/create-handoff';
import { useTasks, useTaskLists, useTaskWarnings } from '@/features/tasks/queries';
import { useBulkTaskAction, useCreateTask, useCreateTaskWithChecklist, useDeleteTask, useReorderTasks, useCreateTaskList, useUpdateTask, type ReorderEntry } from '@/features/tasks/mutations';
import { useGitHubIssues, useToggleGitHubIssue } from '@/features/github/queries';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOf,
  byManualOrder,
  findTaskRow,
  flattenTasks,
  liftOpenSubtasks,
  type BucketKey,
} from '@/features/tasks/task-buckets';
import { usePomodoroStore } from '@/stores/pomodoro-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { useUiStore } from '@/stores/ui-store';
import { Text, View } from '@/tw';

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
  const { mutateAsync: createWithChecklist } = useCreateTaskWithChecklist();
  const deleteTask = useDeleteTask();
  const bulk = useBulkTaskAction();
  const fabBottom = useTabBarFabOffset();
  const taskWarnings = useTaskWarnings();
  const offline = useIsOffline();
  const setOfflineDismissed = useOfflineBannerStore((s) => s.setDismissed);

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
  /** The smart tile filtering the to-dos (Today, Scheduled, All, Overdue), if any. */
  const [smart, setSmart] = useState<SmartKey | null>(null);
  const [pulling, setPulling] = useState(false);
  /** iOS: rows have scrolled up under the status bar, so it frosts over. */
  const [underStatusBar, setUnderStatusBar] = useState(false);
  const insets = useSafeAreaInsets();
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  /** Multi-select: ids of the chosen to-dos, or null when not selecting. */
  const [selection, setSelection] = useState<string[] | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<'delete' | 'merge' | 'clear' | null>(null);
  // Split view (iPad, unfolded foldables, tablets): the to-do open in the
  // detail pane. Phones open to-dos in place and push the full editor.
  const { twoPane, listPaneWidth, hingeGap } = useAdaptiveLayout();
  const [paneTask, setPaneTask] = useState<TaskRef | null>(null);
  const pane = useMemo<TaskPane>(
    () => ({ open: setPaneTask, close: () => setPaneTask(null) }),
    []
  );
  // Folding the device (or narrowing the iPad window) with a to-do open
  // keeps it open: it moves from the pane to a pushed screen.
  const handedOff = useRef<string | null>(null);
  useEffect(() => {
    if (twoPane) {
      handedOff.current = null;
    } else if (paneTask && handedOff.current !== taskKey(paneTask)) {
      handedOff.current = taskKey(paneTask);
      router.push({ pathname: '/task/[uid]', params: { ...paneTask } });
    }
  }, [twoPane, paneTask]);
  const cardRef = useRef<TaskCardHandle>(null);
  const handleCreateListRef = useRef<(name: string) => Promise<void>>(async () => {});
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const scrollY = useRef(0);

  const lists = useMemo(
    () => (listsQuery.data ?? []).filter((list) => !list.is_deck),
    [listsQuery.data]
  );
  const allTasks = useMemo(() => liftOpenSubtasks(tasksQuery.data ?? []), [tasksQuery.data]);
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

  /** To-dos in the chosen list and tag, before a smart tile narrows them. */
  const baseTasks = useMemo(
    () =>
      allTasks.filter((task) => {
        if (selectedListId?.startsWith('gh:')) return false;
        if (selectedListId && task.list_id !== selectedListId) return false;
        if (selectedTag && !task.tags.includes(selectedTag)) return false;
        return true;
      }),
    [allTasks, selectedListId, selectedTag]
  );
  const visibleTasks = useMemo(
    () => (smart ? baseTasks.filter((task) => matchesSmart(task, smart)) : baseTasks),
    [baseTasks, smart]
  );
  const smartTileCounts = useMemo(() => smartCounts(baseTasks), [baseTasks]);

  const { buckets, completed, pinned } = useMemo(() => {
    const active = visibleTasks.filter((task) => !task.completed && !task.pinned);
    const pinnedOpen = visibleTasks.filter((task) => !task.completed && task.pinned).sort(byManualOrder);
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
    return { buckets: grouped, completed: done, pinned: pinnedOpen };
  }, [visibleTasks]);

  const handleToggle = useCallback(
    async (task: Task) => {
      const { patch, repeated } = togglePatch(task);
      if (!task.completed) {
        // Celebrate when the last open to-do in view just got done.
        const othersOpen = visibleTasks.some((t) => !t.completed && t.id !== task.id);
        if (!repeated && !othersOpen && visibleTasks.length > 1) celebrate();
        else playSound('complete');
      }
      try {
        await updateTask.mutateAsync({
          taskId: task.id,
          accountId: task.account_id,
          patch,
        });
      } catch (error) {
        if (error instanceof ApiError && error.isNotImplemented) {
          setAlert({ title: 'Not available yet', message: 'The server does not support editing tasks yet.' });
        } else if (error instanceof ApiError) {
          setAlert({ title: 'Could not update task', message: error.message });
        }
      }
    },
    [updateTask, visibleTasks]
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
      if (selection) {
        setSelection((ids) =>
          ids == null ? ids : ids.includes(task.id) ? ids.filter((id) => id !== task.id) : [...ids, task.id]
        );
        return;
      }
      if (closeCard()) return;
      if (twoPane) {
        setPaneTask(taskRef(task));
        return;
      }
      setExpandedId(task.id);
    },
    [closeCard, selection, twoPane]
  );

  const startSelecting = useCallback(
    (task: Task) => {
      closeCard();
      setSelection((ids) => (ids == null ? [task.id] : ids.includes(task.id) ? ids : [...ids, task.id]));
    },
    [closeCard]
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
      } else if (result.kind === 'create-list') {
        await handleCreateListRef.current(result.name);
      } else if (result.kind === 'create') {
        try {
          const { failed } = await createWithChecklist({
            task: result.payload,
            checklist: result.checklist.map((title) => ({ title })),
          });
          if (failed.length > 0) {
            setAlert({
              title: 'To-do created with a partial checklist',
              message: failed.map((item) => item.title).join(', '),
            });
          } else {
            haptics.success();
          }
        } catch (error) {
          setAlert({
            title: 'Could not create to-do',
            message: error instanceof ApiError ? error.message : 'Please try again.',
          });
        }
      }
    },
    [createWithChecklist, updateTask]
  );

  /** Scroll just enough that an opened card clears the header and the action bar. */
  const revealCard = useCallback(
    (top: number, bottom: number) => {
      // While typing, the keyboard-aware list already keeps the focused field
      // above the keyboard and the action bar. A second scroll here would fight it.
      if (isKeyboardVisible()) return;
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

  // My lists hands over "New list": open the form here, where the accounts are.
  const createListRequested = useUiStore((s) => s.createListRequested);
  const requestCreateList = useUiStore((s) => s.requestCreateList);
  useEffect(() => {
    if (!createListRequested) return;
    // Wait for the back transition so the form doesn't open under it.
    const timer = setTimeout(() => {
      requestCreateList(false);
      setCreateListOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [createListRequested, requestCreateList]);

  // Search hands over a task to open in place (Things Quick Find behavior).
  const openTask = useUiStore((s) => s.openTask);
  const requestOpenTask = useUiStore((s) => s.requestOpenTask);
  useEffect(() => {
    if (!openTask || allTasks.length === 0) return;
    // A frame's delay lets the tab switch settle before the card springs open.
    const frame = requestAnimationFrame(() => {
      requestOpenTask(null);
      const target = findTaskRow(allTasks, openTask);
      if (!target) return;
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
    openTask,
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
    const draftId = draft
      ? setCreateHandoff({
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
      })
      : undefined;
    router.push({ pathname: '/new-task', params: { draftId } });
  }, []);

  // Android back leaves select mode first.
  useEffect(() => {
    if (selection == null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelection(null);
      return true;
    });
    return () => sub.remove();
  }, [selection]);

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
  useEffect(() => {
    handleCreateListRef.current = (name) => handleCreateList(name);
  }, [handleCreateList]);

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
  const selectedTasks = useMemo(() => {
    if (!selection) return [];
    const byId = new Map(flattenTasks(allTasks).map((task) => [task.id, task]));
    return selection.map((id) => byId.get(id)).filter((task): task is Task => task != null);
  }, [allTasks, selection]);

  const runBulk = useCallback(
    (input: Parameters<typeof bulk.mutateAsync>[0]) => {
      setSelection(null);
      if (input.tasks.length === 0) return;
      bulk
        .mutateAsync(input)
        .then(({ failed, total }) => {
          if (failed) {
            setAlert({
              title: `${failed} of ${total} didn't go through`,
              message: 'Check your connection and try those again.',
            });
          }
        })
        .catch(() => setAlert({ title: 'Something went wrong', message: 'Please try again.' }));
    },
    [bulk]
  );

  /** Merge: the first pick keeps its title, the rest join its notes. */
  const mergeSelected = useCallback(async () => {
    const [keep, ...rest] = selectedTasks;
    if (!keep || rest.length === 0) return;
    const lines = rest.map((task) => {
      const notes = task.markdown.trim();
      return notes ? `- ${task.title}\n${notes.replace(/^/gm, '  ')}` : `- ${task.title}`;
    });
    const markdown = [keep.markdown.trim(), lines.join('\n')].filter(Boolean).join('\n\n');
    const tags = [...new Set([...keep.tags, ...rest.flatMap((task) => task.tags)])];
    setSelection(null);
    try {
      await updateTask.mutateAsync({
        taskId: keep.id,
        accountId: keep.account_id,
        patch: { markdown, tags, etag: keep.etag },
      });
      runBulk({ kind: 'delete', tasks: rest });
    } catch (error) {
      setAlert({
        title: 'Could not merge',
        message: error instanceof ApiError ? error.message : 'Please try again.',
      });
    }
  }, [runBulk, selectedTasks, updateTask]);

  const isLoading = tasksQuery.isLoading;
  const isFetching = tasksQuery.isFetching || (githubEnabled && githubQuery.isFetching);
  const isEmpty = baseTasks.length === 0 && (!githubEnabled || githubIssues.length === 0);
  /** A smart tile is on and nothing matches it, while the list itself has to-dos. */
  const smartEmpty = smart != null && visibleTasks.length === 0 && baseTasks.length > 0;
  const showCenteredState = isEmpty && !githubEnabled && !isLoading;
  const needsCalDavAccount = isMissingCalDavAccountError(tasksQuery.error);

  const repoOpen = repoFilter ? (repoIssueCounts[repoFilter.toLowerCase()] ?? 0) : 0;
  const heroTitle = repoFilter
    ? (repoFilter.split('/')[1] ?? repoFilter)
    : (selectedList?.name ?? 'All Tasks');
  const percent = selectedList ? completionPercent(visibleTasks) : null;
  const heroSubtitle = repoFilter
    ? `${repoOpen} open issue${repoOpen === 1 ? '' : 's'} · ${repoFilter.split('/')[0]}`
    : selection
      ? `${selection.length} selected · long-press more or tap to add`
      : `${visibleOpen} open${percent != null && percent > 0 ? ` · ${percent}% done` : ''}${selectedList?.account_name ? ` · ${selectedList.account_name}` : ''}`;

  const listView = (
    <>
      {/* Things-style: the list name is the page title, so no nav header. */}
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardScrollView
        ref={scrollRef}
        // With a card open the action bar rides on the keyboard, so the field
        // being typed in has to clear the bar as well.
        bottomOffset={expandedId ? ACTION_BAR_CLEARANCE : FIELD_CLEARANCE}
        className="flex-1"
        style={{ backgroundColor: colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
          onTabBarScroll(event);
          if (Platform.OS === 'ios') {
            const under = event.nativeEvent.contentOffset.y + event.nativeEvent.contentInset.top > 8;
            if (under !== underStatusBar) setUnderStatusBar(under);
          }
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
          <View className="flex-row items-start justify-between gap-2">
            <View style={{ flexShrink: 1 }}>
              <ListHero
                title={heroTitle}
                subtitle={heroSubtitle}
                kind={repoFilter ? 'repo' : selectedList ? 'list' : 'all'}
                onOfflinePress={offline ? () => setOfflineDismissed(false) : undefined}
                // One list switcher everywhere: My lists, the same screen the tiles open.
                onPress={() => {
                  if (closeCard()) return;
                  router.push('/lists');
                }}
                menu={{
                  lists,
                  repos: githubConnection.status === 'connected' ? githubRepositories : [],
                  selectedListId,
                  onSelect: setSelectedListId,
                  onCreate: () => setCreateListOpen(true),
                  onEdit: selectedList
                    ? () =>
                        router.push({
                          pathname: '/edit-list',
                          params: { listId: selectedList.id, name: selectedList.name },
                        })
                    : null,
                }}
              />
            </View>
            {process.env.EXPO_OS !== 'web' ? (
              <View style={{ marginTop: Platform.OS === 'ios' ? 4 : 2 }}>
                <HeaderIcons
                  items={[
                    { icon: 'calendar-month-outline', label: 'Calendar', href: '/calendar' },
                    { icon: 'head-lightbulb-outline', label: 'Brain dump', href: '/brain-dump' },
                    { icon: 'timer-outline', label: 'Focus timer', href: '/pomodoro' },
                  ]}
                />
              </View>
            ) : null}
          </View>
          {/* Background refresh: under the title, clear of the status bar and cutout. */}
          {isFetching && !isLoading && !pulling ? <LoadingBar style={{ marginTop: -4 }} /> : null}
          {!repoFilter && selection == null && !isLoading && !showCenteredState ? (
            <SmartTiles
              counts={smartTileCounts}
              selected={smart}
              onSelect={setSmart}
              listCount={lists.length}
              onOpenLists={() => {
                if (closeCard()) return;
                router.push('/lists');
              }}
            />
          ) : null}
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
          <StatusBanner
            tone="info"
            icon="cloud-plus-outline"
            sf="person.crop.circle.badge.plus"
            title="Connect a CalDAV account"
            body="GitHub issues work already. Connect CalDAV to sync your to-dos too."
            primary={{ label: 'Connect', onPress: () => router.push('/settings/account') }}
          />
        ) : (
          // Offline, failed loads, partial sync and the outbox, as one banner.
          <SyncBanner
            warnings={tasksQuery.isError ? [] : taskWarnings ?? []}
            error={tasksQuery.isError && !showCenteredState ? tasksQuery.error : undefined}
            onRetry={() => tasksQuery.refetch()}
          />
        )}

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
            {smartEmpty ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <MaterialCommunityIcons name="check-circle-outline" size={36} color={colors.text3} />
                <Text style={{ color: colors.text2, fontSize: 15 }}>Nothing here. Enjoy the gap.</Text>
              </View>
            ) : null}
            {pinned.length > 0 ? (
              <Section
                title="Pinned"
                icon="pin-outline"
                count={pinned.length}
                collapsed={!!collapsed.pinned}
                onToggle={() => (closeCard() ? undefined : toggleSection('pinned'))}>
                <DraggableColumn
                  data={pinned}
                  keyExtractor={(task) => task.id}
                  onReorder={handleReorder}
                  indicatorColor={colors.accent}
                  dragEnabled={expandedId == null && selection == null}
                  onHold={startSelecting}
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
                        onLongPress={startSelecting}
                        selecting={selection != null}
                        checked={selection?.includes(task.id) ?? false}
                        showList={!selectedListId}
                        dimmed={expandedId != null}
                        selected={twoPane && paneTask != null && matchesTask(task, paneTask)}
                      />
                    )
                  }
                />
              </Section>
            ) : null}
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
                  dragEnabled={expandedId == null && selection == null}
                  onHold={startSelecting}
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
                        onLongPress={startSelecting}
                        selecting={selection != null}
                        checked={selection?.includes(task.id) ?? false}
                        showList={!selectedListId}
                        dimmed={expandedId != null}
                        selected={twoPane && paneTask != null && matchesTask(task, paneTask)}
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
                      onLongPress={startSelecting}
                      selecting={selection != null}
                      checked={selection?.includes(task.id) ?? false}
                      showList={!selectedListId}
                      dimmed={expandedId != null}
                      selected={twoPane && paneTask != null && matchesTask(task, paneTask)}
                    />
                  )
                )}
                {selection == null ? (
                  <Pressable
                    onPress={() => {
                      if (closeCard()) return;
                      haptics.tap();
                      setConfirmBulk('clear');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Clear ${completed.length} completed to-dos`}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 44, justifyContent: 'center', paddingLeft: 4 })}>
                    <View className="flex-row items-center gap-2">
                      <MaterialCommunityIcons name="broom" size={18} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>
                        Clear completed
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
              </Section>
            ) : null}

            {githubEnabled && !selectedList && !smart ? (
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
      </KeyboardScrollView>
      {Platform.OS === 'ios' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top,
            overflow: 'hidden',
            opacity: underStatusBar ? 1 : 0,
          }}>
          <Frost strength={0.2} intensity={80} />
        </View>
      ) : null}
      {process.env.EXPO_OS !== 'web' && expandedId == null && selection == null ? (
        <>
          <DictateFab onPress={() => setDictating(true)} />
          <Fab onPress={openNewCard} accessibilityLabel="New to-do" />
        </>
      ) : null}
      {selection != null ? (
        <SelectionBar
          bottom={fabBottom}
          count={selectedTasks.length}
          onCancel={() => setSelection(null)}
          onComplete={() => runBulk({ kind: 'update', tasks: selectedTasks, patch: (task) => togglePatch({ ...task, completed: false }).patch })}
          onMove={() => setBulkMoveOpen(true)}
          onPin={() => {
            const pin = !selectedTasks.every((task) => task.pinned);
            runBulk({ kind: 'update', tasks: selectedTasks, patch: () => ({ pinned: pin }) });
          }}
          onMerge={() => setConfirmBulk('merge')}
          onDelete={() => setConfirmBulk('delete')}
        />
      ) : null}
      <ListPicker
        visible={bulkMoveOpen}
        lists={lists}
        selectedId={null}
        title={`Move ${selectedTasks.length} to`}
        onSelect={(list) => {
          setBulkMoveOpen(false);
          runBulk({
            kind: 'update',
            tasks: selectedTasks.filter((task) => task.list_id !== list.id),
            patch: () => ({ list_id: list.id }),
          });
        }}
        onClose={() => setBulkMoveOpen(false)}
      />
      <NativeAlert
        visible={confirmBulk != null}
        title={
          confirmBulk === 'merge'
            ? `Merge ${selectedTasks.length} to-dos?`
            : confirmBulk === 'clear'
              ? `Clear ${completed.length} completed?`
              : `Delete ${selectedTasks.length} to-do${selectedTasks.length === 1 ? '' : 's'}?`
        }
        message={
          confirmBulk === 'merge'
            ? `"${selectedTasks[0]?.title ?? ''}" keeps its title. The others become a list in its notes and move to the recycle bin.`
            : 'They move to the recycle bin in Settings, where you can restore them for 30 days.'
        }
        confirmLabel={confirmBulk === 'merge' ? 'Merge' : confirmBulk === 'clear' ? 'Clear' : 'Delete'}
        dismissLabel="Cancel"
        onDismiss={() => setConfirmBulk(null)}
        onConfirm={() => {
          const action = confirmBulk;
          setConfirmBulk(null);
          if (action === 'clear') {
            playSound('delete');
            runBulk({ kind: 'delete', tasks: completed });
          } else if (action === 'delete') {
            playSound('delete');
            runBulk({ kind: 'delete', tasks: selectedTasks });
          } else if (action === 'merge') {
            void mergeSelected();
          }
        }}
      />
      <DictationSheet
        visible={dictating}
        lists={lists}
        availableTags={allTags}
        defaultListId={selectedListId && !selectedListId.startsWith('gh:') ? selectedListId : lists[0]?.id}
        onClose={() => setDictating(false)}
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
              setPaneTask(taskRef(task));
            } else {
              router.push({ pathname: '/task/[uid]', params: { ...taskRef(task) } });
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
          playSound('delete');
          deleteTask
            .mutateAsync({ taskId: task.id, accountId: task.account_id, etag: task.etag })
            .then(() => cancelTaskReminder(taskRef(task)))
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
        {paneTask ? (
          <TaskPaneContext value={pane}>
            <TaskDetailView key={taskKey(paneTask)} {...paneTask} />
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

const HEADER_SF = {
  '/calendar': 'calendar',
  '/brain-dump': 'brain.head.profile',
  '/pomodoro': 'timer',
} as const;

/**
 * Shortcuts in the title row. Android: M3 standard icon buttons that morph
 * their shape while pressed, tonal when the timer runs. iOS 26: one Liquid
 * Glass capsule holding SF Symbols, like a system toolbar group.
 */
function HeaderIcons({ items }: { items: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; href: keyof typeof HEADER_SF }[] }) {
  const { colors, scheme } = useTheme();
  const running = usePomodoroStore((s) => s.phase !== 'idle');
  if (Platform.OS === 'android') {
    // M3 Expressive connected button group; the timer button is "selected" while it runs.
    return (
      <ConnectedButtonGroup
        items={items.map((item) => ({
          icon: item.icon,
          label: item.label,
          selected: item.href === '/pomodoro' && running,
          onPress: () => router.push(item.href),
        }))}
      />
    );
  }
  const buttons = items.map((item) => {
    const active = item.href === '/pomodoro' && running;
    return (
      <ElasticPressable
        variant="button"
        key={item.href}
        onPress={() => {
          haptics.tap();
          router.push(item.href);
        }}
        accessibilityRole="button"
        accessibilityLabel={active ? `${item.label}, running` : item.label}
        android_ripple={{ color: colors.separator, borderless: true, radius: 22 }}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: pressed ? 12 : 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active && Platform.OS !== 'ios' ? colors.selectionBg : 'transparent',
          opacity: pressed && Platform.OS === 'ios' ? 0.5 : 1,
        })}>
        {Platform.OS === 'ios' ? (
          <SymbolView name={HEADER_SF[item.href]} size={20} weight="medium" tintColor={active ? colors.accent : colors.text} />
        ) : (
          <MaterialCommunityIcons name={item.icon} size={24} color={active ? colors.onSelectionBg : colors.text2} />
        )}
      </ElasticPressable>
    );
  });
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme} style={{ flexDirection: 'row', borderRadius: 22, paddingHorizontal: 2 }}>
        {buttons}
      </GlassView>
    );
  }
  return <View className="flex-row">{buttons}</View>;
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
