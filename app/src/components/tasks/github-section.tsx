import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import type { GitHubIssue } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { GitHubIssueItem } from '@/components/tasks/github-issue-item';
import { Section } from '@/components/tasks/task-section';
import { LoadingSpinner } from '@/components/ui/loading';
import type { GitHubConnectionState, GitHubSourceWarning } from '@/features/github/types';
import { Text, View } from '@/tw';

/**
 * GitHub issues inside the Tasks list. On All Tasks it is one quiet "GitHub"
 * section; inside a repo list it becomes the page's own Open / Closed
 * sections. Problems (reconnect, failed fetch) collapse to a single line with
 * one action instead of stacked warning cards.
 */
export function GitHubSection({
  issues,
  repoMode,
  loading,
  error,
  warnings,
  connection,
  collapsed,
  dimmed,
  onToggleSection,
  onToggleIssue,
  onRetry,
}: {
  issues: GitHubIssue[];
  repoMode: boolean;
  loading: boolean;
  error: unknown;
  warnings: GitHubSourceWarning[];
  connection: GitHubConnectionState;
  collapsed: Record<string, boolean>;
  dimmed: boolean;
  onToggleSection: (key: string) => void;
  onToggleIssue: (issue: GitHubIssue) => void;
  onRetry: () => void;
}) {
  const open = issues.filter((issue) => !issue.completed);
  const closed = issues.filter((issue) => issue.completed);

  if (connection.status === 'expired' || connection.status === 'disconnected') {
    return (
      <Notice
        icon="github"
        text={
          connection.status === 'expired'
            ? 'GitHub needs a new token.'
            : 'Connect GitHub to see issues here.'
        }
        action="Open settings"
        onPress={() => router.push('/settings/github')}
      />
    );
  }

  if (loading) {
    return (
      <View className="flex-row items-center gap-3" style={{ paddingTop: 24, minHeight: 48 }}>
        <LoadingSpinner size={24} />
        <LoadingText />
      </View>
    );
  }

  if (error) {
    return (
      <Notice
        icon="cloud-alert-outline"
        text={error instanceof Error ? error.message : 'Could not load GitHub issues.'}
        action="Retry"
        onPress={onRetry}
      />
    );
  }

  const warning =
    warnings.length > 0
      ? `${warnings.length === 1 ? warnings[0].repository : `${warnings.length} repositories`} could not be loaded.`
      : null;

  return (
    <View>
      {open.length > 0 || !repoMode ? (
        <Section
          title={repoMode ? 'Open' : 'GitHub'}
          icon={repoMode ? undefined : 'github'}
          count={open.length}
          collapsed={!!collapsed.github_open}
          onToggle={() => onToggleSection('github_open')}>
          {open.length === 0 ? <EmptyLine /> : null}
          {open.map((issue) => (
            <GitHubIssueItem
              key={issue.id}
              issue={issue}
              onToggle={onToggleIssue}
              showRepo={!repoMode}
              dimmed={dimmed}
            />
          ))}
        </Section>
      ) : null}
      {closed.length > 0 ? (
        <Section
          title={repoMode ? 'Closed' : 'Closed issues'}
          count={closed.length}
          collapsed={collapsed.github_closed !== false}
          onToggle={() => onToggleSection('github_closed')}>
          {closed.map((issue) => (
            <GitHubIssueItem
              key={issue.id}
              issue={issue}
              onToggle={onToggleIssue}
              showRepo={!repoMode}
              dimmed={dimmed}
            />
          ))}
        </Section>
      ) : null}
      {repoMode && open.length === 0 && closed.length === 0 ? (
        <View style={{ paddingTop: 48, alignItems: 'center', gap: 6 }}>
          <EmptyLine centered />
        </View>
      ) : null}
      {warning ? (
        <Notice
          icon="alert-circle-outline"
          text={warning}
          action="Check settings"
          onPress={() => router.push('/settings/github')}
        />
      ) : null}
    </View>
  );
}

function LoadingText() {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 15, color: colors.text2 }}>Loading GitHub issues…</Text>;
}

function EmptyLine({ centered }: { centered?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: 15,
        color: colors.text3,
        paddingVertical: 10,
        textAlign: centered ? 'center' : 'left',
      }}>
      No open issues match your GitHub filter.
    </Text>
  );
}

/** One-line status with a single text action, in place of warning cards. */
function Notice({
  icon,
  text,
  action,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  text: string;
  action: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-3" style={{ paddingTop: 24, minHeight: 48 }}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.text2} />
      <Text numberOfLines={2} style={{ flex: 1, fontSize: 14, color: colors.text2 }}>
        {text}
      </Text>
      <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>{action}</Text>
      </Pressable>
    </View>
  );
}
