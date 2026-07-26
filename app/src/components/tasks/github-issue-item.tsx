import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable } from 'react-native';

import type { GitHubIssue } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { MIN_TOUCH_TARGET } from '@/components/ui/touchable-row';
import { Text, View } from '@/tw';

interface GitHubIssueItemProps {
  issue: GitHubIssue;
  onToggle: (issue: GitHubIssue) => void;
}

function GitHubIssueItemComponent({ issue, onToggle }: GitHubIssueItemProps) {
  const { colors } = useTheme();
  const canToggle = !issue.readOnly;

  function openDetail() {
    router.push({
      pathname: '/github-issue/[id]',
      params: {
        id: String(issue.id),
        repo: issue.repo,
        number: String(issue.number),
      },
    });
  }

  return (
    <View className="flex-row items-center gap-2" style={{ minHeight: MIN_TOUCH_TARGET }}>
      <Pressable
        onPress={canToggle ? () => onToggle(issue) : undefined}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: issue.completed, disabled: !canToggle }}
        accessibilityLabel={
          issue.readOnly
            ? 'Read-only public issue'
            : issue.completed
              ? 'Reopen issue'
              : 'Close issue'
        }
        style={({ pressed }) => ({
          opacity: pressed && canToggle ? 0.5 : 1,
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          alignItems: 'center',
          justifyContent: 'center',
        })}>
        <MaterialCommunityIcons
          name={
            issue.readOnly
              ? 'github'
              : issue.completed
                ? 'checkbox-marked-circle'
                : 'checkbox-blank-circle-outline'
          }
          size={26}
          color={issue.completed ? colors.accent : colors.gray}
        />
      </Pressable>

      <Pressable
        onPress={openDetail}
        accessibilityRole="button"
        accessibilityLabel={`${issue.title}, issue ${issue.number}`}
        android_ripple={{ color: colors.separator }}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : 1,
          flex: 1,
          minHeight: MIN_TOUCH_TARGET,
          justifyContent: 'center',
          paddingVertical: 10,
        })}>
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              numberOfLines={2}
              className={`flex-1 text-base ${issue.completed ? 'text-sf-text-3 line-through' : 'text-sf-text'}`}
              style={{ fontWeight: issue.completed ? '400' : '500' }}>
              {issue.title}
            </Text>
            <Text className="text-sf-text-3 text-xs">#{issue.number}</Text>
          </View>

          <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
            <Chip icon="source-repository" label={issue.repo} color={colors.text2} bg={colors.bg2} />
            {issue.readOnly ? (
              <Chip icon="eye-outline" label="Read-only" color={colors.text2} bg={colors.bg2} />
            ) : null}
            {issue.assignees.slice(0, 3).map((assignee) => (
              <View
                key={assignee.login}
                className="flex-row items-center gap-1 rounded-full px-2 py-1"
                style={{ backgroundColor: colors.bg2, borderCurve: 'continuous' }}>
                <Image
                  source={{ uri: assignee.avatar_url }}
                  style={{ width: 14, height: 14, borderRadius: 7 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <Text className="text-sf-text-2 text-xs">@{assignee.login}</Text>
              </View>
            ))}
            {issue.labels.map((label) => (
              <LabelChip key={label.id} name={label.name} color={label.color} />
            ))}
          </View>
        </View>
      </Pressable>

      <Pressable
        onPress={openDetail}
        hitSlop={8}
        accessibilityLabel="Open issue details"
        accessibilityRole="button"
        style={({ pressed }) => ({
          opacity: pressed ? 0.5 : 1,
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          alignItems: 'center',
          justifyContent: 'center',
        })}>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.text2} />
      </Pressable>
    </View>
  );
}

function Chip({
  icon,
  label,
  color,
  bg,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
      style={{ backgroundColor: bg, borderCurve: 'continuous' }}>
      <MaterialCommunityIcons name={icon} size={13} color={color} />
      <Text className="text-sf-text-2 text-xs">{label}</Text>
    </View>
  );
}

function LabelChip({ name, color }: { name: string; color: string }) {
  const { colors } = useTheme();
  const hex = color.startsWith('#') ? color : `#${color}`;

  return (
    <View
      className="flex-row items-center rounded-full px-2.5 py-1"
      style={{ backgroundColor: `${hex}30`, borderCurve: 'continuous' }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: hex,
          marginRight: 4,
        }}
      />
      <Text style={{ color: colors.text, fontSize: 11 }}>{name}</Text>
    </View>
  );
}

export const GitHubIssueItem = memo(GitHubIssueItemComponent);
