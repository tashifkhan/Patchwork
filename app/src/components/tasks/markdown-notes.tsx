import { useState } from 'react';
import { Pressable, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { LiveMarkdownInput } from '@/components/tasks/live-markdown-input';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { useTheme } from '@/components/theme/context';
import { toggleTaskInMarkdown } from '@/lib/markdown';
import { textStats } from '@/lib/task-actions';
import { Text, View } from '@/tw';

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
      {editing && value.trim() ? <TextStats text={value} color={colors.text3} /> : null}
    </View>
  );
}

/** Karui's note menu count: words and characters, shown while editing. */
export function TextStats({ text, color }: { text: string; color: string }) {
  const { words, characters } = textStats(text);
  return (
    <Text
      accessibilityLabel={`${words} words, ${characters} characters`}
      style={{ fontSize: 12, color, marginTop: 2, fontVariant: ['tabular-nums'] }}>
      {words} {words === 1 ? 'word' : 'words'} · {characters} {characters === 1 ? 'character' : 'characters'}
    </Text>
  );
}
