import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import type { GitHubIssue } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { LiveMarkdownInput } from '@/components/tasks/live-markdown-input';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { TaskCheckbox } from '@/components/tasks/task-checkbox';
import { Button } from '@/components/ui/button';
import { LoadingSpinner, LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { useGitHubIssue, useToggleGitHubIssue, useUpdateGitHubIssue } from '@/hooks/use-github';
import { formatDateTime } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { SPRING } from '@/lib/motion';
import { useTabBarFabOffset } from '@/lib/tab-bar';
import { ScrollView, Text, TextInput, View } from '@/tw';

/** Left edge shared by title, body and labels (checkbox slot). */
const TEXT_INSET = 34;

export default function GitHubIssueDetailScreen() {
  const { colors } = useTheme();
  const { repo, number: numberParam } = useLocalSearchParams<{
    id?: string;
    repo?: string;
    number?: string;
  }>();
  const issueNumber = numberParam ? Number(numberParam) : undefined;
  const issueQuery = useGitHubIssue(repo, issueNumber);
  const issue = issueQuery.data;

  if (issueQuery.isLoading && !issue) {
    return <LoadingState message="Loading issue…" fullScreen />;
  }

  if (!issue) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 px-8"
        style={{ backgroundColor: colors.bg }}>
        <Stack.Screen options={{ title: '' }} />
        <MaterialCommunityIcons name="github" size={32} color={colors.text2} />
        <Text className="text-sf-text-2 text-center">
          {issueQuery.isError
            ? issueQuery.error instanceof Error
              ? issueQuery.error.message
              : 'Could not load issue.'
            : 'Issue not found.'}
        </Text>
        {issueQuery.isError ? (
          <Button variant="tonal" label="Retry" onPress={() => issueQuery.refetch()} />
        ) : null}
      </View>
    );
  }

  // Keyed so edits reset cleanly when a different issue is opened.
  return (
    <IssueDocument
      key={`${issue.repo}#${issue.number}`}
      issue={issue}
      refreshing={issueQuery.isFetching && !issueQuery.isLoading}
      onRefresh={() => issueQuery.refetch()}
    />
  );
}

/**
 * A GitHub issue laid out like a to-do: checkbox and title, the body as live
 * Markdown, labels, then quiet details. Title and body save to GitHub when
 * you leave the field, if the token can write to the repository.
 */
