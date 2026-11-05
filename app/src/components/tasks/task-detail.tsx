import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { createContext, use, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import type { Task, TaskList, TaskUpdate } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { DateField } from '@/components/tasks/date-field';
import { ListPicker } from '@/components/tasks/list-picker';
import { MarkdownNotes } from '@/components/tasks/markdown-notes';
import { MoveToDeck } from '@/components/tasks/move-to-deck';
import { TaskActionBar } from '@/components/tasks/task-action-bar';
import { TaskCheckbox } from '@/components/tasks/task-checkbox';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { useDeviceCalendars } from '@/hooks/use-calendars';
import {
  useCreateTask,
  useDeleteTask,
  useTaskLists,
  useTasks,
  useUpdateTask,
} from '@/hooks/use-tasks';
import { addTaskToCalendar } from '@/lib/calendar';
import { formatDateTime } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { DURATION, SPRING } from '@/lib/motion';
import { cancelTaskReminder } from '@/lib/notifications';
import { useTabBarFabOffset } from '@/lib/tab-bar';
import { collectAllTags, normalizeTags } from '@/lib/tags';
import { useFocusStore } from '@/stores/focus-store';
import { useTagPickerStore } from '@/stores/tag-picker-store';
import { ScrollView, Text, TextInput, View } from '@/tw';
import { endFocus, pauseFocus, resumeFocus, startFocus } from '@/widgets/focus';

const PRIORITIES: { label: string; value: number | null }[] = [
  { label: 'None', value: null },
  { label: 'Low', value: 9 },
  { label: 'Medium', value: 5 },
  { label: 'High', value: 1 },
];

/** Snap an arbitrary CalDAV PRIORITY (0–9) onto the buckets the control offers. */
function toPriorityBucket(priority: number | null | undefined): number | null {
  if (priority == null || priority === 0) return null;
  if (priority <= 4) return 1;
  if (priority === 5) return 5;
  return 9;
}

function findByUid(tasks: Task[], uid: string): Task | null {
  for (const task of tasks) {
    if (task.uid === uid) return task;
    const child = findByUid(task.children, uid);
    if (child) return child;
  }
  return null;
}

/**
 * Left edge shared by the breadcrumb, title, notes and tags: the checkbox's
 * 44dp touch target minus the 10dp it is pulled into the page margin.
 */
const TEXT_INSET = 34;

const SPATIAL = LinearTransition.springify()
  .damping(SPRING.spatialSlow.damping)
  .stiffness(SPRING.spatialSlow.stiffness);

/**
 * Set when the detail renders as the trailing pane of the Tasks split view
 * (iPad, unfolded foldables, tablets). Without it the detail is a pushed
 * screen that owns the navigation header and goes back when done.
 */
export interface TaskPane {
  open: (uid: string) => void;
  close: () => void;
}

export const TaskPaneContext = createContext<TaskPane | null>(null);

/** Full to-do editor, as a pushed screen or as the split view's detail pane. */
export function TaskDetailView({ uid }: { uid: string | undefined }) {
  const { colors } = useTheme();
  const pane = use(TaskPaneContext);
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();

  // expo-router already decodes params; still tolerate double-encoding.
  const decodedUid = uid
    ? (() => {
        try {
          return decodeURIComponent(uid);
        } catch {
          return uid;
        }
      })()
    : null;
  const task = decodedUid ? findByUid(tasksQuery.data ?? [], decodedUid) : null;
  const lists = useMemo(
    () => (listsQuery.data ?? []).filter((list) => !list.is_deck),
    [listsQuery.data],
  );
  const availableTags = useMemo(() => collectAllTags(tasksQuery.data ?? []), [tasksQuery.data]);

  if (!task) {
    if (tasksQuery.isLoading) {
      return <LoadingState message="Loading task…" subtitle="Fetching from CalDAV" />;
    }
    return (
      <View
        className="flex-1 items-center justify-center gap-3 px-8"
        style={{ backgroundColor: colors.bg }}>
        {pane ? null : <Stack.Screen options={{ title: '' }} />}
        <Text className="text-sf-text-2 text-center" selectable>
          {tasksQuery.isError
            ? tasksQuery.error instanceof Error
              ? tasksQuery.error.message
              : 'Task could not be loaded.'
            : 'Task not found.'}
        </Text>
        {tasksQuery.isError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => tasksQuery.refetch()}
            className="mt-2">
            <Text className="text-sf-blue text-base font-semibold">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // Keyed by uid so local edits survive refetches of the same task but reset
  // cleanly when navigating to a different one (e.g. a checklist item).
  return (
    <TaskDocument
      key={task.uid}
      task={task}
      lists={
        lists.length > 0
          ? lists
          : [
              {
                id: task.list_id,
                href: '',
                name: task.list_name,
                is_deck: false,
              },
            ]
      }
      availableTags={availableTags}
    />
  );
}

interface Draft {
  title: string;
  markdown: string;
  list_id: string;
  tags: string[];
  due_at: string | null;
  reminder_at: string | null;
  priority: number | null;
}

function draftFromTask(task: Task): Draft {
  return {
    title: task.title,
    markdown: task.markdown,
    list_id: task.list_id,
    tags: normalizeTags(task.tags),
    due_at: task.due_at,
    reminder_at: task.reminder_at,
    priority: toPriorityBucket(task.priority),
  };
}

function diffDraft(saved: Draft, next: Draft): TaskUpdate {
  const patch: TaskUpdate = {};
  const title = next.title.trim();
  if (title && title !== saved.title) patch.title = title;
  if (next.markdown !== saved.markdown) patch.markdown = next.markdown;
  if (next.list_id !== saved.list_id) patch.list_id = next.list_id;
  if (next.tags.join('\u0000') !== saved.tags.join('\u0000')) patch.tags = next.tags;
  if (next.due_at !== saved.due_at) patch.due_at = next.due_at;
  if (next.reminder_at !== saved.reminder_at) patch.reminder_at = next.reminder_at;
  if (next.priority !== saved.priority) patch.priority = next.priority;
  return patch;
}

/**
 * Full-screen to-do, laid out like a Things project page rather than a form:
 * a big checkbox and title, plain notes, the checklist, then quiet property
 * rows. There is no Save button; every change is written back to CalDAV as it
 * happens (text fields on blur and when leaving the screen).
 */
function TaskDocument({
  task,
  lists,
  availableTags,
}: {
  task: Task;
  lists: TaskList[];
  availableTags: string[];
}) {
  const { colors } = useTheme();
  const pane = use(TaskPaneContext);
  const insets = useSafeAreaInsets();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const openTagPicker = useTagPickerStore((s) => s.open);
  const fabBottom = useTabBarFabOffset();

  const [draft, setDraft] = useState<Draft>(() => draftFromTask(task));
  const [checklistDraft, setChecklistDraft] = useState('');
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // What the server has. Each save diffs against this and then advances it.
  const saved = useRef<Draft>(draftFromTask(task));
  const latest = useRef<Draft>(draft);
  // A list move changes the task's href, and every write returns a new etag,
  // so carry both forward instead of reusing the props from first render.
  const taskId = useRef(task.id);
  const etag = useRef(task.etag);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function flush() {
    const patch = diffDraft(saved.current, latest.current);
    if (Object.keys(patch).length === 0) return;
    saved.current = {
      ...latest.current,
      title: latest.current.title.trim() || saved.current.title,
    };
    // Writes are chained so a fast second edit can't race the first one's etag.
    queue.current = queue.current.then(async () => {
      try {
        const updated = await updateTask.mutateAsync({
          taskId: taskId.current,
          accountId: task.account_id,
          patch: { ...patch, parent_uid: task.parent_uid, etag: etag.current },
        });
        taskId.current = updated.id;
        etag.current = updated.etag;
      } catch (error) {
        setAlert({
          title: 'Could not save',
          message: error instanceof ApiError ? error.message : 'Your last change was not saved.',
        });
      }
    });
  }

  /** Update local state and, for discrete fields, save straight away. */
  function change(patch: Partial<Draft>, save = true) {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    if (save) flush();
  }

  // Leaving the screen saves whatever is still pending (typed text).
  const onLeave = useEffectEvent(() => flush());
  useEffect(() => () => onLeave(), []);

  function pickTags() {
    haptics.tap();
    const pool = normalizeTags([...availableTags, ...draft.tags]).sort((a, b) =>
      a.localeCompare(b),
    );
    openTagPicker(pool, draft.tags, (tags) => change({ tags: normalizeTags(tags) }));
    router.push('/tags');
  }

  async function toggleTask(target: Task) {
    try {
      await updateTask.mutateAsync({
        taskId: target.id === task.id ? taskId.current : target.id,
        accountId: target.account_id,
        patch: {
          completed: !target.completed,
          etag: target.id === task.id ? etag.current : target.etag,
        },
      });
    } catch {
      // The hook rolls back its optimistic update.
    }
  }

  async function addChecklistItem() {
    const title = checklistDraft.trim();
    if (!title) return;
    setChecklistDraft('');
    haptics.tap();
    try {
      await createTask.mutateAsync({
        list_id: draft.list_id,
        title,
        parent_uid: task.uid,
      });
    } catch (error) {
      setAlert({
        title: 'Could not add item',
        message: error instanceof ApiError ? error.message : 'Try again.',
      });
    }
  }

  async function confirmDelete() {
    setDeleteVisible(false);
    try {
      await deleteTask.mutateAsync({
        taskId: taskId.current,
        accountId: task.account_id,
        etag: etag.current,
      });
      await cancelTaskReminder(task.uid);
      // Nothing left to save once the task is gone.
      saved.current = latest.current;
      if (pane) pane.close();
      else router.back();
    } catch {
      setAlert({
        title: 'Delete failed',
        message: 'Could not delete the task.',
      });
    }
  }

  const listName = lists.find((l) => l.id === draft.list_id)?.name ?? task.list_name;
  const children = task.children;
  const doneCount = children.filter((c) => c.completed).length;

  return (
    <>
      {pane ? (
        // Split view: no navigation header in the detail pane, so the
        // breadcrumb and a close button sit in a toolbar of its own.
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingTop: insets.top + 8,
            paddingHorizontal: 12,
            paddingBottom: 4,
            backgroundColor: colors.bg,
          }}>
          <View
            accessible
            accessibilityLabel={`In ${listName}`}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8 }}>
            <MaterialCommunityIcons name="format-list-bulleted" size={16} color={colors.text2} />
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: colors.text2 }}>
              {listName}
            </Text>
          </View>
          <Pressable
            onPress={pane.close}
            accessibilityRole="button"
            accessibilityLabel="Close to-do"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.bg3 : 'transparent',
            })}>
            <MaterialCommunityIcons name="close" size={22} color={colors.text2} />
          </Pressable>
        </View>
      ) : (
        <Stack.Screen
          options={{
            headerLargeTitle: false,
            headerTitleAlign: 'left',
            contentStyle: { backgroundColor: colors.bg },
            // The list this to-do lives in sits beside the back button as a
            // tappable pill, instead of on a line of its own above the title.
            // Where this to-do lives, as a quiet breadcrumb. Changing the list is
            // the Move button's job, so this is not a second control for it.
            headerTitle: () => (
              <View
                accessible
                accessibilityLabel={`In ${listName}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="format-list-bulleted" size={16} color={colors.text2} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text2 }}>{listName}</Text>
              </View>
            ),
          }}
        />
      )}
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 140 + keyboardHeight,
        }}>
        {/* Hero: checkbox + title */}
        <View className="flex-row items-start">
          <View style={{ marginLeft: -10, marginTop: 2 }}>
            <TaskCheckbox
              checked={task.completed}
              size={26}
              onToggle={() => toggleTask(task)}
              label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            />
          </View>
          <TextInput
            value={draft.title}
            onChangeText={(title) => change({ title }, false)}
            onBlur={flush}
            multiline
            submitBehavior="blurAndSubmit"
            placeholder="New To-Do"
            placeholderTextColor={colors.text3}
            accessibilityLabel="Title"
            className="text-sf-text flex-1"
            style={{
              fontSize: 28,
              lineHeight: 34,
              fontWeight: '700',
              letterSpacing: -0.4,
              paddingVertical: 6,
              paddingHorizontal: 0,
              textDecorationLine: task.completed ? 'line-through' : 'none',
            }}
          />
        </View>

        {/* Notes: rendered Markdown until tapped, then a plain text field. */}
        <View style={{ marginLeft: TEXT_INSET, marginTop: 4 }}>
          <MarkdownNotes
            value={draft.markdown}
            onChangeText={(markdown) => change({ markdown }, false)}
            onBlur={flush}
            inputStyle={{ minHeight: 40 }}
          />
        </View>

        {/* Tags */}
        <Animated.View
          layout={SPATIAL}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginLeft: TEXT_INSET,
            marginTop: 16,
          }}>
          {draft.tags.map((tag) => (
            <Pressable key={tag} onPress={pickTags} accessibilityLabel={`Tag ${tag}, edit tags`}>
              <View
                style={{
                  backgroundColor: colors.selectionBg,
                  paddingHorizontal: 14,
                  height: 32,
                  justifyContent: 'center',
                  borderRadius: 16,
                }}>
                <Text
                  style={{
                    color: colors.onSelectionBg,
                    fontSize: 14,
                    fontWeight: '600',
                  }}>
                  {tag}
                </Text>
              </View>
            </Pressable>
          ))}
          <Pressable
            onPress={pickTags}
            accessibilityRole="button"
            accessibilityLabel={draft.tags.length ? 'Edit tags' : 'Add tags'}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              height: 32,
              paddingHorizontal: 12,
              borderRadius: pressed ? 16 : 8,
              borderWidth: 1,
              borderColor: colors.gray2,
            })}>
            <MaterialCommunityIcons name="tag-plus-outline" size={16} color={colors.text2} />
            <Text style={{ color: colors.text2, fontSize: 14 }}>
              {draft.tags.length ? 'Edit' : 'Add tags'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Checklist */}
        <Heading
          title="Checklist"
          detail={children.length > 0 ? `${doneCount}/${children.length}` : undefined}
        />
        {children.map((child) => (
          <Animated.View
            key={child.id}
            entering={FadeIn.duration(DURATION.medium1)}
            layout={SPATIAL}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 48,
            }}>
            <View style={{ marginLeft: -11 }}>
              <TaskCheckbox
                checked={child.completed}
                variant="circle"
                size={20}
                onToggle={() => toggleTask(child)}
                label={`${child.completed ? 'Uncheck' : 'Check'} ${child.title}`}
              />
            </View>
            <Pressable
              className="flex-1"
              onPress={() =>
                pane
                  ? pane.open(child.uid)
                  : router.push({
                      pathname: '/task/[uid]',
                      params: { uid: child.uid },
                    })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open ${child.title}`}
              style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 17,
                  color: child.completed ? colors.text3 : colors.text,
                  textDecorationLine: child.completed ? 'line-through' : 'none',
                }}>
                {child.title}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
        <View className="flex-row items-center" style={{ minHeight: 48 }}>
          <MaterialCommunityIcons
            name="plus"
            size={22}
            color={colors.accent}
            style={{ width: 33 }}
          />
          <TextInput
            value={checklistDraft}
            onChangeText={setChecklistDraft}
            onSubmitEditing={addChecklistItem}
            submitBehavior="submit"
            placeholder="Add checklist item"
            placeholderTextColor={colors.text3}
            returnKeyType="next"
            accessibilityLabel="Add checklist item"
            className="text-sf-text flex-1"
            style={{ fontSize: 17, paddingVertical: 10 }}
          />
        </View>

        {/* Properties */}
        <Heading title="Details" />
        <PropertyGroup>
          <PropertyCell>
            <DateField
              label="Deadline"
              iconName="flag-outline"
              value={draft.due_at}
              onChange={(due_at) => change({ due_at })}
            />
          </PropertyCell>
          <PropertyCell>
            <DateField
              label="Reminder"
              iconName="bell-outline"
              value={draft.reminder_at}
              onChange={(reminder_at) => change({ reminder_at })}
            />
          </PropertyCell>
          <PropertyCell last={!(draft.due_at || draft.reminder_at)}>
            <View className="gap-3">
              <View className="flex-row items-center gap-3">
                <MaterialCommunityIcons name="signal-cellular-2" size={20} color={colors.accent} />
                <Text className="text-sf-text text-base">Priority</Text>
              </View>
              <SegmentedChoice
                options={PRIORITIES}
                value={draft.priority}
                onChange={(priority) => change({ priority })}
              />
            </View>
          </PropertyCell>
          {draft.due_at || draft.reminder_at ? (
            <CalendarCopy
              open={calendarOpen}
              onToggle={() => setCalendarOpen((v) => !v)}
              onCopy={async (calendarId) => {
                setCalendarOpen(false);
                try {
                  await addTaskToCalendar({
                    calendarId,
                    title: latest.current.title,
                    notes: latest.current.markdown,
                    dueAt: latest.current.due_at,
                    reminderAt: latest.current.reminder_at,
                  });
                  haptics.success();
                  setAlert({
                    title: 'Added to calendar',
                    message: 'A calendar event was created.',
                  });
                } catch {
                  setAlert({
                    title: 'Calendar',
                    message: 'Could not add the event to that calendar.',
                  });
                }
              }}
            />
          ) : null}
          {!task.parent_uid ? <MoveToDeck task={task} inline /> : null}
        </PropertyGroup>

        {Platform.OS === 'ios' ? <FocusSection taskUid={task.uid} taskTitle={draft.title} /> : null}

        {task.updated_at ? (
          <Text className="text-sf-text-3 pt-4 text-xs">
            Modified {formatDateTime(task.updated_at)}
          </Text>
        ) : null}
      </ScrollView>

      <TaskActionBar
        bottom={fabBottom}
        onMove={() => setListPickerOpen(true)}
        onDelete={() => setDeleteVisible(true)}
      />

      <ListPicker
        visible={listPickerOpen}
        lists={lists}
        selectedId={draft.list_id}
        onSelect={(list) => {
          setListPickerOpen(false);
          if (
            task.children.length > 0 &&
            list.account_id &&
            task.account_id &&
            list.account_id !== task.account_id
          ) {
            setAlert({
              title: 'Move checklist first',
              message:
                'A to-do with checklist items cannot move to another account because CalDAV parent links do not cross servers.',
            });
            return;
          }
          change({ list_id: list.id });
        }}
        onClose={() => setListPickerOpen(false)}
      />
      <NativeAlert
        visible={deleteVisible}
        title="Delete to-do"
        message={
          children.length > 0
            ? `Delete "${draft.title}"? Its ${children.length} checklist item${children.length === 1 ? '' : 's'} will remain as separate to-dos.`
            : `Delete "${draft.title}"?`
        }
        confirmLabel="Delete"
        dismissLabel="Cancel"
        onDismiss={() => setDeleteVisible(false)}
        onConfirm={confirmDelete}
      />
      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />
    </>
  );
}

