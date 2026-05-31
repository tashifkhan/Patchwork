import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Linking, Pressable } from 'react-native';

import type { GitHubIssue } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { Text, View } from '@/tw';

interface GitHubIssueItemProps {
  issue: GitHubIssue;
  onToggle: (issue: GitHubIssue) => void;
}

function GitHubIssueItemComponent({ issue, onToggle }: GitHubIssueItemProps) {
  const { colors } = useTheme();

  return (
    <View className="flex-row items-start gap-3 py-2">
      <Pressable
        onPress={() => onToggle(issue)}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingTop: 1 })}>
        <MaterialCommunityIcons
          name={issue.completed ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={24}
          color={issue.completed ? colors.accent : colors.gray}
        />
      </Pressable>

      <Pressable
        onPress={() => Linking.openURL(issue.html_url)}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flex: 1 })}>
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              numberOfLines={2}
              className={`flex-1 text-base ${issue.completed ? 'text-sf-text-3 line-through' : 'text-sf-text'}`}>
              {issue.title}
            </Text>
            <Text className="text-sf-text-3 text-xs">
              #{issue.number}
            </Text>
          </View>

          <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
            <Chip
              icon="github"
              label={issue.repo}
              color={colors.text2}
              bg={colors.bg2}
            />
            {issue.labels.map((label) => (
              <LabelChip key={label.id} name={label.name} color={label.color} />
            ))}
          </View>
        </View>
      </Pressable>

      <Pressable
        onPress={() => Linking.openURL(issue.html_url)}
        hitSlop={8}
        accessibilityLabel="Open on GitHub"
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingTop: 1 })}>
        <MaterialCommunityIcons name="open-in-new" size={18} color={colors.text2} />
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
      className="flex-row items-center gap-1 rounded-md px-2 py-1"
      style={{ backgroundColor: bg, borderCurve: 'continuous' }}>
      <MaterialCommunityIcons name={icon} size={13} color={color} />
      <Text className="text-sf-text-2 text-xs">{label}</Text>
    </View>
  );
}

function LabelChip({ name, color }: { name: string; color: string }) {
  const hex = color.startsWith('#') ? color : `#${color}`;
  // Compute luminance to choose text color
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const textColor = luminance > 0.5 ? '#24292f' : '#ffffff';

  return (
    <View
      className="flex-row items-center rounded-md px-2 py-1"
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
      <Text style={{ color: textColor, fontSize: 11 }}>{name}</Text>
    </View>
  );
}

export const GitHubIssueItem = memo(GitHubIssueItemComponent);
