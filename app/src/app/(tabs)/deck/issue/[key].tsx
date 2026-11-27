import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';

import {
  applyJiraTransition,
  assignJiraIssue,
  boardHasSprints,
  deleteJiraIssue,
  fetchJiraComponents,
  fetchJiraIssue,
  fetchJiraPriorities,
  fetchJiraIssueSprint,
  fetchJiraSprints,
  fetchJiraTransitions,
  moveJiraIssuesToSprint,
  sprintTiming,
  jiraImageHeaders,
  jiraIssueUrl,
  updateJiraIssue,
  type JiraBoard,
  type JiraBoardDetail,
  type JiraComponent,
  type JiraIssueDetail,
  type JiraIssuePatch,
  type JiraIssueSprintInfo,
  type JiraSprint,
  type JiraUser,
} from '@/api/jira';
import { AdfViewer } from '@/components/boards/adf-viewer';
import {
  DetailRow,
  DetailsCard,
  EDITOR_CONTENT,
  EditorActionRow,
  EditorChips,
  EditorHeading,
  EditorNotes,
  EditorPrimaryButton,
  EditorTitle,
  EDITOR_TEXT_INSET,
} from '@/components/boards/item-editor';
import { ACTION_BAR_CLEARANCE, KeyboardScrollView } from '@/components/ui/keyboard';
import { PickerSheet } from '@/components/boards/picker-sheet';
import { HeaderTextButton } from '@/components/settings/settings-list';
import { DateField } from '@/components/ui/date-field';
import { TaskActionBar } from '@/features/tasks/task-action-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { useTheme } from '@/components/theme/context';
import { adfFromSegments, adfSegments } from '@/lib/adf';
import { withIssueSprint } from '@/features/boards/model';
import { useJiraBoards } from '@/features/boards/use-board-detail';
import { useJiraPeople } from '@/features/boards/use-jira-people';
import { NativeAlert } from '@/components/ui/native-alert';
import type { JiraCredentials } from '@/lib/credentials-types';
import { haptics } from '@/lib/haptics';
import { useTabBarFabOffset } from '@/lib/tab-bar';
import { handleJiraError, useJiraAccounts, useJiraSessionStore } from '@/stores/jira-session-store';
import { Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

const issueKey = (accountId: string, key: string) => ['jira', 'issue', accountId, key] as const;

/**
 * A Jira issue, opened from a board and edited in the app. Laid out like the
 * New To-Do sheet. Summary, description, labels, components, priority and due
 * date save together; status, assignee, reporter and sprint apply straight
 * away, as they do in Jira.
 */
export default function JiraIssueScreen() {
  const { key = '', account, board } = useLocalSearchParams<{
    key: string;
    account?: string;
    /** The scrum board it was opened from, for the Sprint row. */
    board?: string;
  }>();
  const accounts = useJiraAccounts();
  const status = useJiraSessionStore((store) => store.state.status);
  const credentials =
    (account ? accounts.find((entry) => entry.id === account) : undefined) ?? accounts[0] ?? null;

  const issue = useQuery({
    queryKey: issueKey(credentials?.id ?? '', key),
    queryFn: () =>
      fetchJiraIssue(credentials!, key).catch((error: unknown) => {
        handleJiraError(error, credentials?.id);
        throw error;
      }),
    enabled: credentials != null && !!key,
  });

  if (status === 'initializing' || issue.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: key }} />
        <LoadingState message="Loading issue…" subtitle={key} />
      </>
    );
  }
  if (!credentials || issue.error || !issue.data) {
    return (
      <>
        <Stack.Screen options={{ title: key }} />
        <View className="bg-sf-bg flex-1 justify-center">
          <EmptyState
            icon="jira"
            title="Could not open this issue"
            subtitle={
              !credentials
                ? 'Connect the Jira account this board belongs to in Settings.'
                : issue.error instanceof Error
                  ? issue.error.message
                  : 'Please try again.'
            }
            actions={[
              ...(credentials
                ? [
                    {
                      label: 'Retry',
                      onPress: () => issue.refetch(),
                      variant: 'filled' as const,
                    },
                  ]
                : [
                    {
                      label: 'Open Settings',
                      onPress: () => router.push('/settings/jira'),
                      variant: 'filled' as const,
                    },
                  ]),
            ]}
          />
        </View>
      </>
    );
  }
  // Keyed by issue only: a status or assignee change refetches without wiping unsaved edits.
  return (
    <IssueEditor
      key={issue.data.key}
      credentials={credentials}
      issue={issue.data}
      boardId={board ? Number(board) : undefined}
    />
  );
}