/** Things-style section heading: accent label over a hairline. */
function Heading({ title, detail }: { title: string; detail?: string }) {
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-end justify-between"
      style={{ marginTop: 28, paddingBottom: 6 }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.accent }}>{title}</Text>
      {detail ? (
        <Text
          style={{
            fontSize: 14,
            color: colors.text2,
            fontVariant: ['tabular-nums'],
          }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/** One soft M3 surface for all the property rows; spacing, not lines, separates them. */
function PropertyGroup({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginTop: 6,
        paddingHorizontal: 16,
        paddingVertical: 4,
        borderRadius: 24,
        borderCurve: 'continuous',
        backgroundColor: colors.bg2,
      }}>
      {children}
    </View>
  );
}

function PropertyCell({ children }: { children: React.ReactNode; last?: boolean }) {
  return <View style={{ paddingVertical: 12 }}>{children}</View>;
}

function CalendarCopy({
  open,
  onToggle,
  onCopy,
}: {
  open: boolean;
  onToggle: () => void;
  onCopy: (calendarId: string) => void;
}) {
  const { colors } = useTheme();
  // Listing calendars asks for OS permission, so only query once expanded.
  const calendarsQuery = useDeviceCalendars(open);
  const calendars = calendarsQuery.data ?? [];
  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        android_ripple={{ color: colors.separator }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 56,
        }}>
        <MaterialCommunityIcons name="calendar-plus" size={20} color={colors.accent} />
        <Text className="text-sf-text flex-1 text-base">Add to calendar</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.text3}
        />
      </Pressable>
      {open ? (
        <View style={{ paddingLeft: 32, paddingBottom: 8 }}>
          {calendarsQuery.isLoading ? (
            <Text className="text-sf-text-2 py-2 text-sm">Loading calendars…</Text>
          ) : null}
          {calendars.map((calendar) => (
            <Pressable
              key={calendar.id}
              onPress={() => onCopy(calendar.id)}
              accessibilityRole="button"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 44,
              }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: calendar.color ?? colors.gray,
                }}
              />
              <Text className="text-sf-text text-base">{calendar.title}</Text>
            </Pressable>
          ))}
          {!calendarsQuery.isLoading && calendars.length === 0 ? (
            <Text className="text-sf-text-2 py-2 text-sm">No writable calendars found.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function FocusSection({ taskUid, taskTitle }: { taskUid: string; taskTitle: string }) {
  const { colors } = useTheme();
  const activeUid = useFocusStore((s) => s.taskUid);
  const paused = useFocusStore((s) => s.paused);
  const durationSeconds = useFocusStore((s) => s.durationSeconds);
  const startedAt = useFocusStore((s) => s.startedAt);
  const isMine = activeUid === taskUid && startedAt != null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isMine || paused) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isMine, paused]);
  const remainingMin = isMine
    ? Math.max(0, Math.ceil((durationSeconds - (now - (startedAt ?? 0)) / 1000) / 60))
    : 0;

  return (
    <>
      <Heading title="Focus" />
      <View className="flex-row items-center justify-between" style={{ minHeight: 56 }}>
        <View className="flex-row items-center gap-3">
          <MaterialCommunityIcons name="timer-outline" size={20} color={colors.accent} />
          <Text className="text-sf-text text-base">
            {isMine ? (paused ? 'Paused' : `${remainingMin} min left`) : '25-minute session'}
          </Text>
        </View>
        {isMine ? (
          <View className="flex-row gap-4">
            <Pressable
              onPress={() => (paused ? resumeFocus() : pauseFocus())}
              accessibilityRole="button"
              hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 16 }}>
                {paused ? 'Resume' : 'Pause'}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => endFocus()} hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 16 }}>End</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => startFocus(taskUid, taskTitle, 25 * 60)}
            hitSlop={8}>
            <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>Start</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}
