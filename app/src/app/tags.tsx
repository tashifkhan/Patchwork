import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { matchTagIgnoringCase } from '@/lib/tags';
import { useTagPickerStore } from '@/stores/tag-picker-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function TagPickerScreen() {
  const { colors } = useTheme();
  const available = useTagPickerStore((s) => s.available);
  const selected = useTagPickerStore((s) => s.selected);
  const toggle = useTagPickerStore((s) => s.toggle);
  const addTag = useTagPickerStore((s) => s.addTag);
  const release = useTagPickerStore((s) => s.release);
  const [draft, setDraft] = useState('');

  // Drop the bridge back to the form when this sheet goes away, but only while
  // we are still the active picker (see `release`).
  const owner = useRef(useTagPickerStore.getState().onApply);
  useEffect(() => {
    const current = owner.current;
    return () => release(current);
  }, [release]);

  function submitDraft() {
    if (!draft.trim()) return;
    addTag(draft);
    setDraft('');
  }

  const trimmed = draft.trim();
  const showCreate = trimmed.length > 0 && !matchTagIgnoringCase(available, trimmed);
  const visible = useMemo(() => {
    if (!trimmed) return available;
    const needle = trimmed.toLowerCase();
    return available.filter((tag) => tag.toLowerCase().includes(needle));
  }, [available, trimmed]);

  return (
    <SheetSurface
      title="Tags"
      subtitle={
        selected.length > 0 ? `${selected.length} selected` : 'Tap to select, or type to create'
      }>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="px-5 pb-2 pt-1">
          <View
            className="flex-row items-center gap-3 px-4"
            style={{
              backgroundColor: colors.bg3,
              borderRadius: 20,
              borderCurve: 'continuous',
              minHeight: 52,
            }}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.text2} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submitDraft}
              placeholder="Search or create a tag"
              placeholderTextColor={colors.text2}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              accessibilityLabel="Search or create a tag"
              className="text-sf-text flex-1 text-base"
            />
            {trimmed.length > 0 ? (
              <Pressable
                onPress={() => setDraft('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialCommunityIcons name="close-circle" size={18} color={colors.text2} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {showCreate ? (
          <Pressable
            onPress={submitDraft}
            accessibilityRole="button"
            accessibilityLabel={`Create tag ${trimmed}`}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View className="flex-row items-center gap-3 px-5 py-4" style={{ minHeight: 52 }}>
              <MaterialCommunityIcons name="plus" size={22} color={colors.accent} />
              <Text className="text-sf-blue text-base">Create “{trimmed}”</Text>
            </View>
          </Pressable>
        ) : null}

        {visible.map((tag) => {
          const checked = matchTagIgnoringCase(selected, tag) != null;
          return (
            <Pressable
              key={tag}
              onPress={() => toggle(tag)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={tag}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View
                className="flex-row items-center justify-between px-5 py-4"
                style={{ minHeight: 52 }}>
                <View className="flex-1 flex-row items-center gap-3">
                  <MaterialCommunityIcons name="tag-outline" size={22} color={colors.text2} />
                  <Text className="text-sf-text text-base">{tag}</Text>
                </View>
                <MaterialCommunityIcons
                  name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22}
                  color={checked ? colors.accent : colors.gray}
                />
              </View>
            </Pressable>
          );
        })}

        {visible.length === 0 && !showCreate ? (
          <View className="px-8 py-10">
            <Text className="text-sf-text-2 text-center">
              {available.length === 0
                ? 'No tags yet. Type above to create one.'
                : 'No tags match that search.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SheetSurface>
  );
}
