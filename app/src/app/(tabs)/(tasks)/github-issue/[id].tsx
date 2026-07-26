import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl } from 'react-native';
import { Image } from 'expo-image';

import type { GitHubIssue } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { useGitHubIssue, useToggleGitHubIssue } from '@/hooks/use-github';
import { formatDateTime } from '@/lib/format';
import { ScrollView, Text, View } from '@/tw';

export default function GitHubIssueDetailScreen() {
  const { colors } = useTheme();
  const { repo, number: numberParam } = useLocalSearchParams<{
    id?: string;
    repo?: string;
    number?: string;
  }>();
  const issueNumber = numberParam ? Number(numberParam) : undefined;
  const issueQuery = useGitHubIssue(repo, issueNumber);
  const toggleIssue = useToggleGitHubIssue();
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const issue = issueQuery.data;

  async function handleToggle() {
    if (!issue || issue.readOnly) return;
    try {
      await toggleIssue.mutateAsync(issue);
    } catch (error) {
      setAlert({
        title: 'Could not update issue',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }

  async function openOnGitHub() {
    if (!issue?.html_url?.startsWith('https://github.com/')) return;
    if (await Linking.canOpenURL(issue.html_url)) {
      await Linking.openURL(issue.html_url);
    }
  }

  if (issueQuery.isLoading && !issue) {
    return <LoadingState message="Loading issue…" subtitle="Fetching from GitHub" />;
  }

  if (!issue) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8" style={{ backgroundColor: colors.bg }}>
        <MaterialCommunityIcons name="github" size={32} color={colors.text2} />
        <Text className="text-sf-text-2 text-center">
          {issueQuery.isError
            ? issueQuery.error instanceof Error
              ? issueQuery.error.message
              : 'Could not load issue.'
            : 'Issue not found. Check the repository and issue number.'}
        </Text>
        {issueQuery.isError ? (
          <Button variant="tonal" label="Retry" onPress={() => issueQuery.refetch()} />
        ) : null}
        <Button variant="text" label="Go back" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 48, backgroundColor: colors.bg }}
      refreshControl={
        <RefreshControl refreshing={issueQuery.isFetching && !issueQuery.isLoading} onRefresh={() => issueQuery.refetch()} />
      }>
      <Stack.Screen
        options={{
          title: `${issue.repo} #${issue.number}`,
          headerLargeTitle: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />

      <View className="gap-4 px-4 py-4">
        {/* Status + title */}
        <View className="gap-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <StateBadge issue={issue} />
            {issue.readOnly ? (
              <View
                className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
                style={{ backgroundColor: colors.bg2 }}>
                <MaterialCommunityIcons name="eye-outline" size={14} color={colors.text2} />
                <Text className="text-sf-text-2 text-xs">Read-only</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-sf-text text-2xl font-bold">{issue.title}</Text>
          <Text className="text-sf-text-2 text-sm">
            {issue.repo} · #{issue.number}
            {issue.updated_at ? ` · updated ${formatDateTime(issue.updated_at)}` : ''}
          </Text>
        </View>

        {/* Labels */}
        {issue.labels.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {issue.labels.map((label) => {
              const hex = label.color.startsWith('#') ? label.color : `#${label.color}`;
              return (
                <View
                  key={label.id}
                  className="flex-row items-center rounded-full px-3 py-1.5"
                  style={{ backgroundColor: `${hex}33`, borderCurve: 'continuous' }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: hex,
                      marginRight: 6,
                    }}
                  />
                  <Text className="text-sf-text text-xs font-medium">{label.name}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Assignees */}
        {issue.assignees.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Assignees</Text>
            <View
              className="flex-row flex-wrap gap-2 rounded-2xl px-3 py-3"
              style={{ backgroundColor: colors.bg2, borderCurve: 'continuous' }}>
              {issue.assignees.map((a) => (
                <View key={a.login} className="flex-row items-center gap-2">
                  <Image
                    source={{ uri: a.avatar_url }}
                    style={{ width: 28, height: 28, borderRadius: 14 }}
                    contentFit="cover"
                  />
                  <Text className="text-sf-text text-sm">@{a.login}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Body */}
        <View className="gap-2">
          <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Description</Text>
          <View
            className="rounded-2xl px-3 py-3"
            style={{ backgroundColor: colors.bg2, borderCurve: 'continuous' }}>
            {issue.body?.trim() ? (
              <MarkdownViewer markdown={issue.body} />
            ) : (
              <Text className="text-sf-text-3 text-sm italic">No description provided.</Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View className="gap-3 pt-2">
          {!issue.readOnly ? (
            <Button
              variant={issue.completed ? 'tonal' : 'filled'}
              label={
                toggleIssue.isPending
                  ? 'Updating…'
                  : issue.completed
                    ? 'Reopen issue'
                    : 'Close issue'
              }
              icon={issue.completed ? 'reload' : 'check-circle-outline'}
              loading={toggleIssue.isPending}
              onPress={handleToggle}
            />
          ) : null}
          <Button
            variant="outlined"
            label="Open on GitHub"
            icon="open-in-new"
            onPress={openOnGitHub}
          />
        </View>
      </View>

      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />
    </ScrollView>
  );
}

function StateBadge({ issue }: { issue: GitHubIssue }) {
  const { colors } = useTheme();
  const open = !issue.completed;
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{
        backgroundColor: open ? `${colors.green}28` : `${colors.text2}28`,
        borderCurve: 'continuous',
      }}>
      <MaterialCommunityIcons
        name={open ? 'alert-circle-outline' : 'check-circle-outline'}
        size={16}
        color={open ? colors.green : colors.text2}
      />
      <Text
        className="text-xs font-semibold uppercase"
        style={{ color: open ? colors.green : colors.text2 }}>
        {open ? 'Open' : 'Closed'}
      </Text>
    </View>
  );
}
