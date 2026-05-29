import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { useTagPickerStore } from '@/stores/tag-picker-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function TagPickerScreen() {
  const { colors } = useTheme();
  const available = useTagPickerStore((s) => s.available);
  const selected = useTagPickerStore((s) => s.selected);
  const toggle = useTagPickerStore((s) => s.toggle);
  const addTag = useTagPickerStore((s) => s.addTag);
  const [draft, setDraft] = useState('');

  function submitDraft() {
    const value = draft.trim();
    if (!value) return;
    addTag(value);
    setDraft('');
  }

  const trimmed = draft.trim();
  const showCreate = trimmed.length > 0 && !available.includes(trimmed);

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled">
      <View className="border-sf-separator border-b px-4 py-3">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submitDraft}
          placeholder="Enter tag name"
          placeholderTextColor={colors.text2}
          autoFocus
          returnKeyType="done"
          className="text-sf-text text-lg"
        />
      </View>

      {showCreate ? (
        <Pressable onPress={submitDraft} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View className="flex-row items-center gap-3 px-4 py-4">
            <MaterialCommunityIcons name="plus" size={22} color={colors.accent} />
            <Text className="text-sf-blue text-base">Create “{trimmed}”</Text>
          </View>
        </Pressable>
      ) : null}

      {available.map((tag) => {
        const checked = selected.includes(tag);
        return (
          <Pressable
            key={tag}
            onPress={() => toggle(tag)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View className="flex-row items-center justify-between px-4 py-4">
              <View className="flex-row items-center gap-3">
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

      {available.length === 0 && !showCreate ? (
        <View className="px-4 py-8">
          <Text className="text-sf-text-2 text-center">
            No tags yet. Type above to create one.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
