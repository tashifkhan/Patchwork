import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable } from 'react-native';

import { MarkdownNotes } from '@/components/tasks/markdown-notes';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { useTheme } from '@/components/theme/context';
import { LoadingSpinner } from '@/components/ui/loading';
import { haptics } from '@/lib/haptics';
import { Text, TextInput, View } from '@/tw';

/**
 * Pieces for editing a board item (Deck card or Jira issue) laid out like
 * the New To-Do sheet: a big title, live Markdown notes, chips, and one soft
 * card of details. Screens compose these, so every editor reads the same.
 */

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const IOS = Platform.OS === 'ios';

/** Left edge shared by title, notes and chips (the leading glyph's width minus its pull-in). */
export const EDITOR_TEXT_INSET = 34;

/** Content padding for the editor's ScrollView. */
export const EDITOR_CONTENT = { paddingHorizontal: 20, paddingTop: 8 } as const;

/** Big title with a leading glyph: a column-colored square, or an image (Jira issue type). */
export function EditorTitle({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  editable = true,
  iconUrl,
  iconHeaders,
  meta,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  editable?: boolean;
  iconUrl?: string;
  iconHeaders?: Record<string, string>;
  /** Small line under the title, e.g. "SCRUM-12 · Task". */
  meta?: string;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <View className="flex-row items-start">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ marginLeft: -10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          {iconUrl ? (
            <Image
              source={{ uri: iconUrl, headers: iconHeaders }}
              style={{ width: 20, height: 20, borderRadius: 4 }}
              contentFit="contain"
            />
          ) : (
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderCurve: 'continuous',
                borderWidth: 1.75,
                borderColor: colors.gray2,
              }}
            />
          )}
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoFocus={autoFocus}
          editable={editable}
          multiline
          submitBehavior="blurAndSubmit"
          placeholder={placeholder}
          placeholderTextColor={colors.text3}
          accessibilityLabel="Title"
          className="text-sf-text flex-1"
          style={{
            fontSize: 24,
            lineHeight: 30,
            fontWeight: '700',
            letterSpacing: -0.3,
            paddingVertical: 6,
            paddingHorizontal: 0,
          }}
        />
      </View>
      {meta ? (
        <Text style={{ marginLeft: EDITOR_TEXT_INSET, marginTop: -2, fontSize: 14, color: colors.text2 }}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Notes as rendered Markdown, switching to the live Markdown editor once
 * tapped, the same as task notes. When `editable` is false (a Jira description with
 * images or tables) it renders read-only with a note saying why.
 */
export function EditorNotes({
  value,
  onChangeText,
  placeholder = 'Notes',
  editable = true,
  readOnlyNote,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  readOnlyNote?: string;
}) {
  const { colors } = useTheme();
  if (!editable) {
    return (
      <View style={{ marginLeft: EDITOR_TEXT_INSET, marginTop: 6, gap: 8 }}>
        {value ? <MarkdownViewer markdown={value} /> : null}
        {readOnlyNote ? (
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <MaterialCommunityIcons name="lock-outline" size={14} color={colors.text3} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.text3 }}>{readOnlyNote}</Text>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ marginLeft: EDITOR_TEXT_INSET, marginTop: 4 }}>
      <MarkdownNotes
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        inputStyle={{ minHeight: 40 }}
      />
    </View>
  );
}

/** Label chips with an inline field to add more (Jira labels). */
export function EditorChips({
  values,
  onChange,
  addLabel = 'Add label',
  editable = true,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  addLabel?: string;
  editable?: boolean;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const value = draft?.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft(null);
  }

  if (!editable && values.length === 0) return null;
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: EDITOR_TEXT_INSET, marginTop: 14 }}>
      {values.map((value) => (
        <Pressable
          key={value}
          disabled={!editable}
          onPress={() => {
            haptics.tap();
            onChange(values.filter((candidate) => candidate !== value));
          }}
          accessibilityRole="button"
          accessibilityLabel={editable ? `Label ${value}. Double tap to remove` : `Label ${value}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.selectionBg,
            paddingLeft: 14,
            paddingRight: editable ? 10 : 14,
            height: 32,
            borderRadius: 16,
          }}>
          <Text style={{ color: colors.onSelectionBg, fontSize: 14, fontWeight: '600' }}>{value}</Text>
          {editable ? <MaterialCommunityIcons name="close" size={14} color={colors.onSelectionBg} /> : null}
        </Pressable>
      ))}
      {editable ? (
        draft != null ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            onBlur={commit}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            placeholder="label"
            placeholderTextColor={colors.text3}
            accessibilityLabel="New label"
            className="text-sf-text"
            style={{
              minWidth: 96,
              height: 32,
              paddingHorizontal: 12,
              paddingVertical: 0,
              borderRadius: 16,
              fontSize: 14,
              backgroundColor: colors.bg3,
            }}
          />
        ) : (
          <Pressable
            onPress={() => setDraft('')}
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            style={({ pressed }) =>
              IOS
                ? {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    height: 32,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    backgroundColor: colors.bg3,
                    opacity: pressed ? 0.6 : 1,
                  }
                : {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    height: 32,
                    paddingHorizontal: 12,
                    borderRadius: pressed ? 16 : 8,
                    borderWidth: 1,
                    borderColor: colors.gray2,
                  }
            }>
            <MaterialCommunityIcons name="tag-plus-outline" size={16} color={colors.text2} />
            <Text style={{ color: colors.text2, fontSize: 14 }}>{addLabel}</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

/** Section heading: iOS grouped-list header, Material title in the accent color on Android. */
export function EditorHeading({ title }: { title: string }) {
  const { colors } = useTheme();
  if (IOS) {
    return (
      <Text
        style={{
          marginTop: 28,
          paddingBottom: 8,
          paddingHorizontal: 4,
          fontSize: 13,
          color: colors.text2,
          textTransform: 'uppercase',
        }}>
        {title}
      </Text>
    );
  }
  return (
    <Text style={{ marginTop: 28, paddingBottom: 6, fontSize: 17, fontWeight: '700', color: colors.accent }}>
      {title}
    </Text>
  );
}

/** One soft card holding detail rows, as in the New To-Do sheet. */
export function DetailsCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginTop: 6,
        paddingHorizontal: 16,
        paddingVertical: 4,
        borderRadius: 24,
        borderCurve: 'continuous',
        backgroundColor: colors.bg2,
      }}>
      {children}
    </View>
  );
}

/** A detail row: icon, label, value on the right, chevron when it opens something. */
export function DetailRow({
  icon,
  label,
  value,
  leading,
  trailing,
  onPress,
  loading,
  danger,
}: {
  icon: IconName;
  label: string;
  value?: string;
  /** Shown before the value, e.g. a priority icon or avatar. */
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      <MaterialCommunityIcons name={icon} size={20} color={danger ? colors.danger : colors.accent} />
      <Text style={{ fontSize: 16, color: danger ? colors.danger : colors.text }}>{label}</Text>
      <View className="flex-1 flex-row items-center justify-end" style={{ gap: 8 }}>
        {leading}
        {value ? (
          <Text numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right', color: colors.text2, fontSize: 16 }}>
            {value}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <LoadingSpinner size={18} />
      ) : (
        (trailing ??
        (onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text3} /> : null))
      )}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 56 };
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={value ? `${label}, ${value}` : label} style={style}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [style, { opacity: pressed && IOS ? 0.6 : 1 }]}>
      {content}
    </Pressable>
  );
}

/** The full-width primary action under the form (Android; iOS uses the nav bar). */
export function EditorPrimaryButton({
  label,
  busyLabel,
  icon = 'check',
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busyLabel?: string;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => ({
        marginTop: 24,
        height: 56,
        borderRadius: pressed ? 16 : 28,
        borderCurve: 'continuous',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        backgroundColor: colors.accent,
        opacity: disabled ? 0.4 : 1,
      })}>
      {busy ? <LoadingSpinner size={24} /> : <MaterialCommunityIcons name={icon} size={22} color={colors.onAccent} />}
      <Text style={{ color: colors.onAccent, fontSize: 17, fontWeight: '600' }}>
        {busy ? (busyLabel ?? label) : label}
      </Text>
    </Pressable>
  );
}

/** Quiet destructive / secondary actions under the form. */
export function EditorActionRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 48,
        marginTop: 8,
        opacity: pressed ? 0.6 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={20} color={danger ? colors.danger : colors.accent} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: danger ? colors.danger : colors.accent }}>{label}</Text>
    </Pressable>
  );
}

/** Format a stored due date ("2026-11-06" or ISO) for a detail row. */
export function formatDue(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
