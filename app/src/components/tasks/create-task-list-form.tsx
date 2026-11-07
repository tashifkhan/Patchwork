import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Text, TextInput, View } from '@/tw';

export interface ListAccountChoice {
  id: string;
  name: string;
}

export function CreateTaskListForm({
  busy,
  onCreate,
  defaultOpen = false,
  onCancel,
  accounts = [],
  defaultAccountId,
}: {
  busy: boolean;
  onCreate: (name: string, accountId?: string) => void;
  defaultOpen?: boolean;
  onCancel?: () => void;
  /** Where the list can live. Shown as chips when there is more than one. */
  accounts?: ListAccountChoice[];
  defaultAccountId?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState('');
  const [accountChoice, setAccountChoice] = useState<string | undefined>(undefined);
  const accountId =
    accounts.find((account) => account.id === (accountChoice ?? defaultAccountId))?.id ?? accounts[0]?.id;
  const canCreate = name.trim().length > 0 && !busy;

  function submit() {
    if (!canCreate) return;
    onCreate(name.trim(), accountId);
    setName('');
    if (!defaultOpen) setOpen(false);
  }

  function cancel() {
    setName('');
    if (onCancel) onCancel();
    else setOpen(false);
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
      {accounts.length > 1 ? (
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {accounts.map((account) => {
            const selected = account.id === accountId;
            return (
              <Pressable
                key={account.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setAccountChoice(account.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View
                  className={selected ? 'bg-sf-blue rounded-full px-3 py-1.5' : 'bg-sf-bg-3 rounded-full px-3 py-1.5'}
                  style={{ borderCurve: 'continuous' }}>
                  <Text className={selected ? 'text-sf-on-accent text-sm font-semibold' : 'text-sf-text text-sm'}>
                    {account.name}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <Pressable onPress={cancel} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
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
