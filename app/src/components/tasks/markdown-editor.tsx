import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
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
  /** Show Write/Preview toggle. Live preview still updates while writing. */
  showModeToggle?: boolean;
  compact?: boolean;
  className?: string;
  style?: TextInputProps['style'];
}

/**
 * Markdown editor with Notion-style live preview:
 * typing in Write mode immediately renders formatted output below.
 */
export function MarkdownEditor({
  value,
  onChangeText,
  placeholder = 'Add details…',
  placeholderTextColor,
  minHeight = 96,
  showModeToggle = true,
  compact = false,
  className,
  style,
}: MarkdownEditorProps) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<EditorMode>('write');
  const previewValue = useDeferredValue(value);
  const hasContent = value.trim().length > 0;

  const handleChange = useCallback(
    (next: string) => {
      onChangeText(next);
    },
    [onChangeText]
  );

  const inputClassName = useMemo(
    () =>
      className ??
      `text-sf-text bg-sf-bg-2 rounded-xl px-3 py-3 text-base ${compact ? 'min-h-16' : 'min-h-24'}`,
    [className, compact]
  );

  return (
    <View className="gap-2">
      {showModeToggle ? (
        <View className="flex-row self-start rounded-lg p-0.5" style={{ backgroundColor: colors.bg2 }}>
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
            disabled={!hasContent}
          />
        </View>
      ) : null}

      {mode === 'write' ? (
        <View className="gap-0 overflow-hidden rounded-xl" style={{ borderCurve: 'continuous' }}>
          <TextInput
            value={value}
            onChangeText={handleChange}
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor ?? (colors.text2 as string)}
            multiline
            className={inputClassName}
            style={[{ borderCurve: 'continuous', textAlignVertical: 'top', minHeight }, style]}
          />

          {hasContent ? (
            <View
              className="border-sf-separator border-t px-3 py-2"
              style={{ backgroundColor: colors.bg2, borderCurve: 'continuous' }}>
              <View className="mb-1.5 flex-row items-center gap-1">
                <MaterialCommunityIcons name="eye-outline" size={12} color={colors.text3} />
                <Text className="text-sf-text-3 text-[10px] font-semibold uppercase tracking-wide">
                  Live preview
                </Text>
              </View>
              <MarkdownViewer markdown={previewValue} compact={compact} />
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={() => setMode('write')}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <View
            className="bg-sf-bg-2 rounded-xl px-3 py-3"
            style={{ borderCurve: 'continuous', minHeight }}>
            {hasContent ? (
              <MarkdownViewer markdown={previewValue} compact={compact} />
            ) : (
              <Text className="text-sf-text-2 text-base">{placeholder}</Text>
            )}
            <View className="mt-2 flex-row items-center gap-1">
              <MaterialCommunityIcons name="pencil-outline" size={12} color={colors.text3} />
              <Text className="text-sf-text-3 text-[10px] font-semibold uppercase tracking-wide">
                Tap to edit
              </Text>
            </View>
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
  disabled,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        backgroundColor: active ? colors.bg : 'transparent',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      })}>
      <MaterialCommunityIcons
        name={icon}
        size={13}
        color={active ? colors.text : colors.text2}
      />
      <Text className={`text-xs font-medium ${active ? 'text-sf-text' : 'text-sf-text-2'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
