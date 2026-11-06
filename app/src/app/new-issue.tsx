import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';

import {
  createJiraIssue,
  defaultIssueType,
  fetchJiraBoardDetail,
  fetchJiraIssueTypes,
  fetchJiraPriorities,
  sprintTiming,
  jiraImageHeaders,
  type JiraBoard,
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
import { PickerSheet } from '@/components/boards/picker-sheet';
import { HeaderTextButton } from '@/components/settings/settings-list';
import { DateField } from '@/components/tasks/date-field';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { Switch } from '@/components/ui/switch';
import { jiraAccountLabel, useJiraBoards } from '@/hooks/use-boards';
import { queryKeys } from '@/lib/query-client';
import { haptics } from '@/lib/haptics';
import { handleJiraError } from '@/stores/jira-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, View } from '@/tw';

const IOS = Platform.OS === 'ios';

type Picker = 'board' | 'column' | 'sprint' | 'type' | 'priority' | null;

/**
 * New Jira issue, laid out like the New To-Do sheet: summary, Markdown
 * description and labels, then board, column, type, priority, due date and
 * assignee in one details card. Opened from a board's + button or from a
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
  const [assignToMe, setAssignToMe] = useState(true);
  const [columnName, setColumnName] = useState<string | undefined>(params.column);
  const [typeId, setTypeId] = useState<string | undefined>();
  const [priorityId, setPriorityId] = useState<string | undefined>();
  // undefined: the sprint the board was showing (or its active one); null: the backlog.
  const [sprintChoice, setSprintChoice] = useState<number | null | undefined>(
    params.sprint === 'backlog' ? null : params.sprint ? Number(params.sprint) : undefined
  );
  const [picker, setPicker] = useState<Picker>(null);
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
      const created = await createJiraIssue(credentials, {
        board,
        summary,
        description,
        labels,
        duedate,
        assignToMe,
        issueTypeId: type?.id,
        priorityId,
        column,
        firstColumn: columns[0],
        sprintId: sprint?.id,
      });
      haptics.success();
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
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={IOS}
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
            icon="account-check-outline"
            label="Assign to me"
            value={credentials.account.displayName}
            trailing={<Switch value={assignToMe} onValueChange={setAssignToMe} />}
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
      </ScrollView>

      <PickerSheet
        visible={picker === 'board'}
        title="Board"
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
              setPicker(null);
            },
          };
        })}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'sprint'}
        title="Sprint"
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
      <NativeAlert
        visible={error != null}
        title="Could not create"
        message={error ?? ''}
        onDismiss={() => setError(null)}
      />
    </SheetSurface>
  );
}

function Icon({ url, headers }: { url: string; headers?: Record<string, string> }) {
  return (
    <Image
      source={{ uri: url, headers }}
      style={{ width: 20, height: 20, borderRadius: 4 }}
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
