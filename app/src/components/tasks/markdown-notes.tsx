import { useState } from 'react';
import { Pressable, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { LiveMarkdownInput } from '@/components/tasks/live-markdown-input';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { useTheme } from '@/components/theme/context';
import { toggleTaskInMarkdown } from '@/lib/markdown';
import { View } from '@/tw';

/**
 * Task notes the way Things shows them: rendered Markdown while you read,
 * the live Markdown editor once you tap in. Links open and `- [ ]` boxes tick
 * straight from the rendered view, without entering edit mode.
 */
export function MarkdownNotes({
  value,
  onChangeText,
  placeholder = 'Notes',
  style,
  inputStyle,
  compact,
  onBlur,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  compact?: boolean;
  /** Runs when editing ends. */
  onBlur?: () => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);

  if (!editing && value.trim()) {
    return (
      <Pressable
        onPress={() => setEditing(true)}
        accessibilityRole="button"
        accessibilityLabel="Notes. Double tap to edit"
        style={[{ paddingVertical: 6 }, style]}>
        <MarkdownViewer
          markdown={value}
          compact={compact}
          onToggleTask={(index) => onChangeText(toggleTaskInMarkdown(value, index))}
        />
      </Pressable>
    );
  }

  return (
    <View style={style}>
      <LiveMarkdownInput
        value={value}
        onChangeText={onChangeText}
        autoFocus={editing}
        onBlur={() => {
          setEditing(false);
          onBlur?.();
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        accessibilityLabel="Notes"
        style={[{ minHeight: 32 }, inputStyle]}
      />
    </View>
  );
}