function IssueEditor({
  credentials,
  issue,
  boardId,
}: {
  credentials: JiraCredentials;
  issue: JiraIssueDetail;
  boardId?: number;
}) {
  const client = useQueryClient();
  const headers = useMemo(() => jiraImageHeaders(credentials), [credentials]);
  const [summary, setSummary] = useState(issue.summary);
  const { colors } = useTheme();
  // The description in pieces: Markdown you can edit, and the images, tables
  // and other rich blocks around it, which go back to Jira untouched. Frozen
  // at open, like the other fields, so a refetch never shifts what you edit.
  const [segments] = useState(() => adfSegments(issue.descriptionDoc));
  const [drafts, setDrafts] = useState(() =>
    segments.map((segment) => (segment.kind === 'text' ? segment.markdown : ''))
  );
  const hasRich = segments.some((segment) => segment.kind === 'rich');
  const [labels, setLabels] = useState(issue.labels);
  const [duedate, setDuedate] = useState(issue.duedate);
  const [priority, setPriority] = useState(issue.priority);
  const [components, setComponents] = useState<JiraComponent[]>(issue.components);
  const [picker, setPicker] = useState<
    'status' | 'priority' | 'assignee' | 'reporter' | 'components' | 'board' | 'sprint' | null
  >(null);
  const assignees = useJiraPeople(credentials, { kind: 'assignable', issueKey: issue.key }, picker === 'assignee');
  const reporters = useJiraPeople(credentials, { kind: 'anyone' }, picker === 'reporter');
  const projectComponents = useQuery({
    queryKey: ['jira', 'components', credentials.id, issue.projectKey],
    queryFn: () => fetchJiraComponents(credentials, issue.projectKey!),
    enabled: !!issue.projectKey && (picker === 'components' || issue.editable.components),
    staleTime: 10 * 60_000,
  });
  const canEditComponents = issue.editable.components && (projectComponents.data?.length ?? 0) > 0;

  // Which sprint the issue is in comes from the issue itself, so the row shows
  // even when the issue was opened from search or a link. Sprints to move to
  // come from the board it was opened on, else the board its sprint belongs
  // to, else its project's first scrum board.
  const sprintKey = ['jira', 'issue-sprint', credentials.id, issue.key] as const;
  const sprintInfo = useQuery({
    queryKey: sprintKey,
    queryFn: () => fetchJiraIssueSprint(credentials, issue.key),
  });
  const currentSprint = sprintInfo.data?.sprint;
  // Any scrum board on this Jira login can supply sprints; the issue's own
  // project comes first. Picking one only changes where the sprint list
  // comes from, since an issue isn't stored on a board.
  const jira = useJiraBoards();
  const sprintBoards = useMemo(
    () =>
      (jira.data ?? [])
        .filter((candidate) => candidate.accountId === credentials.id && boardHasSprints(candidate))
        .sort(
          (a, b) =>
            Number(b.projectKey === issue.projectKey) - Number(a.projectKey === issue.projectKey) ||
            a.name.localeCompare(b.name)
        ),
    [jira.data, credentials.id, issue.projectKey]
  );
  const [boardChoice, setBoardChoice] = useState<number | null>(null);
  const sprintBoard =
    boardChoice ??
    (boardId != null && Number.isFinite(boardId) && boardId > 0 ? boardId : sprintInfo.data?.boardId) ??
    // Unprompted, only a board of the issue's own project; others are a pick away.
    sprintBoards.find((candidate) => candidate.projectKey === issue.projectKey)?.id;
  const sprintBoardInfo: JiraBoard | undefined = sprintBoards.find((candidate) => candidate.id === sprintBoard);
  const sprints = useQuery({
    queryKey: ['jira', 'sprints', credentials.id, sprintBoard],
    queryFn: () => fetchJiraSprints(credentials, sprintBoard!),
    enabled: sprintBoard != null,
    staleTime: 5 * 60_000,
  });
  const canMoveSprint = (sprints.data?.length ?? 0) > 0;
  // Boards without sprints have nothing to say here, unless the issue is in one.
  const showSprint = canMoveSprint || currentSprint != null;
  const [error, setError] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const barBottom = useTabBarFabOffset();

  const transitions = useQuery({
    queryKey: ['jira', 'transitions', credentials.id, issue.key, issue.status.id],
    queryFn: () => fetchJiraTransitions(credentials, issue.key),
    enabled: picker === 'status',
  });
  const priorities = useQuery({
    queryKey: ['jira', 'priorities', credentials.id],
    queryFn: () => fetchJiraPriorities(credentials),
    enabled: picker === 'priority',
    staleTime: 60 * 60_000,
  });

  const patch: JiraIssuePatch = {};
  if (summary.trim() !== issue.summary) patch.summary = summary;
  const descriptionDirty = segments.some(
    (segment, index) => segment.kind === 'text' && drafts[index] !== segment.markdown
  );
  if (descriptionDirty) {
    // Only the edited text goes through Markdown; everything else is sent back as it came.
    patch.description = adfFromSegments(segments, drafts);
  }
  if (labels.join('\n') !== issue.labels.join('\n')) patch.labels = labels;
  if (duedate !== issue.duedate) patch.duedate = duedate;
  if (priority && priority.id !== issue.priority?.id) patch.priorityId = priority.id;
  const componentKey = (list: JiraComponent[]) => list.map((component) => component.id).sort().join(',');
  if (componentKey(components) !== componentKey(issue.components)) {
    patch.componentIds = components.map((component) => component.id);
  }
  const dirty = Object.keys(patch).length > 0;

  function refresh() {
    void client.invalidateQueries({
      queryKey: issueKey(credentials.id, issue.key),
    });
    void client.invalidateQueries({ queryKey: ['jira', 'board'] });
  }
  function fail(cause: unknown) {
    haptics.error();
    handleJiraError(cause, credentials.id);
    setError(cause instanceof Error ? cause.message : 'Jira did not accept that.');
  }

  const save = useMutation({
    mutationFn: () => updateJiraIssue(credentials, issue.key, patch),
    onSuccess: () => {
      haptics.success();
      refresh();
      router.back();
    },
    onError: fail,
  });
  const transition = useMutation({
    mutationFn: (id: string) => applyJiraTransition(credentials, issue.key, id),
    onSuccess: () => {
      haptics.success();
      refresh();
    },
    onError: fail,
  });
  const assign = useMutation({
    mutationFn: (accountId: string | null) => assignJiraIssue(credentials, issue.key, accountId),
    onSuccess: refresh,
    onError: fail,
  });
  const changeReporter = useMutation({
    mutationFn: (accountId: string) => updateJiraIssue(credentials, issue.key, { reporterId: accountId }),
    onSuccess: () => {
      haptics.success();
      refresh();
    },
    onError: fail,
  });
  const moveSprint = useMutation({
    mutationFn: (sprint: JiraSprint | null) => moveJiraIssuesToSprint(credentials, [issue.key], sprint?.id ?? null),
    // The row and any loaded board show the move straight away, like a card drag.
    onMutate: async (sprint) => {
      await client.cancelQueries({ queryKey: sprintKey });
      const previous = client.getQueryData<JiraIssueSprintInfo>(sprintKey);
      client.setQueryData<JiraIssueSprintInfo>(sprintKey, { boardId: previous?.boardId ?? sprintBoard, sprint });
      client.setQueriesData<JiraBoardDetail>({ queryKey: ['jira', 'board', credentials.id] }, (detail) =>
        detail?.columns ? withIssueSprint(detail, issue.key, sprint) : detail
      );
      return { previous };
    },
    onSuccess: () => haptics.success(),
    onError: (cause, _sprint, context) => {
      if (context?.previous) client.setQueryData(sprintKey, context.previous);
      fail(cause);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: sprintKey });
      refresh();
    },
  });

  function pickSprint(sprint: JiraSprint | null) {
    setPicker(null);
    if ((currentSprint?.id ?? null) !== (sprint?.id ?? null)) moveSprint.mutate(sprint);
  }
  const sprintItems = [
    ...(sprints.data ?? []).map((sprint) => ({
      key: `sprint:${sprint.id}`,
      label: sprint.name,
      subtitle: [sprint.state === 'active' ? 'Active sprint' : 'Upcoming sprint', sprintTiming(sprint)]
        .filter(Boolean)
        .join(' · '),
      icon: sprint.state === 'active' ? ('run-fast' as const) : ('calendar-clock' as const),
      selected: currentSprint?.id === sprint.id,
      onPress: () => pickSprint(sprint),
    })),
    {
      key: 'backlog',
      label: 'Backlog',
      subtitle: 'Out of every sprint',
      icon: 'tray-full' as const,
      selected: sprintInfo.data != null && currentSprint == null,
      onPress: () => pickSprint(null),
    },
  ];

  const remove = useMutation({
    mutationFn: () => deleteJiraIssue(credentials, issue.key),
    onSuccess: () => {
      haptics.success();
      void client.invalidateQueries({ queryKey: ['jira', 'board'] });
      client.removeQueries({ queryKey: issueKey(credentials.id, issue.key) });
      router.back();
    },
    onError: fail,
  });

  const canSave = dirty && summary.trim().length > 0 && !save.isPending;
  const meta = [issue.key, issue.type?.name].filter(Boolean).join(' · ');
  const mine = issue.assignee?.accountId === credentials.account.accountId;
  const me = credentials.account.accountId;

  /** One person in a picker, with their Jira avatar. */
  function personItem(user: JiraUser, selected: boolean, onPick: () => void) {
    return {
      key: user.accountId,
      label: user.accountId === me ? `${user.displayName} (you)` : user.displayName,
      subtitle: user.email,
      leading: (
        <View style={{ width: 40, alignItems: 'center' }}>
          {user.avatarUrl ? (
            <Avatar url={user.avatarUrl} headers={headers} size={32} />
          ) : (
            <MaterialCommunityIcons name="account-circle-outline" size={28} color={colors.text2} />
          )}
        </View>
      ),
      selected,
      onPress: onPick,
    };
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: issue.key,
          ...(IOS
            ? {
                headerRight: () => (
                  <HeaderTextButton
                    label="Save"
                    onPress={() => save.mutate()}
                    disabled={!canSave}
                    loading={save.isPending}
                  />
                ),
              }
            : {}),
        }}
      />
      <KeyboardScrollView
        bottomOffset={ACTION_BAR_CLEARANCE}
        className="bg-sf-bg flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ ...EDITOR_CONTENT, paddingBottom: barBottom + 96 }}>
        <EditorTitle
          value={summary}
          onChangeText={setSummary}
          placeholder="Summary"
          editable={issue.editable.summary}
          iconUrl={issue.type?.iconUrl}
          iconHeaders={headers}
          meta={meta}
        />
        {issue.editable.description ? (
          segments.map((segment, index) =>
            segment.kind === 'rich' ? (
              <View key={index} style={{ marginLeft: EDITOR_TEXT_INSET, marginTop: 8 }}>
                <AdfViewer
                  nodes={[segment.node]}
                  media={issue.media}
                  headers={headers}
                  fallbackUrl={jiraIssueUrl(credentials, issue.key)}
                />
              </View>
            ) : (
              <EditorNotes
                key={index}
                value={drafts[index] ?? ''}
                onChangeText={(value) =>
                  setDrafts((current) => current.map((draft, at) => (at === index ? value : draft)))
                }
                placeholder={index === 0 ? 'Description' : 'Add to the description'}
              />
            )
          )
        ) : issue.descriptionDoc?.content?.length ? (
          <View style={{ marginLeft: EDITOR_TEXT_INSET, marginTop: 6 }}>
            <AdfViewer
              nodes={issue.descriptionDoc.content}
              media={issue.media}
              headers={headers}
              fallbackUrl={jiraIssueUrl(credentials, issue.key)}
            />
          </View>
        ) : null}
        {issue.editable.description && hasRich ? (
          <View className="flex-row items-center" style={{ gap: 6, marginLeft: EDITOR_TEXT_INSET, marginTop: 8 }}>
            <MaterialCommunityIcons name="lock-outline" size={14} color={colors.text3} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.text3 }}>
              Images, tables and mentions save back as they are. Change those in Jira.
            </Text>
          </View>
        ) : null}
        <EditorChips values={labels} onChange={setLabels} editable={issue.editable.labels} />

        <EditorHeading title="Details" />
        <DetailsCard>
          <DetailRow
            icon="progress-check"
            label="Status"
            value={transition.isPending ? 'Moving…' : issue.status.name}
            loading={transition.isPending}
            onPress={() => setPicker('status')}
          />
          <DetailRow
            icon="account-outline"
            label="Assignee"
            value={
              issue.assignee
                ? mine
                  ? `${issue.assignee.displayName} (you)`
                  : issue.assignee.displayName
                : 'Unassigned'
            }
            leading={
              issue.assignee?.avatarUrl ? <Avatar url={issue.assignee.avatarUrl} headers={headers} /> : null
            }
            loading={assign.isPending}
            onPress={() => setPicker('assignee')}
          />
          {sprintBoards.length > 1 ? (
            <DetailRow
              icon="view-dashboard-outline"
              label="Sprint board"
              value={sprintBoardInfo?.name ?? (jira.isLoading ? 'Loading…' : 'Choose a board')}
              onPress={() => setPicker('board')}
            />
          ) : null}
          {showSprint ? (
            <DetailRow
              icon={currentSprint ? 'run-fast' : 'tray-full'}
              label="Sprint"
              value={sprintInfo.isLoading ? 'Loading…' : (currentSprint?.name ?? 'Backlog')}
              loading={moveSprint.isPending}
              onPress={canMoveSprint ? () => setPicker('sprint') : undefined}
            />
          ) : null}
          {canEditComponents || components.length > 0 ? (
            <DetailRow
              icon="puzzle-outline"
              label="Components"
              value={components.length ? components.map((component) => component.name).join(', ') : 'None'}
              onPress={canEditComponents ? () => setPicker('components') : undefined}
            />
          ) : null}
          <DetailRow
            icon="signal-cellular-2"
            label="Priority"
            value={priority?.name ?? 'None'}
            leading={priority?.iconUrl ? <Avatar url={priority.iconUrl} headers={headers} square /> : null}
            onPress={issue.editable.priority ? () => setPicker('priority') : undefined}
          />
          {issue.editable.duedate ? (
            <View style={{ paddingVertical: 12 }}>
              <DateField
                label="Due date"
                iconName="flag-outline"
                value={duedate ? `${duedate}T12:00:00` : null}
                onChange={(value) => setDuedate(value ? localDay(value) : null)}
              />
            </View>
          ) : null}
          {issue.reporter ? (
            <DetailRow
              icon="pencil-outline"
              label="Reporter"
              value={
                issue.reporter.accountId === me ? `${issue.reporter.displayName} (you)` : issue.reporter.displayName
              }
              leading={
                issue.reporter.avatarUrl ? <Avatar url={issue.reporter.avatarUrl} headers={headers} /> : null
              }
              loading={changeReporter.isPending}
              onPress={issue.editable.reporter ? () => setPicker('reporter') : undefined}
            />
          ) : null}
        </DetailsCard>

        {!IOS ? (
          <EditorPrimaryButton
            label="Save changes"
            busyLabel="Saving…"
            busy={save.isPending}
            disabled={!canSave}
            onPress={() => save.mutate()}
          />
        ) : null}
        <EditorActionRow
          icon="open-in-new"
          label="Open in Jira"
          onPress={() => void WebBrowser.openBrowserAsync(jiraIssueUrl(credentials, issue.key))}
        />
      </KeyboardScrollView>

      <TaskActionBar
        bottom={barBottom}
        onMove={() => setPicker('status')}
        onDelete={() => setDeleteVisible(true)}
        deleteLabel="Delete issue"
      />

      <PickerSheet
        visible={picker === 'status'}
        title="Move to"
        subtitle={
          canMoveSprint
            ? `Now: ${issue.status.name} · ${currentSprint?.name ?? 'Backlog'}`
            : `Now: ${issue.status.name}`
        }
        items={[
          ...(transitions.isLoading
            ? [
                {
                  key: 'loading',
                  label: 'Loading statuses…',
                  icon: 'progress-clock' as const,
                  onPress: () => {},
                },
              ]
            : (transitions.data ?? []).map((option) => ({
                key: option.id,
                label: option.to.name,
                subtitle: option.name !== option.to.name ? option.name : undefined,
                icon:
                  option.to.category === 'done'
                    ? ('check-circle-outline' as const)
                    : option.to.category === 'indeterminate'
                      ? ('progress-clock' as const)
                      : ('circle-outline' as const),
                selected: option.to.id === issue.status.id,
                onPress: () => {
                  setPicker(null);
                  if (option.to.id !== issue.status.id) transition.mutate(option.id);
                },
              }))),
          // Move also reaches the board's sprints and the backlog.
          ...(canMoveSprint ? sprintItems : []),
        ]}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'assignee'}
        title="Assignee"
        search={{
          placeholder: 'Search people',
          onChange: assignees.setQuery,
          loading: assignees.loading,
          emptyText: 'No one by that name can be assigned here.',
        }}
        items={[
          ...(assignees.query.trim()
            ? []
            : [
                {
                  key: 'me',
                  label: 'Assign to me',
                  subtitle: credentials.account.displayName,
                  icon: 'account-check-outline' as const,
                  selected: mine,
                  onPress: () => {
                    setPicker(null);
                    if (!mine) assign.mutate(me);
                  },
                },
                {
                  key: 'none',
                  label: 'Unassigned',
                  icon: 'account-off-outline' as const,
                  selected: !issue.assignee,
                  onPress: () => {
                    setPicker(null);
                    if (issue.assignee) assign.mutate(null);
                  },
                },
              ]),
          ...assignees.users
            .filter((user) => assignees.query.trim() || user.accountId !== me)
            .map((user) =>
              personItem(user, user.accountId === issue.assignee?.accountId, () => {
                setPicker(null);
                if (user.accountId !== issue.assignee?.accountId) assign.mutate(user.accountId);
              })
            ),
        ]}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'reporter'}
        title="Reporter"
        search={{
          placeholder: 'Search people',
          onChange: reporters.setQuery,
          loading: reporters.loading,
          emptyText: 'No one by that name on this Jira site.',
        }}
        items={reporters.users.map((user) =>
          personItem(user, user.accountId === issue.reporter?.accountId, () => {
            setPicker(null);
            if (user.accountId !== issue.reporter?.accountId) changeReporter.mutate(user.accountId);
          })
        )}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'components'}
        title="Components"
        subtitle="Pick any number. They save with your other changes."
        doneLabel="Done"
        search={
          (projectComponents.data?.length ?? 0) > 6
            ? { placeholder: 'Search components', emptyText: 'No component by that name.' }
            : undefined
        }
        items={(projectComponents.data ?? []).map((component) => {
          const on = components.some((picked) => picked.id === component.id);
          return {
            key: component.id,
            label: component.name,
            subtitle: component.description,
            icon: on ? ('checkbox-marked' as const) : ('checkbox-blank-outline' as const),
            selected: on,
            onPress: () =>
              setComponents((current) =>
                on ? current.filter((picked) => picked.id !== component.id) : [...current, component]
              ),
          };
        })}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'board'}
        title="Sprint board"
        subtitle="Which board's sprints to choose from."
        search={sprintBoards.length > 6 ? { placeholder: 'Search boards', emptyText: 'No board by that name.' } : undefined}
        items={sprintBoards.map((candidate) => ({
          key: String(candidate.id),
          label: candidate.name,
          subtitle: [candidate.projectName ?? candidate.projectKey, candidate.projectKey === issue.projectKey ? "This issue's project" : undefined]
            .filter(Boolean)
            .join(' · '),
          icon: 'view-dashboard-outline' as const,
          selected: candidate.id === sprintBoard,
          onPress: () => {
            setBoardChoice(candidate.id);
            // Straight on to its sprints.
            setPicker('sprint');
          },
        }))}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'sprint'}
        title="Sprint"
        subtitle={
          sprintBoardInfo
            ? `From ${sprintBoardInfo.name}. Move this issue to a sprint, or back to the backlog.`
            : 'Move this issue to a sprint, or back to the backlog.'
        }
        search={sprintItems.length > 6 ? { placeholder: 'Search sprints', emptyText: 'No sprint by that name.' } : undefined}
        items={
          sprints.isLoading
            ? [{ key: 'loading', label: 'Loading sprints…', icon: 'progress-clock' as const, onPress: () => {} }]
            : sprintItems
        }
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'priority'}
        title="Priority"
        items={
          priorities.isLoading
            ? [
                {
                  key: 'loading',
                  label: 'Loading priorities…',
                  icon: 'progress-clock',
                  onPress: () => {},
                },
              ]
            : (priorities.data ?? []).map((option) => ({
                key: option.id,
                label: option.name,
                leading: option.iconUrl ? (
                  <Avatar url={option.iconUrl} headers={headers} square />
                ) : undefined,
                selected: option.id === priority?.id,
                onPress: () => {
                  haptics.selection();
                  setPriority(option);
                  setPicker(null);
                },
              }))
        }
        onClose={() => setPicker(null)}
      />
      <NativeAlert
        visible={deleteVisible}
        title="Delete issue?"
        message={`${issue.key} "${issue.summary}" is deleted from Jira. This cannot be undone.`}
        confirmLabel="Delete"
        dismissLabel="Cancel"
        onDismiss={() => setDeleteVisible(false)}
        onConfirm={() => {
          setDeleteVisible(false);
          remove.mutate();
        }}
      />
      <NativeAlert
        visible={error != null}
        title="Jira"
        message={error ?? ''}
        onDismiss={() => setError(null)}
      />
    </>
  );
}

function Avatar({
  url,
  headers,
  square,
  size = 22,
}: {
  url: string;
  headers: Record<string, string>;
  square?: boolean;
  size?: number;
}) {
  return (
    <Image
      source={{ uri: url, headers }}
      style={{ width: size, height: size, borderRadius: square ? 4 : size / 2 }}
      contentFit="cover"
      accessibilityIgnoresInvertColors
    />
  );
}

/** The calendar day of an ISO timestamp in local time, as Jira's YYYY-MM-DD. */
function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
