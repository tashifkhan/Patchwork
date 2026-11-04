import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { Platform, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { GitHubIssue } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { TaskCheckbox } from '@/components/tasks/task-checkbox';
import { MIN_TOUCH_TARGET } from '@/components/ui/touchable-row';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { Text, View } from '@/tw';

interface GitHubIssueItemProps {
  issue: GitHubIssue;
  onToggle: (issue: GitHubIssue) => void;
  /** Show the repository on the meta line (off when viewing a single repo). */
  showRepo?: boolean;
  dimmed?: boolean;
}

/**
 * A GitHub issue as a to-do row, matching `TaskItem`: the checkbox closes or
 * reopens the issue, labels show as a tag glyph, and the meta line carries
 * the issue number (and repository when mixed with other lists).
 */
function GitHubIssueItemComponent({ issue, onToggle, showRepo = true, dimmed }: GitHubIssueItemProps) {
  const { colors } = useTheme();
  const canToggle = !issue.readOnly;
  const repoName = issue.repo.split('/')[1] ?? issue.repo;

  function openDetail() {
    haptics.tap();
    router.push({
      pathname: '/github-issue/[id]',
      params: { id: String(issue.id), repo: issue.repo, number: String(issue.number) },
    });
  }

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.medium1).easing(EASING.emphasizedDecelerate)}
      exiting={FadeOut.duration(DURATION.short4).easing(EASING.emphasizedAccelerate)}
      layout={LinearTransition.duration(DURATION.medium2).easing(EASING.emphasized)}>
      <View
        className="flex-row items-center"
        style={{ minHeight: 48, opacity: dimmed ? 0.38 : 1 }}>
        <View style={{ marginLeft: -11 }}>
          {canToggle ? (
            <TaskCheckbox
              checked={issue.completed}
              onToggle={() => onToggle(issue)}
              label={`${issue.completed ? 'Reopen' : 'Close'} issue: ${issue.title}`}
            />
          ) : (
            <View
              accessible
              accessibilityLabel="Read-only issue"
              style={{
                width: MIN_TOUCH_TARGET,
                height: MIN_TOUCH_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <MaterialCommunityIcons name="github" size={20} color={colors.text3} />
            </View>
          )}
        </View>

        <Pressable
          onPress={openDetail}
          accessibilityRole="button"
          accessibilityLabel={`${issue.title}, issue ${issue.number} in ${issue.repo}`}
          android_ripple={{ color: colors.separator }}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            paddingVertical: 7,
            paddingRight: 4,
            opacity: pressed && Platform.OS === 'ios' ? 0.6 : 1,
          })}>
          <View className="flex-row items-center gap-1.5">
            <Text
              numberOfLines={2}
              style={{
                flexShrink: 1,
                fontSize: 17,
                color: issue.completed ? colors.text3 : colors.text,
                textDecorationLine: issue.completed ? 'line-through' : 'none',
              }}>
              {issue.title}
            </Text>
            {issue.body.trim() ? (
              <MaterialCommunityIcons name="file-document-outline" size={15} color={colors.text3} />
            ) : null}
            {issue.labels.length > 0 ? (
              <MaterialCommunityIcons name="tag-outline" size={15} color={colors.text3} />
            ) : null}
          </View>
          <View className="flex-row items-center gap-1.5" style={{ marginTop: 2 }}>
            <MaterialCommunityIcons
              name={issue.completed ? 'check-circle-outline' : 'record-circle-outline'}
              size={13}
              color={issue.completed ? colors.purple : colors.green}
            />
            <Text style={{ fontSize: 13, color: colors.text2 }}>#{issue.number}</Text>
            {showRepo ? (
              <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text3, flexShrink: 1 }}>
                {repoName}
              </Text>
            ) : null}
            {issue.assignees.length > 0 ? (
              <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text3, flexShrink: 1 }}>
                @{issue.assignees[0].login}
                {issue.assignees.length > 1 ? ` +${issue.assignees.length - 1}` : ''}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export const GitHubIssueItem = memo(GitHubIssueItemComponent);
