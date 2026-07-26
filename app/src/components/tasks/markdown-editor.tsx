import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useDeferredValue, useState } from 'react';
import { Pressable, type TextInputProps } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { Text, TextInput, View } from '@/tw';

type EditorMode = 'write' | 'preview';

interface MarkdownEditorProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  minHeight?: number;
  /** Show Write/Preview toggle. Default true. */
  showModeToggle?: boolean;
  compact?: boolean;
  className?: string;
  style?: TextInputProps['style'];
}

/**
 * Markdown editor modelled after Tasks.org:
 * - Write mode is a plain multiline field (no stacked live preview)
 * - Preview mode replaces the field with clean rendered markdown
 */
export function MarkdownEditor({
  value,
  onChangeText,
  placeholder = 'Add details…',
  placeholderTextColor,
  minHeight = 120,
  showModeToggle = true,
  compact = false,
  className,
  style,
}: MarkdownEditorProps) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<EditorMode>('write');
  const previewValue = useDeferredValue(value);
  const hasContent = value.trim().length > 0;
  const surfaceMinHeight = compact ? Math.max(minHeight, 64) : minHeight;

  const handleChange = useCallback(
    (next: string) => {
      onChangeText(next);
    },
    [onChangeText]
  );

  return (
    <View className="gap-2">
      {showModeToggle ? (
        <View
          className="flex-row self-start overflow-hidden rounded-full p-0.5"
          style={{ backgroundColor: colors.bg2, borderCurve: 'continuous' }}>
          <ModeTab
            label="Write"
            icon="pencil-outline"
            active={mode === 'write'}
            onPress={() => setMode('write')}
          />
          <ModeTab
            label="Preview"
            icon="eye-outline"
            active={mode === 'preview'}
            onPress={() => setMode('preview')}
          />
        </View>
      ) : null}

      {mode === 'write' ? (
        <TextInput
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor ?? (colors.text2 as string)}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Notes"
          className={
            className ??
            `text-sf-text bg-sf-bg-2 rounded-xl px-3.5 py-3 text-base ${compact ? 'min-h-16' : 'min-h-28'}`
          }
          style={[
            {
              borderCurve: 'continuous',
              minHeight: surfaceMinHeight,
              lineHeight: compact ? 20 : 22,
            },
            style,
          ]}
        />
      ) : (
        <Pressable
          onPress={() => setMode('write')}
          accessibilityRole="button"
          accessibilityLabel="Edit notes"
          accessibilityHint="Switches back to the markdown editor"
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
          <View
            className="bg-sf-bg-2 rounded-xl px-3.5 py-3"
            style={{ borderCurve: 'continuous', minHeight: surfaceMinHeight }}>
            {hasContent ? (
              <MarkdownViewer markdown={previewValue} compact={compact} />
            ) : (
              <Text className="text-sf-text-2 text-base" style={{ lineHeight: compact ? 20 : 22 }}>
                {placeholder}
              </Text>
            )}
          </View>
        </Pressable>
      )}
    </View>
  );
}

function ModeTab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.75 : 1,
        backgroundColor: active ? colors.selectionBg : 'transparent',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderCurve: 'continuous',
      })}>
      <MaterialCommunityIcons
        name={icon}
        size={14}
        color={active ? colors.onSelectionBg : colors.text2}
      />
      <Text
        className="text-xs font-semibold"
        style={{ color: active ? colors.onSelectionBg : colors.text2 }}>
        {label}
      </Text>
    </Pressable>
  );
}
