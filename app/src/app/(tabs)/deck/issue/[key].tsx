import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';

import {
  applyJiraTransition,
  assignJiraIssue,
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
  type JiraIssueDetail,
  type JiraIssuePatch,
} from '@/api/jira';
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
} from '@/components/boards/item-editor';
import { PickerSheet } from '@/components/boards/picker-sheet';
import { HeaderTextButton } from '@/components/settings/settings-list';
import { DateField } from '@/components/tasks/date-field';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import type { JiraCredentials } from '@/lib/credentials-types';
import { haptics } from '@/lib/haptics';
import { handleJiraError, useJiraAccounts, useJiraSessionStore } from '@/stores/jira-session-store';
import { ScrollView, View } from '@/tw';

const IOS = Platform.OS === 'ios';

const issueKey = (accountId: string, key: string) => ['jira', 'issue', accountId, key] as const;

/**
 * A Jira issue, opened from a board and edited in the app. Laid out like the
 * New To-Do sheet. Summary, description, labels, priority and due date save
 * together; status and assignee apply straight away, as they do in Jira.
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
  const [description, setDescription] = useState(issue.description);
  const [labels, setLabels] = useState(issue.labels);
  const [duedate, setDuedate] = useState(issue.duedate);
  const [priority, setPriority] = useState(issue.priority);
  const [picker, setPicker] = useState<'status' | 'priority' | 'assignee' | 'sprint' | null>(null);

  // Sprints come from the board the issue was opened on (scrum boards only).
  const hasBoard = boardId != null && Number.isFinite(boardId);
  const sprints = useQuery({
    queryKey: ['jira', 'sprints', credentials.id, boardId],
    queryFn: () => fetchJiraSprints(credentials, boardId!),
    enabled: hasBoard,
    staleTime: 5 * 60_000,
  });
  const currentSprint = useQuery({
    queryKey: ['jira', 'issue-sprint', credentials.id, issue.key],
    queryFn: () => fetchJiraIssueSprint(credentials, issue.key),
    enabled: hasBoard && (sprints.data?.length ?? 0) > 0,
  });
  const [error, setError] = useState<string | null>(null);

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
  if (description !== issue.description) patch.description = description;
  if (labels.join('\n') !== issue.labels.join('\n')) patch.labels = labels;
  if (duedate !== issue.duedate) patch.duedate = duedate;
  if (priority && priority.id !== issue.priority?.id) patch.priorityId = priority.id;
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
  const moveSprint = useMutation({
    mutationFn: (sprintId: number | null) => moveJiraIssuesToSprint(credentials, [issue.key], sprintId),
    onSuccess: () => {
      haptics.success();
      void client.invalidateQueries({ queryKey: ['jira', 'issue-sprint', credentials.id, issue.key] });
      refresh();
    },
    onError: fail,
  });

  const canSave = dirty && summary.trim().length > 0 && !save.isPending;
  const meta = [issue.key, issue.type?.name].filter(Boolean).join(' · ');
  const mine = issue.assignee?.accountId === credentials.account.accountId;

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
      <ScrollView
        className="bg-sf-bg flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={IOS}
        contentContainerStyle={{ ...EDITOR_CONTENT, paddingBottom: 48 }}>
        <EditorTitle
          value={summary}
          onChangeText={setSummary}
          placeholder="Summary"
          editable={issue.editable.summary}
          iconUrl={issue.type?.iconUrl}
          iconHeaders={headers}
          meta={meta}
        />
        <EditorNotes
          value={description}
          onChangeText={setDescription}
          placeholder="Description"
          editable={issue.descriptionEditable}
          readOnlyNote={
            issue.editable.description
              ? 'This description has images or tables, so it can only be edited in Jira.'
              : undefined
          }
        />
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
          {(sprints.data?.length ?? 0) > 0 ? (
            <DetailRow
              icon="run-fast"
              label="Sprint"
              value={
                moveSprint.isPending
                  ? 'Moving…'
                  : currentSprint.isLoading
                    ? 'Loading…'
                    : (currentSprint.data?.name ?? 'Backlog')
              }
              loading={moveSprint.isPending}
              onPress={() => setPicker('sprint')}
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
              value={issue.reporter.displayName}
              leading={
                issue.reporter.avatarUrl ? <Avatar url={issue.reporter.avatarUrl} headers={headers} /> : null
              }
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
      </ScrollView>

      <PickerSheet
        visible={picker === 'status'}
        title="Move to"
        subtitle={`Now: ${issue.status.name}`}
        items={
          transitions.isLoading
            ? [
                {
                  key: 'loading',
                  label: 'Loading statuses…',
                  icon: 'progress-clock',
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
              }))
        }
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'assignee'}
        title="Assignee"
        items={[
          {
            key: 'me',
            label: `Assign to me`,
            subtitle: credentials.account.displayName,
            icon: 'account-check-outline',
            selected: mine,
            onPress: () => {
              setPicker(null);
              if (!mine) assign.mutate(credentials.account.accountId);
            },
          },
          {
            key: 'none',
            label: 'Unassigned',
            icon: 'account-off-outline',
            selected: !issue.assignee,
            onPress: () => {
              setPicker(null);
              if (issue.assignee) assign.mutate(null);
            },
          },
        ]}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'sprint'}
        title="Sprint"
        subtitle="Move this issue to a sprint, or back to the backlog."
        items={[
          ...(sprints.data ?? []).map((sprint) => ({
            key: String(sprint.id),
            label: sprint.name,
            subtitle: [sprint.state === 'active' ? 'Active' : 'Upcoming', sprintTiming(sprint)]
              .filter(Boolean)
              .join(' · '),
            icon: sprint.state === 'active' ? ('run-fast' as const) : ('calendar-clock' as const),
            selected: currentSprint.data?.id === sprint.id,
            onPress: () => {
              setPicker(null);
              if (currentSprint.data?.id !== sprint.id) moveSprint.mutate(sprint.id);
            },
          })),
          {
            key: 'backlog',
            label: 'Backlog',
            icon: 'tray-full' as const,
            selected: currentSprint.data === null,
            onPress: () => {
              setPicker(null);
              if (currentSprint.data) moveSprint.mutate(null);
            },
          },
        ]}
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
}: {
  url: string;
  headers: Record<string, string>;
  square?: boolean;
}) {
  return (
    <Image
      source={{ uri: url, headers }}
      style={{ width: 22, height: 22, borderRadius: square ? 4 : 11 }}
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
