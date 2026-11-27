import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  defaultIssueType,
  fetchJiraBoardDetail,
  fetchJiraComponents,
  fetchJiraIssueTypes,
  fetchJiraPriorities,
  sprintTiming,
  jiraImageHeaders,
  type JiraBoard,
  type JiraUser,
} from '@/api/jira';
import {
  DetailRow,
  DetailsCard,
  EDITOR_CONTENT,
  EditorChips,
  EditorHeading,
  EditorNotes,
  EditorPrimaryButton,
  EditorTitle,
} from '@/components/boards/item-editor';
import { KeyboardScrollView } from '@/components/ui/keyboard';
import { PickerSheet } from '@/components/boards/picker-sheet';
import { HeaderTextButton } from '@/components/settings/settings-list';
import { DateField } from '@/components/ui/date-field';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useTheme } from '@/components/theme/context';
import { jiraAccountLabel, useJiraBoards } from '@/features/boards/use-board-detail';
import { useJiraPeople } from '@/features/boards/use-jira-people';
import { queryKeys } from '@/lib/query-client';
import { haptics } from '@/lib/haptics';
import { createJiraIssueOrQueue } from '@/features/sync/replay';
import { handleJiraError } from '@/stores/jira-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { View } from '@/tw';

const IOS = Platform.OS === 'ios';

type Picker = 'board' | 'column' | 'sprint' | 'type' | 'priority' | 'assignee' | 'reporter' | 'components' | null;

/** Lists longer than this get a search field in their picker. */
const SEARCH_FROM = 6;

/**
 * New Jira issue, laid out like the New To-Do sheet: summary, Markdown
 * description and labels, then board, column, sprint, type, components,
 * priority, due date, assignee and reporter in one details card. Opened from a board's + button or from a
 * column's quick add with "More details".
 */