function IssueDocument({
  issue,
  refreshing,
  onRefresh,
}: {
  issue: GitHubIssue;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { colors } = useTheme();
  const toggleIssue = useToggleGitHubIssue();
  const updateIssue = useUpdateGitHubIssue();
  const bottom = useTabBarFabOffset();
  const editable = !issue.readOnly && issue.canWrite;
  const [title, setTitle] = useState(issue.title);
  const [body, setBody] = useState(issue.body);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const repoName = issue.repo.split('/')[1] ?? issue.repo;

  async function save(patch: { title?: string; body?: string }) {
    try {
      await updateIssue.mutateAsync({ repo: issue.repo, issueNumber: issue.number, patch });
    } catch (error) {
      setAlert({
        title: 'Could not save to GitHub',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }

  async function toggle() {
    if (issue.readOnly) return;
    try {
      await toggleIssue.mutateAsync(issue);
      haptics.success();
    } catch (error) {
      setAlert({
        title: 'Could not update issue',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }

  async function openOnGitHub() {
    if (!issue.html_url?.startsWith('https://github.com/')) return;
    haptics.tap();
    await Linking.openURL(issue.html_url);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerTitleAlign: 'left',
          contentStyle: { backgroundColor: colors.bg },
          headerTitle: () => (
            <View
              accessible
              accessibilityLabel={`Issue ${issue.number} in ${issue.repo}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="github" size={16} color={colors.text2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text2 }}>
                {repoName} #{issue.number}
              </Text>
            </View>
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Title */}
        <View className="flex-row items-start">
          <View style={{ marginLeft: -10, marginTop: 2 }}>
            {issue.readOnly ? (
              <View
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="github" size={22} color={colors.text3} />
              </View>
            ) : (
              <TaskCheckbox
                checked={issue.completed}
                size={26}
                onToggle={toggle}
                label={issue.completed ? 'Reopen issue' : 'Close issue'}
              />
            )}
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={() => {
              const next = title.trim();
              if (next && next !== issue.title) void save({ title: next });
            }}
            editable={editable}
            multiline
            submitBehavior="blurAndSubmit"
            accessibilityLabel="Issue title"
            className="text-sf-text flex-1"
            style={{
              fontSize: 28,
              lineHeight: 34,
              fontWeight: '700',
              letterSpacing: -0.4,
              paddingVertical: 6,
              paddingHorizontal: 0,
              textDecorationLine: issue.completed ? 'line-through' : 'none',
            }}
          />
        </View>

        {/* Body */}
        <View style={{ marginLeft: TEXT_INSET, marginTop: 4 }}>
          {editable ? (
            <LiveMarkdownInput
              value={body}
              onChangeText={setBody}
              onBlur={() => {
                if (body !== issue.body) void save({ body });
              }}
              placeholder="Add a description"
              placeholderTextColor={colors.text3}
              accessibilityLabel="Issue description"
              style={{ minHeight: 40 }}
            />
          ) : issue.body.trim() ? (
            <MarkdownViewer markdown={issue.body} />
          ) : (
            <Text style={{ fontSize: 17, color: colors.text3 }}>No description.</Text>
          )}
        </View>

        {/* Labels */}
        {issue.labels.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginLeft: TEXT_INSET,
              marginTop: 16,
            }}>
            {issue.labels.map((label) => (
              <View
                key={label.id}
                className="flex-row items-center"
                style={{
                  gap: 6,
                  height: 32,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  backgroundColor: colors.selectionBg,
                }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: `#${label.color || '888888'}`,
                  }}
                />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSelectionBg }}>
                  {label.name}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Details */}
        <Text
          style={{
            marginTop: 28,
            paddingBottom: 6,
            fontSize: 17,
            fontWeight: '700',
            color: colors.accent,
          }}>
          Details
        </Text>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 4,
            borderRadius: 24,
            borderCurve: 'continuous',
            backgroundColor: colors.bg2,
          }}>
          <DetailRow
            icon={issue.completed ? 'check-circle-outline' : 'record-circle-outline'}
            iconColor={issue.completed ? colors.purple : colors.green}
            label="Status"
            value={issue.completed ? 'Closed' : 'Open'}
          />
          <DetailRow icon="source-repository" label="Repository" value={issue.repo} />
          <DetailRow
            icon="account-multiple-outline"
            label="Assignees"
            value={
              issue.assignees.length > 0
                ? issue.assignees.map((a) => `@${a.login}`).join(', ')
                : 'No one'
            }
            avatars={issue.assignees.map((a) => a.avatar_url)}
          />
          <DetailRow icon="calendar-plus" label="Opened" value={formatDateTime(issue.created_at)} />
          <DetailRow icon="update" label="Updated" value={formatDateTime(issue.updated_at)} />
        </View>
        {!editable ? (
          <Text style={{ fontSize: 13, color: colors.text3, marginTop: 10, paddingHorizontal: 4 }}>
            Your token can only read this repository, so the issue can&apos;t be edited here.
          </Text>
        ) : null}
      </ScrollView>

      {/* Floating actions, matching the to-do toolbar */}
      <Animated.View
        entering={SlideInDown.springify()
          .damping(SPRING.spatial.damping)
          .stiffness(SPRING.spatial.stiffness)}
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }}>
        <View
          className="flex-row items-center"
          style={{
            backgroundColor: colors.primaryContainer,
            borderRadius: 32,
            height: 64,
            paddingHorizontal: 8,
            gap: 4,
            boxShadow: '0 4px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.3)',
          }}>
          {!issue.readOnly ? (
            <Pressable
              onPress={toggle}
              disabled={toggleIssue.isPending}
              accessibilityRole="button"
              accessibilityLabel={issue.completed ? 'Reopen issue' : 'Close issue'}
              android_ripple={{ color: colors.separator }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                height: 48,
                paddingLeft: 16,
                paddingRight: 20,
                borderRadius: pressed ? 12 : 24,
                overflow: 'hidden',
                backgroundColor: colors.accent,
              })}>
              {toggleIssue.isPending ? (
                <LoadingSpinner size={22} />
              ) : (
                <MaterialCommunityIcons
                  name={issue.completed ? 'restore' : 'check'}
                  size={22}
                  color={colors.onAccent}
                />
              )}
              <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>
                {issue.completed ? 'Reopen' : 'Close issue'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={openOnGitHub}
            accessibilityRole="link"
            accessibilityLabel="Open on GitHub"
            android_ripple={{ color: colors.separator, borderless: true, radius: 24 }}
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: pressed ? 12 : 24,
              opacity: pressed && Platform.OS === 'ios' ? 0.6 : 1,
            })}>
            <MaterialCommunityIcons
              name="open-in-new"
              size={22}
              color={colors.onPrimaryContainer}
            />
          </Pressable>
        </View>
      </Animated.View>

      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />
    </>
  );
}

function DetailRow({
  icon,
  iconColor,
  label,
  value,
  avatars,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor?: string;
  label: string;
  value: string;
  avatars?: string[];
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center" style={{ gap: 12, minHeight: 56 }}>
      <MaterialCommunityIcons name={icon} size={20} color={iconColor ?? colors.accent} />
      <Text className="text-sf-text text-base">{label}</Text>
      <View className="flex-1 flex-row items-center justify-end" style={{ gap: 6 }}>
        {avatars?.slice(0, 3).map((uri) => (
          <Image key={uri} source={{ uri }} style={{ width: 22, height: 22, borderRadius: 11 }} />
        ))}
        <Text
          numberOfLines={1}
          style={{ color: colors.text2, fontSize: 15, flexShrink: 1, textAlign: 'right' }}>
          {value}
        </Text>
      </View>
    </View>
  );
}
