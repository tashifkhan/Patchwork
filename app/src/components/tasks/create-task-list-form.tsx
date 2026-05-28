import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Text, TextInput, View } from '@/tw';

export function CreateTaskListForm({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const canCreate = name.trim().length > 0 && !busy;

  function submit() {
    if (!canCreate) return;
    onCreate(name.trim());
    setName('');
    setOpen(false);
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <View className="bg-sf-bg-2 flex-row items-center gap-2 rounded-full px-4 py-1.5" style={{ borderCurve: 'continuous' }}>
          <MaterialCommunityIcons name="plus" size={16} color={colors.accent} />
          <Text className="text-sf-blue text-sm font-semibold">New list</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="bg-sf-bg-2 gap-3 rounded-2xl p-3" style={{ borderCurve: 'continuous' }}>
      <Text className="text-sf-text-2 text-xs font-semibold uppercase">New list</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={submit}
        placeholder="List name"
        placeholderTextColor={colors.text2}
        returnKeyType="done"
        className="text-sf-text bg-sf-bg-3 rounded-xl px-3 py-3 text-base"
        style={{ borderCurve: 'continuous' }}
      />
      <View className="flex-row gap-2">
        <Pressable onPress={() => setOpen(false)} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
          <View className="bg-sf-bg-3 items-center rounded-xl py-3" style={{ borderCurve: 'continuous' }}>
            <Text className="text-sf-text-2 font-semibold">Cancel</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!canCreate}
          style={({ pressed }) => ({ flex: 1, opacity: !canCreate ? 0.4 : pressed ? 0.8 : 1 })}>
          <View className="bg-sf-blue items-center rounded-xl py-3" style={{ borderCurve: 'continuous' }}>
            <Text className="text-sf-on-accent font-semibold">{busy ? 'Creating...' : 'Create'}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
