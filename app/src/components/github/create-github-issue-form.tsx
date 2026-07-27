import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import type { GitHubIssueCreate, GitHubRepo } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { MarkdownEditor } from '@/components/tasks/markdown-editor';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Text, TextInput, View } from '@/tw';

import { RepositoryPicker } from './repository-picker';

export interface CreateGitHubIssueValues {
  repository: GitHubRepo;
  issue: GitHubIssueCreate;
}

export function CreateGitHubIssueForm({
  repositories,
  viewerLogin,
  defaultAssignToViewer,
  initialTitle = '',
  initialBody = '',
  submitting,
  onDraftChange,
  onSubmit,
}: {
  repositories: GitHubRepo[];
  viewerLogin: string;
  defaultAssignToViewer: boolean;
  initialTitle?: string;
  initialBody?: string;
  submitting: boolean;
  /** Reports title/body as they are typed, so a screen can hand them off elsewhere. */
  onDraftChange?: (draft: { title: string; body: string }) => void;
  onSubmit: (values: CreateGitHubIssueValues) => void;
}) {
  const { colors } = useTheme();
  const [repositoryName, setRepositoryName] = useState(
    repositories[0]?.full_name ?? ''
  );
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [assignToViewer, setAssignToViewer] = useState(defaultAssignToViewer);

  const repository = useMemo(
    () =>
      repositories.find((candidate) => candidate.full_name === repositoryName) ??
      repositories[0],
    [repositories, repositoryName]
  );
  const canSubmit = Boolean(repository && title.trim() && !submitting);

  function changeTitle(value: string) {
    setTitle(value);
    onDraftChange?.({ title: value, body });
  }

  function changeBody(value: string) {
    setBody(value);
    onDraftChange?.({ title, body: value });
  }

  function changeRepository(name: string) {
    setRepositoryName(name);
    // The assignee toggle is only offered on repos we can write to; reset it so
    // a stale "on" doesn't carry across a switch to a read-only repo and back.
    const next = repositories.find((candidate) => candidate.full_name === name);
    setAssignToViewer(defaultAssignToViewer && next?.canWriteIssues === true);
  }

  function submit() {
    if (!repository || !canSubmit) return;
    onSubmit({
      repository,
      issue: {
        title: title.trim(),
        body: body.trim(),
        assignees:
          assignToViewer && repository.canWriteIssues
            ? [viewerLogin]
            : undefined,
      },
    });
  }

  return (
    <View className="gap-4 px-5 py-3">
      <Field label="Repository" icon="source-repository">
        <RepositoryPicker
          repositories={repositories}
          value={repository?.full_name ?? ''}
          onChange={changeRepository}
        />
      </Field>

      <FieldCard>
        <Text
          className="text-sf-text-2"
          style={{
            fontSize: 12,
            fontWeight: '600',
            letterSpacing: 0.2,
            marginBottom: 6,
          }}>
          TITLE
        </Text>
        <TextInput
          value={title}
          onChangeText={changeTitle}
          placeholder="What needs attention?"
          placeholderTextColor={colors.text2}
          accessibilityLabel="GitHub issue title"
          returnKeyType="next"
          className="text-sf-text text-base"
          style={{
            minHeight: 44,
            paddingVertical: 4,
            fontSize: 17,
            fontWeight: '500',
          }}
        />
      </FieldCard>

      <Field label="Description" icon="text-long">
        <MarkdownEditor
          value={body}
          onChangeText={changeBody}
          placeholder="Add context, steps to reproduce, or acceptance criteria…"
          placeholderTextColor={colors.text2}
          minHeight={150}
        />
      </Field>

      {repository?.canWriteIssues ? (
        <FieldCard>
          <View className="flex-row items-center justify-between gap-3">
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: assignToViewer }}
              onPress={() => setAssignToViewer((assigned) => !assigned)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                flex: 1,
              })}>
              <View className="flex-1 flex-row items-center gap-3">
                <MaterialCommunityIcons
                  name="account-check-outline"
                  size={22}
                  color={colors.accent}
                />
                <View className="flex-1 gap-0.5">
                  <Text className="text-sf-text text-base font-medium">Assign to me</Text>
                  <Text selectable className="text-sf-text-2 text-xs">
                    Add @{viewerLogin} as an assignee
                  </Text>
                </View>
              </View>
            </Pressable>
            <Switch
              value={assignToViewer}
              onValueChange={setAssignToViewer}
            />
          </View>
        </FieldCard>
      ) : null}

      <View style={{ paddingTop: 8 }}>
        <Button
          label={submitting ? 'Creating…' : 'Create issue'}
          icon="github"
          loading={submitting}
          disabled={!canSubmit}
          onPress={submit}
        />
      </View>
    </View>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1.5 px-1">
        <MaterialCommunityIcons name={icon} size={14} color={colors.accent} />
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.accent,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}>
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function FieldCard({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.bg3,
        borderRadius: 20,
        borderCurve: 'continuous',
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}>
      {children}
    </View>
  );
}
