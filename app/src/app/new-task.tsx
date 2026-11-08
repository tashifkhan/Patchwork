import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { draftTasks, ocrUploadImage } from '@/api/ai';
import { ApiError } from '@/api/client';
import type { AiGeneratedTask } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { DateField } from '@/components/tasks/date-field';
import { ListPicker } from '@/components/tasks/list-picker';
import { LiveMarkdownInput } from '@/components/tasks/live-markdown-input';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSpinner, LoadingState } from '@/components/ui/loading';
import { ProgressOverlay } from '@/components/ui/progress-overlay';
import { DictationSheet } from '@/components/tasks/dictation-sheet';
import { NativeAlert } from '@/components/ui/native-alert';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { HeaderTextButton } from '@/components/settings/settings-list';
import { useDeviceCalendars } from '@/hooks/use-calendars';
import { useCreateGitHubIssue, useGitHubIssues } from '@/hooks/use-github';
import { useCreateTask, useTaskLists, useTasks } from '@/hooks/use-tasks';
import { addTaskToCalendar } from '@/lib/calendar';
import { haptics } from '@/lib/haptics';
import { DURATION, SPRING } from '@/lib/motion';
import { collectAllTags, normalizeTags } from '@/lib/tags';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { takeCreateHandoff } from '@/stores/create-handoff';
import { githubAccountFor, useGitHubSessionStore } from '@/stores/github-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Switch } from '@/components/ui/switch';
import { useTagPickerStore } from '@/stores/tag-picker-store';
import { useUiStore } from '@/stores/ui-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const ADJUSTS_KEYBOARD_INSETS = process.env.EXPO_OS === 'ios';

const PRIORITIES: { label: string; value: number | null }[] = [
  { label: 'None', value: null },
  { label: 'Low', value: 9 },
  { label: 'Medium', value: 5 },
  { label: 'High', value: 1 },
];

/** Left edge shared by title, notes and tags (checkbox touch target minus its pull-in). */
const TEXT_INSET = 34;

const SPATIAL = LinearTransition.springify()
  .damping(SPRING.spatialSlow.damping)
  .stiffness(SPRING.spatialSlow.stiffness);

type AiBusy = 'text' | 'photo' | null;

/**
 * Add dialog, laid out like the Things detail page: a big title, live
 * Markdown notes, tags, checklist, and one soft surface of details. The AI
 * row turns what you typed (or a photo) into staged to-dos for review; it
 * replaces the old AI tab.
 */
const IOS = Platform.OS === 'ios';

