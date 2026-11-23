import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DeckCard } from '@/api/types';
import { columnTone } from '@/components/boards/board-tone';
import { MarkdownNotes } from '@/components/tasks/markdown-notes';
import { useTheme } from '@/components/theme/context';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { LoadingSpinner } from '@/components/ui/loading';
import { RiseIn } from '@/components/ui/motion';
import { checklistItems, initials, nameColor } from '@/features/boards/model';
import { formatRelativeDue } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useTabBarFabOffset } from '@/lib/tab-bar';
import { mixHex, withAlpha } from '@/lib/theme';
import { ScrollView, Text, View } from '@/tw';

/**
 * Android Deck card, in the style of the full-page task composer: a header
 * block tinted in the column's colour with the column as a pill (tap to move),
 * the title, labels, people and counts; then the description with its
 * checklist, the details card, and one bottom bar with Delete, Move and Save.
 */
export function CardPage({
  card,
  columnTitle,
  columnIndex,
  title,
  onTitle,
  description,
  onDescription,
  details,
  dirty,
  canSave,
  saving,
  onSave,
  onMove,
  onDelete,
}: {
  card: DeckCard;
  columnTitle: string;
  columnIndex: number;
  title: string;
  onTitle: (value: string) => void;
  description: string;
  onDescription: (value: string) => void;
  /** Due date, Move to Tasks and the like. */
  details: ReactNode;
  dirty: boolean;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  // Once the header scrolls away, the status bar frosts over the page.
  const [scrolled, setScrolled] = useState(false);
  // Above the floating navbar when it's on, like the other action bars.
  const barBottom = useTabBarFabOffset();
  const tone = columnTone(colors, dark, columnIndex);
  const ink = dark ? colors.text : mixHex(tone.dot, '#000000', 0.25);
  const labels = (card.labels ?? []).filter((label) => label.title);
  const people = (card.assignedUsers ?? []).map((user) => user.participant?.displayname).filter(Boolean) as string[];
  const comments = typeof card.commentsCount === 'number' ? card.commentsCount : 0;
  const attachments = typeof card.attachmentCount === 'number' ? card.attachmentCount : 0;
  const due = formatRelativeDue(card.duedate ?? null);
  const subtasks = checklistItems(description) ?? [];
  const done = subtasks.filter((sub) => sub.done).length;
  const headerStyle = useAnimatedStyle(() => ({ backgroundColor: withTiming(tone.bg, { duration: 300 }) }), [tone.bg]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        scrollEventThrottle={32}
        onScroll={(e) => {
          const next = e.nativeEvent.contentOffset.y > 120;
          if (next !== scrolled) setScrolled(next);
        }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: barBottom + 100 }}>
        <Animated.View
          style={[
            {
              paddingTop: insets.top + 8,
              paddingHorizontal: 20,
              paddingBottom: 24,
              borderBottomLeftRadius: 36,
              borderBottomRightRadius: 36,
              gap: 14,
            },
            headerStyle,
          ]}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <RoundButton icon="arrow-left" label="Back" ink={colors.text} onPress={() => router.back()} />
            <View style={{ flex: 1 }} />
            {/* The column, as a pill: tap to move the card. */}
            <Pressable
              onPress={() => {
                haptics.tap();
                onMove();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Column ${columnTitle}. Move`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 36,
                paddingLeft: 12,
                paddingRight: 8,
                borderRadius: 18,
                backgroundColor: withAlpha(dark ? '#FFFFFF' : '#FFFFFF', dark ? 0.1 : 0.6),
                opacity: pressed ? 0.7 : 1,
              })}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone.dot }} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{columnTitle}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={colors.text2} />
            </Pressable>
          </View>

          <RiseIn>
            <TextInput
              value={title}
              onChangeText={onTitle}
              multiline
              placeholder="Card title"
              placeholderTextColor={withAlpha(colors.text, 0.4)}
              accessibilityLabel="Title"
              style={{ fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5, color: colors.text, padding: 0 }}
            />
          </RiseIn>

          {labels.length ? (
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {labels.map((label, index) => {
                const color = label.color ? `#${label.color}` : null;
                return (
                  <View
                    key={`${label.title}-${index}`}
                    style={{
                      paddingHorizontal: 10,
                      height: 26,
                      borderRadius: 13,
                      justifyContent: 'center',
                      backgroundColor: color ? withAlpha(color, dark ? 0.32 : 0.2) : withAlpha('#FFFFFF', 0.6),
                    }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: color ? (dark ? mixHex(color, '#FFFFFF', 0.4) : mixHex(color, '#000000', 0.4)) : colors.text2 }}>
                      {label.title}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View className="flex-row items-center" style={{ gap: 10 }}>
            {people.length ? (
              <View className="flex-row" style={{ marginRight: 4 }}>
                {people.slice(0, 4).map((name, index) => (
                  <View
                    key={`${name}-${index}`}
                    accessible
                    accessibilityLabel={`Assigned to ${name}`}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      marginLeft: index ? -8 : 0,
                      borderWidth: 2,
                      borderColor: tone.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: nameColor(name),
                    }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{initials(name)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {due.label ? <Meta icon="clock-outline" label={due.label} color={due.overdue ? colors.red : ink} /> : null}
            {subtasks.length ? <Meta icon="file-tree-outline" label={`${done}/${subtasks.length}`} color={ink} /> : null}
            {attachments ? <Meta icon="paperclip" label={String(attachments)} color={ink} /> : null}
            {comments ? <Meta icon="comment-outline" label={String(comments)} color={ink} /> : null}
          </View>
        </Animated.View>

        <View style={{ paddingHorizontal: 20, paddingTop: 22, gap: 22 }}>
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text2, letterSpacing: 0.4 }}>DESCRIPTION</Text>
            <View style={{ borderRadius: 24, backgroundColor: colors.bg2, paddingHorizontal: 16, paddingVertical: 10 }}>
              <MarkdownNotes value={description} onChangeText={onDescription} placeholder="Add a description or a checklist (- [ ] item)" inputStyle={{ minHeight: 44 }} />
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text2, letterSpacing: 0.4 }}>DETAILS</Text>
            <View style={{ borderRadius: 24, backgroundColor: colors.bg2, paddingHorizontal: 16, paddingVertical: 4 }}>{details}</View>
          </View>
        </View>
      </ScrollView>

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

      {/* One bar for the card's actions; Save fills in once something changed. */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: barBottom,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: 8,
          borderRadius: 36,
          backgroundColor: colors.bg3,
          boxShadow: `0 8px 24px ${withAlpha('#000000', dark ? 0.5 : 0.14)}`,
        }}>
        <BarIcon icon="trash-can-outline" label="Delete card" color={colors.red} onPress={onDelete} />
        <BarIcon icon="arrow-right" label="Move to another column" color={colors.text} onPress={onMove} />
        <SaveButton dirty={dirty} disabled={!canSave} saving={saving} onPress={onSave} />
      </View>
    </View>
  );
}

function Meta({ icon, label, color }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; color: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <Text style={{ fontSize: 14, fontWeight: '500', color }}>{label}</Text>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  ink,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  ink: string;
  onPress: () => void;
}) {
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

function BarIcon({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  color: string;
  onPress: () => void;
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
        width: 56,
        height: 56,
        borderRadius: pressed ? 18 : 28,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.bg2 : withAlpha(colors.text, 0.05),
      })}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
    </Pressable>
  );
}

function SaveButton({ dirty, disabled, saving, onPress }: { dirty: boolean; disabled: boolean; saving: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.02, maxTranslate: 1.5, pressedScale: 0.97 });
  return (
    <Animated.View {...press.handlers} style={[press.style, { flex: 1 }]}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          haptics.impact('medium');
          onPress();
        }}
        onPressOut={press.release}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: saving }}
        accessibilityLabel="Save changes"
        style={{
          height: 56,
          borderRadius: 28,
          overflow: 'hidden',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: dirty ? colors.accent : withAlpha(colors.text, 0.06),
        }}>
        <PressGlow press={press} color={withAlpha('#FFFFFF', 0.2)} radius={28} />
        {saving ? <LoadingSpinner size={20} /> : <MaterialCommunityIcons name={dirty ? 'content-save-outline' : 'check'} size={20} color={dirty ? colors.onAccent : colors.text3} />}
        <Text style={{ fontSize: 16, fontWeight: '700', color: dirty ? colors.onAccent : colors.text3 }}>
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
