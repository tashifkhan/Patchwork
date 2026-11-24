import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Task } from '@/api/types';
import { MarkdownNotes } from '@/components/tasks/markdown-notes';
import { TaskCheckbox } from '@/components/tasks/task-checkbox';
import { useTheme } from '@/components/theme/context';
import { ToolbarIconButton, ToolbarSurface } from '@/components/ui/floating-toolbar';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { ACTION_BAR_CLEARANCE, KeyboardScrollView } from '@/components/ui/keyboard';
import { RiseIn } from '@/components/ui/motion';
import { useStackBack } from '@/hooks/use-stack-back';
import { formatRelativeDue } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { expandLayout } from '@/lib/motion';
import { listTone } from '@/lib/smart-lists';
import { mixHex, withAlpha } from '@/lib/theme';
import { blockOf, formatBlock } from '@/lib/time-block';
import { Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const PRIORITY_NAME: Record<number, string> = { 1: 'High', 5: 'Medium', 9: 'Low' };

/**
 * Android to-do page, in the style of the full-page composer: a header block
 * in the list's tone with the list as a pill (tap to move), a big checkbox and
 * title, and chips for when it's due, its time block, repeat, priority and
 * tags; then the description, checklist, schedule, repeat and options as
 * rounded cards, and one bottom bar with Delete, Move and Mark done.
 * Everything saves as it changes, like the rest of the to-do screens.
 */
export function TaskPage({
  task,
  draft,
  listName,
  listIndex,
  doneCount,
  barBottom,
  checklistDraft,
  onChecklistDraft,
  onAddChecklist,
  onTitle,
  onNotes,
  onBlur,
  onToggle,
  onOpenChild,
  onPickTags,
  onMove,
  onDelete,
  attachments,
  schedule,
  repeat,
  repeatLabel,
  options,
  focus,
}: {
  task: Task;
  draft: {
    title: string;
    markdown: string;
    tags: string[];
    due_at: string | null;
    start_at: string | null;
    priority: number | null;
    rrule: string | null;
  };
  listName: string;
  listIndex: number;
  doneCount: number;
  barBottom: number;
  checklistDraft: string;
  onChecklistDraft: (value: string) => void;
  onAddChecklist: () => void;
  onTitle: (value: string) => void;
  onNotes: (value: string) => void;
  onBlur: () => void;
  onToggle: (task: Task) => void;
  onOpenChild: (child: Task) => void;
  onPickTags: () => void;
  onMove: () => void;
  onDelete: () => void;
  attachments: ReactNode;
  schedule: ReactNode;
  repeat: ReactNode;
  repeatLabel: string;
  options: ReactNode;
  focus: ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  // Back to the list, even when this page was opened with nothing under it.
  const goBack = useStackBack('/(tabs)/(tasks)');
  // Once the header scrolls away, the status bar frosts over the page.
  const [scrolled, setScrolled] = useState(false);
  const tone = listTone(colors, dark, listIndex);
  // Full tone in light mode; in dark mode a low wash over the surface, so the
  // header is coloured without shouting.
  const headerBg = dark ? mixHex(colors.bg2, tone.ink, 0.14) : tone.fill;
  const headerStyle = useAnimatedStyle(() => ({ backgroundColor: withTiming(headerBg, { duration: 300 }) }), [headerBg]);
  const due = formatRelativeDue(draft.due_at);
  const block = blockOf({ start_at: draft.start_at, due_at: draft.due_at });
  const priority = draft.priority != null ? PRIORITY_NAME[draft.priority] : undefined;
  const children = task.children;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardScrollView
        scrollEventThrottle={32}
        onScroll={(e) => {
          const next = e.nativeEvent.contentOffset.y > 120;
          if (next !== scrolled) setScrolled(next);
        }}
        bottomOffset={ACTION_BAR_CLEARANCE}
        contentContainerStyle={{ paddingBottom: barBottom + 100 }}>
        {/* Header block in the list's tone */}
        <Animated.View
          style={[
            {
              paddingTop: insets.top + 8,
              paddingHorizontal: 20,
              paddingBottom: 22,
              borderBottomLeftRadius: 36,
              borderBottomRightRadius: 36,
              gap: 14,
            },
            headerStyle,
          ]}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <RoundButton icon="arrow-left" label="Back" ink={tone.ink} onPress={goBack} />
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => {
                haptics.tap();
                onMove();
              }}
              accessibilityRole="button"
              accessibilityLabel={`In ${listName}. Move to another list`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 36,
                paddingLeft: 12,
                paddingRight: 8,
                borderRadius: 18,
                backgroundColor: withAlpha('#FFFFFF', dark ? 0.1 : 0.6),
                opacity: pressed ? 0.7 : 1,
              })}>
              <MaterialCommunityIcons name="format-list-bulleted" size={16} color={tone.ink} />
              <Text numberOfLines={1} style={{ maxWidth: 180, fontSize: 14, fontWeight: '600', color: tone.ink }}>
                {listName}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={tone.ink} />
            </Pressable>
          </View>

          <RiseIn style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
            <View style={{ marginLeft: -10, marginTop: 2 }}>
              <TaskCheckbox
                checked={task.completed}
                size={28}
                onToggle={() => onToggle(task)}
                label={task.completed ? 'Mark incomplete' : 'Mark complete'}
              />
            </View>
            <TextInput
              value={draft.title}
              onChangeText={onTitle}
              onBlur={onBlur}
              multiline
              submitBehavior="blurAndSubmit"
              placeholder="To-do"
              placeholderTextColor={withAlpha(tone.ink, 0.4)}
              accessibilityLabel="Title"
              style={{
                flex: 1,
                fontSize: 28,
                lineHeight: 34,
                fontWeight: '800',
                letterSpacing: -0.5,
                color: tone.ink,
                padding: 0,
                paddingTop: 6,
                textDecorationLine: task.completed ? 'line-through' : 'none',
              }}
            />
          </RiseIn>

          {/* What's set, at a glance */}
          <View className="flex-row flex-wrap" style={{ gap: 6 }}>
            {due.label ? <MetaChip icon="flag-outline" label={due.label} alert={due.overdue} ink={tone.ink} /> : null}
            {block ? <MetaChip icon="clock-time-four-outline" label={formatBlock(block)} ink={tone.ink} /> : null}
            {draft.rrule ? <MetaChip icon="repeat" label={repeatLabel} ink={tone.ink} /> : null}
            {priority ? <MetaChip icon="signal-cellular-2" label={priority} ink={tone.ink} /> : null}
            {draft.tags.map((tag) => (
              <MetaChip key={tag} icon="tag-outline" label={tag} ink={tone.ink} onPress={onPickTags} />
            ))}
            <MetaChip icon="tag-plus-outline" label={draft.tags.length ? 'Edit tags' : 'Add tags'} ink={tone.ink} onPress={onPickTags} />
          </View>
        </Animated.View>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 18 }}>
          <Section title="Description">
            <MarkdownNotes value={draft.markdown} onChangeText={onNotes} onBlur={onBlur} inputStyle={{ minHeight: 44 }} />
          </Section>

          <Section title="Checklist" detail={children.length ? `${doneCount}/${children.length}` : undefined}>
            {children.map((child, index) => (
              <Animated.View
                key={child.id}
                entering={FadeIn.duration(180)}
                layout={expandLayout()}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 48,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.separator,
                }}>
                <View style={{ marginLeft: -11 }}>
                  <TaskCheckbox
                    checked={child.completed}
                    variant="circle"
                    size={20}
                    onToggle={() => onToggle(child)}
                    label={`${child.completed ? 'Uncheck' : 'Check'} ${child.title}`}
                  />
                </View>
                <Pressable
                  onPress={() => onOpenChild(child)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${child.title}`}
                  style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontSize: 16,
                      color: child.completed ? colors.text3 : colors.text,
                      textDecorationLine: child.completed ? 'line-through' : 'none',
                    }}>
                    {child.title}
                  </Text>
                </Pressable>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text3} />
              </Animated.View>
            ))}
            <View
              className="flex-row items-center"
              style={{ minHeight: 48, borderTopWidth: children.length ? 1 : 0, borderTopColor: colors.separator }}>
              <MaterialCommunityIcons name="plus" size={22} color={colors.accent} style={{ width: 32 }} />
              <TextInput
                value={checklistDraft}
                onChangeText={onChecklistDraft}
                onSubmitEditing={onAddChecklist}
                submitBehavior="submit"
                placeholder="Add checklist item"
                placeholderTextColor={colors.text3}
                returnKeyType="next"
                accessibilityLabel="Add checklist item"
                style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 }}
              />
            </View>
          </Section>

          {attachments ? <Section title="Attachments">{attachments}</Section> : null}
          <Section title="Schedule">{schedule}</Section>
          <Section title="Repeat" detail={repeatLabel}>
            {repeat}
          </Section>
          <Section title="Options">{options}</Section>
          {focus}
        </View>
      </KeyboardScrollView>

      <View
        pointerEvents="none"
        // A wash, not a live blur: this page sits inside the blur target the
        // navbar reads, and a blur inside its own target draws glitches.
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: withAlpha(colors.bg, 0.94),
          opacity: scrolled ? 1 : 0,
        }}
      />

      {/* One bar for the to-do's actions, the same surface as every floating toolbar. */}
      <ToolbarSurface style={{ position: 'absolute', left: 16, right: 16, bottom: barBottom }}>
        <ToolbarIconButton icon="trash-can-outline" sf="trash" label="Delete to-do" color={colors.red} onPress={onDelete} />
        <ToolbarIconButton icon="arrow-right" sf="arrow.right" label="Move to another list" onPress={onMove} />
        <DoneButton done={task.completed} onPress={() => onToggle(task)} />
      </ToolbarSurface>
    </View>
  );
}

function Section({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Animated.View layout={expandLayout()} style={{ gap: 8 }}>
      <View className="flex-row items-center" style={{ paddingHorizontal: 4 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text2 }}>
          {title}
        </Text>
        {detail ? <Text style={{ fontSize: 13, color: colors.text3 }}>{detail}</Text> : null}
      </View>
      <View style={{ borderRadius: 24, backgroundColor: colors.bg2, paddingHorizontal: 16, paddingVertical: 10 }}>
        {children}
      </View>
    </Animated.View>
  );
}

function MetaChip({
  icon,
  label,
  ink,
  alert,
  onPress,
}: {
  icon: IconName;
  label: string;
  ink: string;
  alert?: boolean;
  onPress?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const color = alert ? colors.red : ink;
  const content = (
    <View
      className="flex-row items-center"
      style={{
        gap: 5,
        height: 30,
        paddingHorizontal: 11,
        borderRadius: 15,
        backgroundColor: withAlpha('#FFFFFF', scheme === 'dark' ? 0.1 : 0.6),
      }}>
      <MaterialCommunityIcons name={icon} size={15} color={color} />
      <Text numberOfLines={1} style={{ maxWidth: 200, fontSize: 13, fontWeight: '600', color }}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

function RoundButton({ icon, label, ink, onPress }: { icon: IconName; label: string; ink: string; onPress: () => void }) {
  const press = useElasticPress({ maxStretch: 0.08, maxTranslate: 2, pressedScale: 0.9 });
  return (
    <Animated.View {...press.handlers} style={[press.style, { marginLeft: -8 }]}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <PressGlow press={press} color={withAlpha(ink, 0.12)} radius={24} size={24} />
        <MaterialCommunityIcons name={icon} size={24} color={ink} />
      </Pressable>
    </Animated.View>
  );
}

/** Mark done, or reopen a finished to-do. Its corners tighten while held (M3 Expressive). */
function DoneButton({ done, onPress }: { done: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.02, maxTranslate: 1.5, pressedScale: 0.97 });
  const corner = useAnimatedStyle(() => ({ borderRadius: 28 - 12 * press.glow.value }));
  return (
    <Animated.View {...press.handlers} style={[press.style, { flex: 1 }]}>
      <Pressable
        onPress={() => {
          haptics.impact('medium');
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={done ? 'Mark not done' : 'Mark done'}>
        <Animated.View
          style={[
            {
              height: 56,
              overflow: 'hidden',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: done ? withAlpha(colors.text, 0.06) : colors.accent,
            },
            corner,
          ]}>
          <PressGlow press={press} color={withAlpha('#FFFFFF', 0.2)} radius={28} />
          <MaterialCommunityIcons name={done ? 'restore' : 'check'} size={20} color={done ? colors.text : colors.onAccent} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: done ? colors.text : colors.onAccent }}>
            {done ? 'Reopen' : 'Mark done'}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