export default function NewIssueScreen() {
  const params = useLocalSearchParams<{
    account?: string;
    board?: string;
    column?: string;
    /** "backlog" or a sprint id: what the board was showing. */
    sprint?: string;
  }>();
  const client = useQueryClient();
  const jira = useJiraBoards();
  const scope = useSettingsStore((s) => s.jiraIssueScope);

  const creatable = useMemo(() => (jira.data ?? []).filter((board) => board.projectKey), [jira.data]);
  const [boardChoice, setBoardChoice] = useState<{
    accountId?: string;
    id?: number;
  }>({
    accountId: params.account,
    id: params.board ? Number(params.board) : undefined,
  });
  const board: JiraBoard | undefined =
    creatable.find(
      (candidate) =>
        candidate.id === boardChoice.id &&
        (!boardChoice.accountId || candidate.accountId === boardChoice.accountId)
    ) ?? creatable[0];
  const credentials = jira.accounts.find((account) => account.id === board?.accountId) ?? null;
  const headers = useMemo(() => (credentials ? jiraImageHeaders(credentials) : undefined), [credentials]);

  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [duedate, setDuedate] = useState<string | null>(null);
  // 'me' until changed; null is unassigned.
  const [assignee, setAssignee] = useState<JiraUser | 'me' | null>('me');
  // Undefined: Jira's default, the connected user.
  const [reporter, setReporter] = useState<JiraUser | undefined>();
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [columnName, setColumnName] = useState<string | undefined>(params.column);
  const [typeId, setTypeId] = useState<string | undefined>();
  const [priorityId, setPriorityId] = useState<string | undefined>();
  // undefined: the sprint the board was showing (or its active one); null: the backlog.
  const [sprintChoice, setSprintChoice] = useState<number | null | undefined>(
    params.sprint === 'backlog' ? null : params.sprint ? Number(params.sprint) : undefined
  );
  const [picker, setPicker] = useState<Picker>(null);
  const { colors } = useTheme();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same key as the board screen, so its columns are usually cached already.
  const detail = useQuery({
    queryKey: queryKeys.jiraBoard(credentials?.id ?? '', board?.id ?? -1, scope),
    queryFn: () => fetchJiraBoardDetail(credentials!, board!, scope),
    enabled: credentials != null && board != null,
  });
  const types = useQuery({
    queryKey: ['jira', 'issue-types', credentials?.id, board?.projectKey],
    queryFn: () => fetchJiraIssueTypes(credentials!, board!.projectKey!),
    enabled: credentials != null && !!board?.projectKey,
    staleTime: 60 * 60_000,
  });
  const priorities = useQuery({
    queryKey: ['jira', 'priorities', credentials?.id],
    queryFn: () => fetchJiraPriorities(credentials!),
    enabled: credentials != null,
    staleTime: 60 * 60_000,
  });

  const columns = detail.data?.columns ?? [];
  const components = useQuery({
    queryKey: ['jira', 'components', credentials?.id, board?.projectKey],
    queryFn: () => fetchJiraComponents(credentials!, board!.projectKey!),
    enabled: credentials != null && !!board?.projectKey,
    staleTime: 10 * 60_000,
  });
  const assignees = useJiraPeople(
    credentials,
    { kind: 'assignable', projectKey: board?.projectKey },
    picker === 'assignee'
  );
  const reporters = useJiraPeople(credentials, { kind: 'anyone' }, picker === 'reporter');
  const sprints = detail.data?.sprints ?? [];
  // A chosen sprint, else the sprint the board shows, else (the All view)
  // the active sprint, where Jira's own board puts new work.
  const sprint =
    sprintChoice === null
      ? undefined
      : sprintChoice !== undefined
        ? sprints.find((candidate) => candidate.id === sprintChoice)
        : (detail.data?.sprint ??
          (detail.data?.view.kind === 'board' ? sprints.find((candidate) => candidate.state === 'active') : undefined));
  const column = columns.find((candidate) => candidate.name === columnName) ?? columns[0];
  const type = types.data?.find((candidate) => candidate.id === typeId) ?? defaultIssueType(types.data ?? []);
  const priority = priorities.data?.find((candidate) => candidate.id === priorityId);
  const canCreate = summary.trim().length > 0 && credentials != null && board != null && !creating;

  async function create() {
    if (!canCreate || !credentials || !board) return;
    setCreating(true);
    try {
      const created = await createJiraIssueOrQueue(credentials, {
        board,
        summary,
        description,
        labels,
        duedate,
        assigneeId: assignee === 'me' ? credentials.account.accountId : (assignee?.accountId ?? null),
        reporterId: reporter && reporter.accountId !== credentials.account.accountId ? reporter.accountId : undefined,
        componentIds: componentIds.filter((id) => components.data?.some((component) => component.id === id)),
        issueTypeId: type?.id,
        priorityId,
        column,
        firstColumn: columns[0],
        sprintId: sprint?.id,
      });
      haptics.success();
      if (!created) {
        // Offline: it sits in the outbox and goes to Jira once back online.
        router.back();
        return;
      }
      await client.invalidateQueries({ queryKey: ['jira', 'board'] });
      router.back();
      // Show it straight away, ready for more edits.
      router.push({
        pathname: '/deck/issue/[key]',
        params: { key: created.key, account: credentials.id },
      });
    } catch (cause) {
      haptics.error();
      handleJiraError(cause, credentials.id);
      setError(cause instanceof Error ? cause.message : 'Jira did not create the issue.');
    } finally {
      setCreating(false);
    }
  }

  if (jira.isLoading && creatable.length === 0) {
    return (
      <SheetSurface title="New Issue">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <LoadingState message="Loading Jira boards…" fullScreen={false} />
        </View>
      </SheetSurface>
    );
  }

  if (!board || !credentials) {
    return (
      <SheetSurface title="New Issue">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="jira"
            title={jira.accounts.length === 0 ? 'Connect Jira first' : 'No board to add to'}
            subtitle={
              jira.accounts.length === 0
                ? 'Add a Jira account in Settings to create issues from here.'
                : 'Patchwork can only add to boards that belong to a single project.'
            }
            actions={
              jira.accounts.length === 0
                ? [
                    {
                      label: 'Open Settings',
                      onPress: () => {
                        router.back();
                        router.push('/settings/jira');
                      },
                      variant: 'filled' as const,
                    },
                  ]
                : []
            }
          />
        </View>
      </SheetSurface>
    );
  }

  const boardLabel = (candidate: JiraBoard) => {
    const name = candidate.projectName ?? candidate.name;
    const account = jira.accounts.find((entry) => entry.id === candidate.accountId);
    const where = account ? jiraAccountLabel(account, jira.accounts) : undefined;
    return {
      name,
      subtitle: [candidate.projectKey, where].filter(Boolean).join(' · '),
    };
  };

  return (
    <SheetSurface title="New Issue">
      {IOS ? (
        <Stack.Screen
          options={{
            headerLeft: () => <HeaderTextButton label="Cancel" bold={false} onPress={() => router.back()} />,
            headerRight: () => (
              <HeaderTextButton label="Create" onPress={create} disabled={!canCreate} loading={creating} />
            ),
          }}
        />
      ) : null}
      <KeyboardScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ ...EDITOR_CONTENT, paddingBottom: 32 }}>
        <EditorTitle
          value={summary}
          onChangeText={setSummary}
          placeholder="What needs to be done?"
          autoFocus
          iconUrl={type?.iconUrl}
          iconHeaders={headers}
          meta={[board.projectKey, type?.name].filter(Boolean).join(' · ')}
        />
        <EditorNotes value={description} onChangeText={setDescription} placeholder="Description" />
        <EditorChips values={labels} onChange={setLabels} />

        <EditorHeading title="Details" />
        <DetailsCard>
          <DetailRow
            icon="view-dashboard-outline"
            label="Board"
            value={boardLabel(board).name}
            onPress={creatable.length > 1 ? () => setPicker('board') : undefined}
          />
          <DetailRow
            icon="view-column-outline"
            label="Column"
            value={detail.isLoading ? 'Loading…' : (column?.name ?? 'First column')}
            onPress={columns.length > 1 ? () => setPicker('column') : undefined}
          />
          {sprints.length > 0 ? (
            <DetailRow
              icon="run-fast"
              label="Sprint"
              value={sprint?.name ?? 'Backlog'}
              onPress={() => setPicker('sprint')}
            />
          ) : null}
          <DetailRow
            icon="shape-outline"
            label="Type"
            value={types.isLoading ? 'Loading…' : (type?.name ?? 'Task')}
            leading={type?.iconUrl ? <Icon url={type.iconUrl} headers={headers} /> : null}
            onPress={(types.data?.length ?? 0) > 1 ? () => setPicker('type') : undefined}
          />
          {(components.data?.length ?? 0) > 0 ? (
            <DetailRow
              icon="puzzle-outline"
              label="Components"
              value={
                componentIds.length
                  ? (components.data ?? [])
                      .filter((component) => componentIds.includes(component.id))
                      .map((component) => component.name)
                      .join(', ')
                  : 'None'
              }
              onPress={() => setPicker('components')}
            />
          ) : null}
          <DetailRow
            icon="signal-cellular-2"
            label="Priority"
            value={priority?.name ?? 'Default'}
            leading={priority?.iconUrl ? <Icon url={priority.iconUrl} headers={headers} /> : null}
            onPress={(priorities.data?.length ?? 0) > 0 ? () => setPicker('priority') : undefined}
          />
          <View style={{ paddingVertical: 12 }}>
            <DateField
              label="Due date"
              iconName="flag-outline"
              value={duedate ? `${duedate}T12:00:00` : null}
              onChange={(value) => setDuedate(value ? localDay(value) : null)}
            />
          </View>
          <DetailRow
            icon="account-outline"
            label="Assignee"
            value={
              assignee === 'me'
                ? `${credentials.account.displayName} (you)`
                : (assignee?.displayName ?? 'Unassigned')
            }
            leading={
              assignee && assignee !== 'me' && assignee.avatarUrl ? (
                <Icon url={assignee.avatarUrl} headers={headers} round />
              ) : null
            }
            onPress={() => setPicker('assignee')}
          />
          <DetailRow
            icon="pencil-outline"
            label="Reporter"
            value={reporter ? reporter.displayName : `${credentials.account.displayName} (you)`}
            leading={reporter?.avatarUrl ? <Icon url={reporter.avatarUrl} headers={headers} round /> : null}
            onPress={() => setPicker('reporter')}
          />
        </DetailsCard>

        {!IOS ? (
          <EditorPrimaryButton
            label="Create issue"
            busyLabel="Creating…"
            icon="jira"
            busy={creating}
            disabled={!canCreate}
            onPress={create}
          />
        ) : null}
      </KeyboardScrollView>

      <PickerSheet
        visible={picker === 'board'}
        title="Board"
        search={creatable.length > SEARCH_FROM ? { placeholder: 'Search boards', emptyText: 'No board by that name.' } : undefined}
        items={creatable.map((candidate) => {
          const label = boardLabel(candidate);
          return {
            key: `${candidate.accountId}:${candidate.id}`,
            label: label.name,
            subtitle: label.subtitle,
            icon: 'view-dashboard-outline' as const,
            selected: candidate === board,
            onPress: () => {
              haptics.selection();
              setBoardChoice({
                accountId: candidate.accountId,
                id: candidate.id,
              });
              // Columns, types and priorities belong to the board's project.
              setColumnName(undefined);
              setSprintChoice(undefined);
              setTypeId(undefined);
              setPriorityId(undefined);
              setComponentIds([]);
              // Who can be assigned depends on the project.
              if (assignee !== 'me') setAssignee('me');
              setPicker(null);
            },
          };
        })}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'sprint'}
        title="Sprint"
        search={sprints.length > SEARCH_FROM ? { placeholder: 'Search sprints', emptyText: 'No sprint by that name.' } : undefined}
        items={[
          ...sprints.map((candidate) => ({
            key: String(candidate.id),
            label: candidate.name,
            subtitle: [candidate.state === 'active' ? 'Active' : 'Upcoming', sprintTiming(candidate)]
              .filter(Boolean)
              .join(' · '),
            icon: candidate.state === 'active' ? ('run-fast' as const) : ('calendar-clock' as const),
            selected: candidate.id === sprint?.id,
            onPress: () => {
              haptics.selection();
              setSprintChoice(candidate.id);
              setPicker(null);
            },
          })),
          {
            key: 'backlog',
            label: 'Backlog',
            icon: 'tray-full' as const,
            selected: sprint == null,
            onPress: () => {
              haptics.selection();
              setSprintChoice(null);
              setPicker(null);
            },
          },
        ]}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'column'}
        title="Column"
        items={columns.map((candidate) => ({
          key: candidate.name,
          label: candidate.name,
          icon: 'view-column-outline' as const,
          selected: candidate.name === column?.name,
          onPress: () => {
            haptics.selection();
            setColumnName(candidate.name);
            setPicker(null);
          },
        }))}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'type'}
        title="Issue type"
        items={(types.data ?? []).map((candidate) => ({
          key: candidate.id,
          label: candidate.name,
          leading: candidate.iconUrl ? <Icon url={candidate.iconUrl} headers={headers} /> : undefined,
          selected: candidate.id === type?.id,
          onPress: () => {
            haptics.selection();
            setTypeId(candidate.id);
            setPicker(null);
          },
        }))}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'priority'}
        title="Priority"
        items={[
          {
            key: 'default',
            label: 'Default',
            subtitle: "The project's default priority",
            icon: 'minus' as const,
            selected: priorityId == null,
            onPress: () => {
              setPriorityId(undefined);
              setPicker(null);
            },
          },
          ...(priorities.data ?? []).map((candidate) => ({
            key: candidate.id,
            label: candidate.name,
            leading: candidate.iconUrl ? <Icon url={candidate.iconUrl} headers={headers} /> : undefined,
            selected: candidate.id === priorityId,
            onPress: () => {
              haptics.selection();
              setPriorityId(candidate.id);
              setPicker(null);
            },
          })),
        ]}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'components'}
        title="Components"
        subtitle="Pick any number."
        doneLabel="Done"
        search={
          (components.data?.length ?? 0) > SEARCH_FROM
            ? { placeholder: 'Search components', emptyText: 'No component by that name.' }
            : undefined
        }
        items={(components.data ?? []).map((component) => {
          const on = componentIds.includes(component.id);
          return {
            key: component.id,
            label: component.name,
            subtitle: component.description,
            icon: on ? ('checkbox-marked' as const) : ('checkbox-blank-outline' as const),
            selected: on,
            onPress: () =>
              setComponentIds((current) => (on ? current.filter((id) => id !== component.id) : [...current, component.id])),
          };
        })}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'assignee'}
        title="Assignee"
        search={{
          placeholder: 'Search people',
          onChange: assignees.setQuery,
          loading: assignees.loading,
          emptyText: 'No one by that name can be assigned in this project.',
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
                  selected: assignee === 'me',
                  onPress: () => {
                    setAssignee('me');
                    setPicker(null);
                  },
                },
                {
                  key: 'none',
                  label: 'Unassigned',
                  icon: 'account-off-outline' as const,
                  selected: assignee === null,
                  onPress: () => {
                    setAssignee(null);
                    setPicker(null);
                  },
                },
              ]),
          ...assignees.users
            .filter((user) => assignees.query.trim() || user.accountId !== credentials.account.accountId)
            .map((user) => ({
              key: user.accountId,
              label: user.displayName,
              subtitle: user.email,
              leading: <PersonIcon user={user} headers={headers} color={colors.text2} />,
              selected: assignee !== 'me' && assignee?.accountId === user.accountId,
              onPress: () => {
                setAssignee(user.accountId === credentials.account.accountId ? 'me' : user);
                setPicker(null);
              },
            })),
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
        items={[
          ...(reporters.query.trim()
            ? []
            : [
                {
                  key: 'me',
                  label: 'You',
                  subtitle: credentials.account.displayName,
                  icon: 'account-check-outline' as const,
                  selected: !reporter,
                  onPress: () => {
                    setReporter(undefined);
                    setPicker(null);
                  },
                },
              ]),
          ...reporters.users
            .filter((user) => user.accountId !== credentials.account.accountId)
            .map((user) => ({
              key: user.accountId,
              label: user.displayName,
              subtitle: user.email,
              leading: <PersonIcon user={user} headers={headers} color={colors.text2} />,
              selected: reporter?.accountId === user.accountId,
              onPress: () => {
                setReporter(user);
                setPicker(null);
              },
            })),
        ]}
        onClose={() => setPicker(null)}
      />
      <NativeAlert
        visible={error != null}
        title="Could not create"
        message={error ?? ''}
        onDismiss={() => setError(null)}
      />
    </SheetSurface>
  );
}

function PersonIcon({ user, headers, color }: { user: JiraUser; headers?: Record<string, string>; color: string }) {
  return (
    <View style={{ width: 40, alignItems: 'center' }}>
      {user.avatarUrl ? (
        <Image
          source={{ uri: user.avatarUrl, headers }}
          style={{ width: 32, height: 32, borderRadius: 16 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <MaterialCommunityIcons name="account-circle-outline" size={28} color={color} />
      )}
    </View>
  );
}

function Icon({ url, headers, round }: { url: string; headers?: Record<string, string>; round?: boolean }) {
  return (
    <Image
      source={{ uri: url, headers }}
      style={{ width: 20, height: 20, borderRadius: round ? 10 : 4 }}
      contentFit="contain"
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