export default function NewTaskScreen() {
  const { colors } = useTheme();
  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const createTask = useCreateTask();
  const selectedListId = useUiStore((state) => state.selectedListId);
  const selectedTag = useUiStore((state) => state.selectedTag);
  const openTagPicker = useTagPickerStore((s) => s.open);
  const setStaged = useAiStagingStore((s) => s.setStaged);
  // Claimed once, on first render, from a Task <-> GitHub issue switch.
  const [handoff] = useState(takeCreateHandoff);

  const lists = useMemo(
    () => (listsQuery.data ?? []).filter((list) => !list.is_deck),
    [listsQuery.data],
  );
  const availableTags = useMemo(() => collectAllTags(tasksQuery.data ?? []), [tasksQuery.data]);
  const contextualListId =
    handoff?.task?.list_id && lists.some((list) => list.id === handoff.task?.list_id)
      ? handoff.task.list_id
      : selectedListId && lists.some((list) => list.id === selectedListId)
        ? selectedListId
        : lists[0]?.id;

  const [title, setTitle] = useState(handoff?.title ?? '');
  const [notes, setNotes] = useState(handoff?.body ?? '');
  const [listIdState, setListIdState] = useState<string | undefined>(undefined);
  // A GitHub repository is just another destination. When set, the same form
  // creates an issue instead of a CalDAV to-do; nothing navigates or remounts.
  const params = useLocalSearchParams<{ repo?: string }>();
  const githubConnection = useGitHubSessionStore((s) => s.state);
  const githubRepositories = useSettingsStore((s) => s.githubRepositories);
  const writableRepos = useMemo(
    () =>
      githubConnection.status === 'connected'
        ? githubRepositories.filter((r) => r.canWriteIssues !== false)
        : [],
    [githubConnection.status, githubRepositories],
  );
  const [repoName, setRepoName] = useState<string | null>(
    typeof params.repo === 'string' && params.repo ? params.repo : null,
  );
  const repo = writableRepos.find((r) => r.fullName === repoName) ?? null;
  const isIssue = repo != null;
  const [assignMe, setAssignMe] = useState(true);
  const createIssue = useCreateGitHubIssue();
  const issuesQuery = useGitHubIssues();
  // "Assign to me" means the account that owns the chosen repository.
  const viewerLogin = githubAccountFor(githubConnection, repo?.accountId)?.account.login ?? null;
  const repoLabels = useMemo(() => {
    if (!repo) return [];
    const set = new Set<string>();
    for (const issue of issuesQuery.data?.issues ?? []) {
      if (issue.repo.toLowerCase() === repo.fullName.toLowerCase()) {
        issue.labels.forEach((label) => set.add(label.name));
      }
    }
    return [...set];
  }, [issuesQuery.data?.issues, repo]);
  function setListId(id: string) {
    setRepoName(null);
    setListIdState(id);
  }
  const listId = listIdState ?? contextualListId ?? '';
  const [tags, setTags] = useState<string[]>(
    normalizeTags(handoff?.task?.tags ?? (selectedTag ? [selectedTag] : [])),
  );
  const [dueAt, setDueAt] = useState<string | null>(handoff?.task?.due_at ?? null);
  const [reminderAt, setReminderAt] = useState<string | null>(handoff?.task?.reminder_at ?? null);
  const [priority, setPriority] = useState<number | null>(handoff?.task?.priority ?? null);
  const [calendarId, setCalendarId] = useState<string | null>(handoff?.task?.calendar_id ?? null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [checklist, setChecklist] = useState<string[]>(handoff?.task?.subtasks ?? []);
  const [checklistDraft, setChecklistDraft] = useState(handoff?.task?.subtaskDraft ?? '');
  const [listPickerOpen, setListPickerOpen] = useState(false);

  const [aiBusy, setAiBusy] = useState<AiBusy>(null);
  /** Set briefly after the AI succeeds, so the indicator can resolve into a check. */
  const [aiDone, setAiDone] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [createdWithWarnings, setCreatedWithWarnings] = useState(false);
  const [warningTaskUid, setWarningTaskUid] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // iOS gets exact insets from the ScrollView's own frame inside a form sheet;
  // Android pads by the keyboard height.
  useEffect(() => {
    if (ADJUSTS_KEYBOARD_INSETS) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const listName = repo
    ? repo.fullName
    : (lists.find((l) => l.id === listId)?.name ?? 'Choose a list');
  const hasSchedule = Boolean(dueAt || reminderAt);
  const canSubmit =
    title.trim().length > 0 && (isIssue || listId.length > 0) && !isSubmitting && !aiBusy;

  function pickTags() {
    haptics.tap();
    const known = isIssue ? repoLabels : availableTags;
    const pool = normalizeTags([...known, ...tags]).sort((a, b) => a.localeCompare(b));
    openTagPicker(pool, tags, (next) => setTags(normalizeTags(next)));
    router.push('/tags');
  }

  function addChecklistItem() {
    const value = checklistDraft.trim();
    if (!value) return;
    haptics.tap();
    setChecklist((items) => [...items, value]);
    setChecklistDraft('');
  }

  // ── AI: natural language and photos ────────────────────────────────────

  /** Hand AI results to the review screen, closing this dialog first. */
  function review(tasks: AiGeneratedTask[]) {
    if (tasks.length === 0) {
      setAiError('The AI did not find any to-dos in that. Try rephrasing or a clearer photo.');
      return;
    }
    haptics.success();
    setStaged(
      tasks.map((task) => ({ ...task, list_id: task.list_id ?? listId, tags: task.tags ?? [] })),
    );
    // Let the progress indicator land on its check before moving on.
    setAiDone(`${tasks.length} to-do${tasks.length === 1 ? '' : 's'} ready`);
    setTimeout(() => {
      router.back();
      router.push('/ai-review');
    }, 750);
  }

  async function generateFromText() {
    const instruction = [title, notes]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n');
    if (!instruction) {
      setAiError(
        'Type what you need in the title or notes, like "Call the dentist Friday and buy milk tomorrow", then tap Write with AI.',
      );
      return;
    }
    Keyboard.dismiss();
    setAiBusy('text');
    try {
      const response = await draftTasks({
        instruction,
        available_lists: lists,
        available_tags: availableTags,
      });
      review(response.tasks);
    } catch (error) {
      setAiError(error instanceof ApiError ? error.message : 'Could not reach the AI.');
    } finally {
      setAiBusy(null);
    }
  }

  async function generateFromPhoto(source: 'camera' | 'library') {
    Keyboard.dismiss();
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAiError(
        source === 'camera'
          ? 'Allow camera access to capture a photo of your notes.'
          : 'Allow photo library access to import tasks from an image.',
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setAiBusy('photo');
    try {
      const response = await ocrUploadImage({
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? undefined,
        availableLists: lists,
        availableTags,
      });
      review(response.tasks);
    } catch (error) {
      setAiError(error instanceof ApiError ? error.message : 'Could not read that image.');
    } finally {
      setAiBusy(null);
    }
  }

  // ── Create ─────────────────────────────────────────────────────────────

  async function handleSubmit() {
    // Mutation state updates on the next render; a ref closes the double-tap window.
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    // A checklist item typed but not committed with return still counts.
    const pending = checklistDraft.trim();
    const items = pending ? [...checklist, pending] : checklist;

    try {
      if (repo) {
        // The checklist becomes a GitHub task list at the end of the body.
        const taskList = items.map((item) => `- [ ] ${item}`).join('\n');
        const body = [notes.trim(), taskList].filter(Boolean).join('\n\n');
        await createIssue.mutateAsync({
          repository: repo,
          issue: {
            title: title.trim(),
            body,
            labels: normalizeTags(tags),
            assignees: assignMe && viewerLogin ? [viewerLogin] : [],
          },
        });
        haptics.success();
        router.back();
        return;
      }
      const created = await createTask.mutateAsync({
        list_id: listId,
        title: title.trim(),
        markdown: notes.trim(),
        tags: normalizeTags(tags),
        due_at: dueAt,
        reminder_at: reminderAt,
        priority,
      });

      let calendarFailed = false;
      if (calendarId && hasSchedule) {
        try {
          await addTaskToCalendar({
            calendarId,
            title: created.title,
            notes: created.markdown,
            dueAt: created.due_at,
            reminderAt: created.reminder_at,
          });
        } catch {
          calendarFailed = true;
        }
      }

      // Sequential with an explicit order so the checklist keeps the typed order.
      const failed: string[] = [];
      for (const [index, item] of items.entries()) {
        try {
          await createTask.mutateAsync({
            list_id: created.list_id,
            title: item,
            parent_uid: created.uid,
            sort_order: index,
          });
        } catch {
          failed.push(item);
        }
      }

      const problems: string[] = [];
      if (calendarFailed) problems.push('it could not be added to your calendar');
      if (failed.length > 0) {
        problems.push(`checklist items not created: ${failed.map((t) => `"${t}"`).join(', ')}`);
      }
      if (problems.length > 0) {
        setCreatedWithWarnings(true);
        setWarningTaskUid(created.uid);
        setErrorMessage(`The to-do was created, but ${problems.join(' and ')}.`);
        return;
      }
      haptics.success();
      router.back();
    } catch (error) {
      // GitHub failures are GitHubErrors with readable messages (permissions,
      // missing labels), so show those rather than a generic line.
      const message =
        error instanceof Error && error.message
          ? error.message
          : repo
            ? 'Could not create the issue.'
            : 'Could not create the to-do.';
      setErrorMessage(cleanErrorMessage(message));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  // ── Empty / loading states ─────────────────────────────────────────────

  if (listsQuery.isLoading && lists.length === 0) {
    return (
      <SheetSurface title="New To-Do" skipPartiallyExpanded={false}>
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <LoadingState message="Loading lists…" fullScreen={false} />
          </View>
        </View>
      </SheetSurface>
    );
  }

  if (lists.length === 0 && !isIssue) {
    return (
      <SheetSurface title="New To-Do" subtitle="Connect an account first">
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ backgroundColor: 'transparent' }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 24 }}>
            <EmptyState
              icon={listsQuery.isError ? 'cloud-off-outline' : 'cloud-outline'}
              title={listsQuery.isError ? 'Could not load lists' : 'No task lists yet'}
              subtitle={
                listsQuery.isError
                  ? 'Check your connection or account settings, then try again.'
                  : 'Connect a CalDAV account to create your first to-do.'
              }
              actions={[
                ...(listsQuery.isError
                  ? [
                      {
                        label: 'Retry',
                        onPress: () => listsQuery.refetch(),
                        variant: 'filled' as const,
                      },
                    ]
                  : []),
                {
                  label: 'Connect account',
                  onPress: () => router.push('/settings/account'),
                  variant: listsQuery.isError ? ('tonal' as const) : ('filled' as const),
                },
              ]}
            />
          </ScrollView>
        </View>
      </SheetSurface>
    );
  }

  return (
    <SheetSurface title={isIssue ? 'New Issue' : 'New To-Do'}>
      {Platform.OS === 'ios' ? (
        // iOS: the Reminders / Things pattern. Cancel on the left, the
        // primary action on the right of the sheet's own navigation bar.
        <Stack.Screen
          options={{
            headerLeft: () => <HeaderTextButton label="Cancel" bold={false} onPress={() => router.back()} />,
            headerRight: () => (
              <HeaderTextButton
                label={isIssue ? 'Create' : 'Add'}
                onPress={handleSubmit}
                disabled={!canSubmit}
                loading={isSubmitting}
              />
            ),
          }}
        />
      ) : null}
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={ADJUSTS_KEYBOARD_INSETS}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: keyboardHeight + 32,
        }}>
        {/* Title */}
        <View className="flex-row items-start">
          <View style={{ marginLeft: -10, marginTop: 0 }}>
            {/* Decorative: shows this will be a to-do; there is nothing to complete yet. */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6.5,
                  borderWidth: 1.75,
                  borderColor: colors.gray2,
                }}
              />
            </View>
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            multiline
            submitBehavior="blurAndSubmit"
            placeholder="New To-Do"
            placeholderTextColor={colors.text3}
            accessibilityLabel="Title"
            className="text-sf-text flex-1"
            style={{
              fontSize: 24,
              lineHeight: 30,
              fontWeight: '700',
              letterSpacing: -0.3,
              paddingVertical: 6,
              paddingHorizontal: 0,
            }}
          />
        </View>

        {/* Notes, rendered as you type */}
        <View style={{ marginLeft: TEXT_INSET }}>
          <LiveMarkdownInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            placeholderTextColor={colors.text3}
            accessibilityLabel="Notes"
            style={{ minHeight: 40 }}
          />
        </View>

        {isIssue ? null : (
          <>
            {/* AI: plain language or a photo becomes reviewable to-dos */}
            <View style={{ marginLeft: TEXT_INSET, marginTop: 14 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 8 }}>
                <AiChip
                  icon="creation"
                  label="Write with AI"
                  emphasized
                  onPress={generateFromText}
                />
                <AiChip
                  icon="microphone-outline"
                  label="Dictate"
                  onPress={() => {
                    Keyboard.dismiss();
                    setDictating(true);
                  }}
                />
                <AiChip
                  icon="camera-outline"
                  label="Camera"
                  onPress={() => generateFromPhoto('camera')}
                />
                <AiChip
                  icon="image-outline"
                  label="Photo"
                  onPress={() => generateFromPhoto('library')}
                />
              </ScrollView>
            </View>
          </>
        )}

        {/* Tags */}
        <Animated.View
          layout={SPATIAL}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginLeft: TEXT_INSET,
            marginTop: 14,
          }}>
          {tags.map((tag) => (
            <Pressable key={tag} onPress={pickTags} accessibilityLabel={`Tag ${tag}, edit tags`}>
              <View
                style={{
                  backgroundColor: colors.selectionBg,
                  paddingHorizontal: 14,
                  height: 32,
                  justifyContent: 'center',
                  borderRadius: 16,
                }}>
                <Text style={{ color: colors.onSelectionBg, fontSize: 14, fontWeight: '600' }}>
                  {tag}
                </Text>
              </View>
            </Pressable>
          ))}
          <Pressable
            onPress={pickTags}
            accessibilityRole="button"
            accessibilityLabel={tags.length ? 'Edit tags' : 'Add tags'}
            style={({ pressed }) =>
              IOS
                ? {
                    // iOS bordered button: gray capsule, no outline.
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    height: 32,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    backgroundColor: colors.bg3,
                    opacity: pressed ? 0.6 : 1,
                  }
                : {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    height: 32,
                    paddingHorizontal: 12,
                    borderRadius: pressed ? 16 : 8,
                    borderWidth: 1,
                    borderColor: colors.gray2,
                  }
            }>
            <MaterialCommunityIcons name="tag-plus-outline" size={16} color={colors.text2} />
            <Text style={{ color: colors.text2, fontSize: 14 }}>
              {tags.length ? 'Edit' : isIssue ? 'Add labels' : 'Add tags'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Checklist */}
        <Heading title="Checklist" />
        {checklist.map((item, index) => (
          <Animated.View
            key={`${item}-${index}`}
            entering={FadeIn.duration(DURATION.medium1)}
            layout={SPATIAL}
            className="flex-row items-center"
            style={{ minHeight: 48 }}>
            <MaterialCommunityIcons
              name="checkbox-blank-circle-outline"
              size={20}
              color={colors.gray2}
              style={{ width: 33 }}
            />
            <Text className="text-sf-text flex-1" style={{ fontSize: 17 }}>
              {item}
            </Text>
            <Pressable
              onPress={() => setChecklist((items) => items.filter((_, i) => i !== index))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item}`}
              hitSlop={10}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="close" size={18} color={colors.text3} />
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

        {/* Details */}
        <Heading title="Details" />
        <View
          style={{
            marginTop: 6,
            paddingHorizontal: 16,
            paddingVertical: 4,
            borderRadius: 24,
            borderCurve: 'continuous',
            backgroundColor: colors.bg3,
          }}>
          {/* Destination: a CalDAV list or, when GitHub is connected, a repository. */}
          <Pressable
            onPress={() => {
              haptics.tap();
              setListPickerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${isIssue ? 'Repository' : 'List'}, ${listName}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
            <MaterialCommunityIcons
              name={isIssue ? 'github' : 'format-list-bulleted'}
              size={20}
              color={colors.accent}
            />
            <Text className="text-sf-text text-base">{isIssue ? 'Repository' : 'List'}</Text>
            <Text
              numberOfLines={1}
              style={{ flex: 1, textAlign: 'right', color: colors.text2, fontSize: 16 }}>
              {listName}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text3} />
          </Pressable>
          {isIssue ? (
            <View className="flex-row items-center" style={{ gap: 12, minHeight: 56 }}>
              <MaterialCommunityIcons
                name="account-check-outline"
                size={20}
                color={colors.accent}
              />
              <View className="flex-1">
                <Text className="text-sf-text text-base">Assign to me</Text>
                {viewerLogin ? (
                  <Text style={{ fontSize: 13, color: colors.text2 }}>@{viewerLogin}</Text>
                ) : null}
              </View>
              <Switch value={assignMe} onValueChange={setAssignMe} />
            </View>
          ) : (
            <>
              <View style={{ paddingVertical: 12 }}>
                <DateField
                  label="Deadline"
                  iconName="flag-outline"
                  value={dueAt}
                  onChange={setDueAt}
                />
              </View>
              <View style={{ paddingVertical: 12 }}>
                <DateField
                  label="Reminder"
                  iconName="bell-outline"
                  value={reminderAt}
                  onChange={setReminderAt}
                />
              </View>
              <View className="gap-3" style={{ paddingVertical: 12 }}>
                <View className="flex-row items-center gap-3">
                  <MaterialCommunityIcons
                    name="signal-cellular-2"
                    size={20}
                    color={colors.accent}
                  />
                  <Text className="text-sf-text text-base">Priority</Text>
                </View>
                <SegmentedChoice options={PRIORITIES} value={priority} onChange={setPriority} />
              </View>
              {hasSchedule ? (
                <CalendarChoice
                  open={calendarOpen}
                  selectedId={calendarId}
                  onToggle={() => setCalendarOpen((v) => !v)}
                  onPick={(id) => {
                    setCalendarId(id);
                    setCalendarOpen(false);
                  }}
                />
              ) : null}
            </>
          )}
        </View>

        {/* Create (iOS uses the Add button in the sheet's navigation bar) */}
        {Platform.OS !== 'ios' ? (
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={isIssue ? 'Create issue' : 'Add to-do'}
          android_ripple={{ color: colors.separator }}
          style={({ pressed }) => ({
            marginTop: 24,
            height: 56,
            borderRadius: pressed ? 16 : 28,
            borderCurve: 'continuous',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            backgroundColor: colors.accent,
            opacity: canSubmit ? 1 : 0.4,
          })}>
          {isSubmitting ? (
            <LoadingSpinner size={24} />
          ) : (
            <MaterialCommunityIcons
              name={isIssue ? 'github' : 'plus'}
              size={22}
              color={colors.onAccent}
            />
          )}
          <Text style={{ color: colors.onAccent, fontSize: 17, fontWeight: '600' }}>
            {isSubmitting
              ? isIssue
                ? 'Creating issue…'
                : 'Adding…'
              : isIssue
                ? 'Create issue'
                : 'Add to-do'}
          </Text>
        </Pressable>
        ) : null}

        <ListPicker
          visible={listPickerOpen}
          lists={lists}
          selectedId={listId}
          title="Add to"
          onSelect={(list) => {
            setListId(list.id);
            setListPickerOpen(false);
          }}
          repos={writableRepos}
          selectedRepo={repo?.fullName ?? null}
          onSelectRepo={(fullName) => {
            setRepoName(fullName);
            setListPickerOpen(false);
          }}
          onClose={() => setListPickerOpen(false)}
        />
        <NativeAlert
          visible={aiError != null}
          title="AI"
          message={aiError ?? ''}
          confirmLabel={aiError?.includes('Settings') ? 'Open Settings' : 'OK'}
          dismissLabel={aiError?.includes('Settings') ? 'Not now' : undefined}
          onDismiss={() => setAiError(null)}
          onConfirm={() => {
            const goSettings = aiError?.includes('Settings');
            setAiError(null);
            if (goSettings) {
              router.back();
              router.push('/settings/ai');
            }
          }}
        />
        <NativeAlert
          visible={errorMessage != null}
          title={createdWithWarnings ? 'To-do created' : 'Could not add'}
          message={errorMessage ?? ''}
          onDismiss={() => {
            setErrorMessage(null);
            if (createdWithWarnings) {
              const uid = warningTaskUid;
              setCreatedWithWarnings(false);
              setWarningTaskUid(null);
              router.back();
              if (uid) router.push({ pathname: '/task/[uid]', params: { uid } });
            }
          }}
        />
      </ScrollView>
      <DictationSheet
        visible={dictating}
        lists={lists}
        availableTags={availableTags}
        defaultListId={listId}
        onClose={() => setDictating(false)}
        // Close this dialog under the preview, like the other AI actions.
        beforeReview={() => router.back()}
      />
      <ProgressOverlay
        visible={aiBusy != null || aiDone != null}
        state={aiDone ? 'done' : 'working'}
        label={aiDone ?? (aiBusy === 'photo' ? 'Reading your photo…' : 'Turning that into to-dos…')}
      />
    </SheetSurface>
  );
}

/** M3 assist chip for the AI actions; the main one is tonal, the rest outlined. */
function AiChip({
  icon,
  label,
  emphasized,
  onPress,
}: {
  icon: IconName;
  label: string;
  emphasized?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => IOS ? ({
        // iOS: prominent capsule for the main action, gray bordered capsules for the rest.
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingLeft: 12,
        paddingRight: 14,
        borderRadius: 18,
        backgroundColor: emphasized ? colors.accent : colors.bg3,
        opacity: pressed ? 0.7 : 1,
      }) : ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingLeft: 10,
        paddingRight: 14,
        borderRadius: pressed ? 18 : 10,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: emphasized ? colors.primaryContainer : 'transparent',
        borderWidth: emphasized ? 0 : 1,
        borderColor: colors.gray2,
        opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
      })}>
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={IOS ? (emphasized ? colors.onAccent : colors.accent) : emphasized ? colors.onPrimaryContainer : colors.accent}
      />
      <Text
        style={{
          fontSize: IOS ? 15 : 14,
          fontWeight: '600',
          color: IOS ? (emphasized ? colors.onAccent : colors.accent) : emphasized ? colors.onPrimaryContainer : colors.text,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Heading({ title }: { title: string }) {
  const { colors } = useTheme();
  if (IOS) {
    // iOS grouped-list section header: small, uppercase, secondary.
    return (
      <Text style={{ marginTop: 28, paddingBottom: 8, paddingHorizontal: 4, fontSize: 13, color: colors.text2, textTransform: 'uppercase' }}>
        {title}
      </Text>
    );
  }
  return (
    <Text
      style={{
        marginTop: 28,
        paddingBottom: 6,
        fontSize: 17,
        fontWeight: '700',
        color: colors.accent,
      }}>
      {title}
    </Text>
  );
}

function CalendarChoice({
  open,
  selectedId,
  onToggle,
  onPick,
}: {
  open: boolean;
  selectedId: string | null;
  onToggle: () => void;
  onPick: (calendarId: string | null) => void;
}) {
  const { colors } = useTheme();
  // Listing calendars asks for OS permission, so only query once expanded.
  const calendarsQuery = useDeviceCalendars(open || selectedId != null);
  const calendars = calendarsQuery.data ?? [];
  const selected = calendars.find((c) => c.id === selectedId);
  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
        <MaterialCommunityIcons name="calendar-plus" size={20} color={colors.accent} />
        <Text className="text-sf-text flex-1 text-base">Add to calendar</Text>
        <Text style={{ color: colors.text2, fontSize: 16 }}>{selected?.title ?? 'Off'}</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.text3}
        />
      </Pressable>
      {open ? (
        <View style={{ paddingLeft: 32, paddingBottom: 8 }}>
          <CalendarOption
            title="Off"
            color={null}
            selected={selectedId == null}
            onPress={() => onPick(null)}
          />
          {calendarsQuery.isLoading ? (
            <Text className="text-sf-text-2 py-2 text-sm">Loading calendars…</Text>
          ) : null}
          {calendars.map((calendar) => (
            <CalendarOption
              key={calendar.id}
              title={calendar.title}
              color={calendar.color ?? null}
              selected={calendar.id === selectedId}
              onPress={() => onPick(calendar.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CalendarOption({
  title,
  color,
  selected,
  onPress,
}: {
  title: string;
  color: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View
        style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color ?? colors.gray }}
      />
      <Text className="text-sf-text flex-1 text-base">{title}</Text>
      {selected ? <MaterialCommunityIcons name="check" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

function cleanErrorMessage(message: string) {
  const xmlMessage = message.match(/<[^>]*message[^>]*>([\s\S]*?)<\/[^>]*message>/i)?.[1];
  return xmlMessage ? decodeXml(xmlMessage.trim()) : message;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
