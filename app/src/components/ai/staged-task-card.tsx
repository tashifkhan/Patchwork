import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { Platform, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { AiGeneratedTask, TaskList } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { DateField } from '@/components/tasks/date-field';
import { LiveMarkdownInput } from '@/components/tasks/live-markdown-input';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { haptics } from '@/lib/haptics';
import { DURATION, SPRING } from '@/lib/motion';
import { normalizeTags } from '@/lib/tags';
import { useTagPickerStore } from '@/stores/tag-picker-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

interface StagedTaskCardProps {
  index: number;
  task: AiGeneratedTask;
  lists: TaskList[];
  availableTags: string[];
  onChange: (index: number, patch: Partial<AiGeneratedTask>) => void;
  onRemove: (index: number) => void;
}

const PRIORITIES: { label: string; value: number | null }[] = [
  { label: 'None', value: null },
  { label: 'Low', value: 9 },
  { label: 'Medium', value: 5 },
  { label: 'High', value: 1 },
];

/** Left edge shared by title, notes and the rest (checkbox slot). */
const INSET = 34;

const SPATIAL = LinearTransition.springify()
  .damping(SPRING.spatialSlow.damping)
  .stiffness(SPRING.spatialSlow.stiffness);

/**
 * One AI-drafted to-do awaiting review, laid out like the add dialog: title,
 * live Markdown notes, list and tags, quiet date rows, priority, checklist.
 * Everything is editable; nothing is saved until the screen's Add button.
 */
function StagedTaskCardComponent({
  index,
  task,
  lists,
  availableTags,
  onChange,
  onRemove,
}: StagedTaskCardProps) {
  const { colors } = useTheme();
  const openTagPicker = useTagPickerStore((s) => s.open);

  function pickTags() {
    haptics.tap();
    const pool = normalizeTags([...availableTags, ...task.tags]).sort((a, b) => a.localeCompare(b));
    openTagPicker(pool, task.tags, (tags) => onChange(index, { tags: normalizeTags(tags) }));
    router.push('/tags');
  }

  function setSubtasks(subtasks: AiGeneratedTask['subtasks']) {
    onChange(index, { subtasks });
  }

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.medium2)}
      exiting={FadeOut.duration(DURATION.short4)}
      layout={SPATIAL}
      style={{
        backgroundColor: colors.bg2,
        borderRadius: 28,
        borderCurve: 'continuous',
        paddingLeft: 10,
        paddingRight: 6,
        paddingTop: 8,
        paddingBottom: 16,
      }}>
      {/* Title */}
      <View className="flex-row items-start">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 1.75,
              borderColor: colors.gray2,
            }}
          />
        </View>
        <TextInput
          value={task.title}
          onChangeText={(title) => onChange(index, { title })}
          multiline
          submitBehavior="blurAndSubmit"
          placeholder="To-do title"
          placeholderTextColor={colors.text3}
          accessibilityLabel={`To-do ${index + 1} title`}
          className="text-sf-text flex-1"
          style={{
            fontSize: 19,
            lineHeight: 25,
            fontWeight: '700',
            paddingVertical: 9,
            paddingHorizontal: 0,
          }}
        />
        <Pressable
          onPress={() => {
            haptics.warning();
            onRemove(index);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${task.title || 'this to-do'}`}
          android_ripple={{ color: colors.separator, borderless: true, radius: 22 }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed && Platform.OS === 'ios' ? 0.5 : 1,
          })}>
          <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
        </Pressable>
      </View>

      {/* Notes */}
      <View style={{ marginLeft: INSET + 10, marginRight: 10 }}>
        <LiveMarkdownInput
          value={task.description ?? ''}
          onChangeText={(description) => onChange(index, { description })}
          placeholder="Notes"
          placeholderTextColor={colors.text3}
          accessibilityLabel={`To-do ${index + 1} notes`}
          style={{ fontSize: 16, lineHeight: 22, minHeight: 28 }}
        />
      </View>

      <View style={{ marginLeft: INSET + 10, marginRight: 10, gap: 12, marginTop: 10 }}>
        {/* List */}
        {lists.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}>
            {lists.map((list) => {
              const selected = list.id === task.list_id;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => {
                    haptics.selection();
                    onChange(index, { list_id: list.id });
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`List ${list.name}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    height: 32,
                    paddingHorizontal: 12,
                    borderRadius: pressed ? 16 : 8,
                    backgroundColor: selected ? colors.selectionBg : 'transparent',
                    borderWidth: selected ? 0 : 1,
                    borderColor: colors.gray2,
                  })}>
                  <MaterialCommunityIcons
                    name={selected ? 'check' : 'format-list-bulleted'}
                    size={16}
                    color={selected ? colors.onSelectionBg : colors.text2}
                  />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: selected ? colors.onSelectionBg : colors.text,
                    }}>
                    {list.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Tags */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {task.tags.map((tag) => (
            <Pressable key={tag} onPress={pickTags} accessibilityLabel={`Tag ${tag}, edit tags`}>
              <View
                style={{
                  backgroundColor: colors.selectionBg,
                  paddingHorizontal: 12,
                  height: 30,
                  justifyContent: 'center',
                  borderRadius: 15,
                }}>
                <Text style={{ color: colors.onSelectionBg, fontSize: 14, fontWeight: '600' }}>
                  {tag}
                </Text>
              </View>
            </Pressable>
          ))}
          <Pressable
            onPress={pickTags}
            accessibilityRole="button"
            accessibilityLabel={task.tags.length ? 'Edit tags' : 'Add tags'}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              height: 30,
              paddingHorizontal: 10,
              borderRadius: pressed ? 15 : 8,
              borderWidth: 1,
              borderColor: colors.gray2,
            })}>
            <MaterialCommunityIcons name="tag-plus-outline" size={15} color={colors.text2} />
            <Text style={{ color: colors.text2, fontSize: 13 }}>
              {task.tags.length ? 'Edit' : 'Add tags'}
            </Text>
          </Pressable>
        </View>

        {/* Dates */}
        <DateField
          label="Deadline"
          iconName="flag-outline"
          value={task.due_at ?? null}
          onChange={(due_at) => onChange(index, { due_at })}
        />
        <DateField
          label="Reminder"
          iconName="bell-outline"
          value={task.reminder_at ?? null}
          onChange={(reminder_at) => onChange(index, { reminder_at })}
        />

        {/* Priority */}
        <SegmentedChoice
          options={PRIORITIES}
          value={task.priority ?? null}
          onChange={(priority) => onChange(index, { priority })}
        />

        {/* Checklist */}
        <View>
          {task.subtasks.map((sub, subIndex) => (
            <Animated.View
              key={subIndex}
              entering={FadeIn.duration(DURATION.medium1)}
              layout={SPATIAL}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
              <MaterialCommunityIcons
                name="checkbox-blank-circle-outline"
                size={20}
                color={colors.gray2}
                style={{ width: 30 }}
              />
              <TextInput
                value={sub.title}
                onChangeText={(title) =>
                  setSubtasks(
                    task.subtasks.map((entry, i) => (i === subIndex ? { ...entry, title } : entry))
                  )
                }
                placeholder="Checklist item"
                placeholderTextColor={colors.text3}
                accessibilityLabel={`Checklist item ${subIndex + 1}`}
                className="text-sf-text flex-1"
                style={{ fontSize: 16, paddingVertical: 8, paddingHorizontal: 0 }}
              />
              <Pressable
                onPress={() => setSubtasks(task.subtasks.filter((_, i) => i !== subIndex))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${sub.title || 'checklist item'}`}
                hitSlop={8}
                style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="close" size={16} color={colors.text3} />
              </Pressable>
            </Animated.View>
          ))}
          <Pressable
            onPress={() => {
              haptics.tap();
              setSubtasks([...task.subtasks, { title: '', description: null }]);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add checklist item"
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
            <MaterialCommunityIcons name="plus" size={20} color={colors.accent} style={{ width: 30 }} />
            <Text style={{ fontSize: 16, color: colors.text3 }}>Add checklist item</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

export const StagedTaskCard = memo(StagedTaskCardComponent);
