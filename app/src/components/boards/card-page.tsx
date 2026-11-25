import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DeckCard } from '@/api/types';
import { columnTone } from '@/components/boards/board-tone';
import { MarkdownNotes } from '@/components/ui/markdown-notes';
import { ACTION_BAR_CLEARANCE, KeyboardScrollView } from '@/components/ui/keyboard';
import { useTheme } from '@/components/theme/context';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { LoadingSpinner } from '@/components/ui/loading';
import { RiseIn } from '@/components/ui/motion';
import { checklistItems, initials, nameColor } from '@/features/boards/model';
import { formatRelativeDue } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useTabBarFabOffset } from '@/lib/tab-bar';
import { mixHex, withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

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
  onBack,
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
  onBack: () => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  // Once the header scrolls away, the status bar frosts over the page.
  const [scrolled, setScrolled] = useState(false);
  // Above the floating navbar when it's on, like the other action bars.
  const barBottom = useTabBarFabOffset();
  const tone = columnTone(colors, dark, columnIndex);
  // A quiet tint of the column's colour: full tone in light mode, a low wash
  // over the surface in dark mode so the header doesn't shout.
  const headerBg = dark ? mixHex(colors.bg2, tone.dot, 0.16) : tone.bg;
  const chipBg = withAlpha(dark ? '#FFFFFF' : '#FFFFFF', dark ? 0.08 : 0.65);
  const labels = (card.labels ?? []).filter((label) => label.title);
  const people = (card.assignedUsers ?? []).map((user) => user.participant?.displayname).filter(Boolean) as string[];
  const comments = typeof card.commentsCount === 'number' ? card.commentsCount : 0;
  const attachments = typeof card.attachmentCount === 'number' ? card.attachmentCount : 0;
  const due = formatRelativeDue(card.duedate ?? null);
  const subtasks = checklistItems(description) ?? [];
  const done = subtasks.filter((sub) => sub.done).length;
  const headerStyle = useAnimatedStyle(() => ({ backgroundColor: withTiming(headerBg, { duration: 300 }) }), [headerBg]);

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
        <Animated.View
          style={[
            {
              paddingTop: insets.top + 6,
              paddingHorizontal: 20,
              paddingBottom: 22,
              borderBottomLeftRadius: 32,
              borderBottomRightRadius: 32,
              gap: 16,
            },
            headerStyle,
          ]}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <RoundButton icon="arrow-left" label="Back" ink={colors.text} fill={chipBg} onPress={onBack} />
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
                gap: 8,
                height: 40,
                paddingLeft: 14,
                paddingRight: 10,
                borderRadius: 20,
                backgroundColor: chipBg,
                opacity: pressed ? 0.7 : 1,
              })}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone.dot }} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{columnTitle}</Text>
              <MaterialCommunityIcons name="swap-horizontal" size={18} color={colors.text2} />
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
              style={{ fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6, color: colors.text, padding: 0 }}
            />
          </RiseIn>

          {labels.length ? (
            <View className="flex-row flex-wrap" style={{ gap: 6, marginTop: -4 }}>
              {labels.map((label, index) => {
                const color = label.color ? `#${label.color}` : colors.accent;
                return (
                  <View
                    key={`${label.title}-${index}`}
                    style={{ paddingHorizontal: 10, height: 26, borderRadius: 8, justifyContent: 'center', backgroundColor: color }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.3, color: '#FFFFFF' }}>
                      {label.title}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* People and counts, each in a matching pill. */}
          <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
            {people.length ? (
              <Pill bg={chipBg}>
                <View className="flex-row" style={{ marginLeft: -6 }}>
                  {people.slice(0, 3).map((name, index) => (
                    <View
                      key={`${name}-${index}`}
                      accessible
                      accessibilityLabel={`Assigned to ${name}`}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        marginLeft: index ? -6 : 0,
                        borderWidth: 1.5,
                        borderColor: headerBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: nameColor(name),
                      }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>{initials(name)}</Text>
                    </View>
                  ))}
                </View>
                <Text numberOfLines={1} style={{ maxWidth: 150, fontSize: 13, fontWeight: '600', color: colors.text }}>
                  {people.map((name) => name.split(' ')[0]).join(', ')}
                </Text>
              </Pill>
            ) : null}
            {due.label ? (
              <Pill bg={due.overdue ? withAlpha(colors.red, 0.16) : chipBg}>
                <MaterialCommunityIcons name="clock-outline" size={15} color={due.overdue ? colors.red : colors.text2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: due.overdue ? colors.red : colors.text }}>{due.label}</Text>
              </Pill>
            ) : null}
            {subtasks.length ? (
              <Pill bg={chipBg}>
                <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={15} color={colors.text2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{`${done}/${subtasks.length}`}</Text>
              </Pill>
            ) : null}
            {attachments ? (
              <Pill bg={chipBg}>
                <MaterialCommunityIcons name="paperclip" size={15} color={colors.text2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{attachments}</Text>
              </Pill>
            ) : null}
            {comments ? (
              <Pill bg={chipBg}>
                <MaterialCommunityIcons name="comment-outline" size={15} color={colors.text2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{comments}</Text>
              </Pill>
            ) : null}
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

function Pill({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center" style={{ gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: bg }}>
      {children}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  ink,
  fill,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  ink: string;
  fill?: string;
  onPress: () => void;
}) {
  const press = useElasticPress({ maxStretch: 0.08, maxTranslate: 2, pressedScale: 0.9 });
  return (
    <Animated.View {...press.handlers} style={[press.style, { marginLeft: fill ? 0 : -8 }]}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: fill ? 40 : 48,
          height: fill ? 40 : 48,
          borderRadius: 24,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fill,
        }}>
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
