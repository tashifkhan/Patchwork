import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Platform, Pressable } from 'react-native';

import { SettingsGroup, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useTaskLists } from '@/hooks/use-tasks';
import { clearGeminiApiKey, getGeminiApiKey, saveGeminiApiKey } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, TextInput, View } from '@/tw';

export default function AiScreen() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';

  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const setAiDefaultListId = useSettingsStore((s) => s.setAiDefaultListId);
  const listsQuery = useTaskLists();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (isWeb) return;
    let active = true;
    getGeminiApiKey().then((stored) => {
      if (!active) return;
      setHasKey(!!stored);
      setKey(stored ?? '');
    });
    return () => {
      active = false;
    };
  }, [isWeb]);

  async function save() {
    try {
      await saveGeminiApiKey(key);
      setHasKey(true);
      queryClient.invalidateQueries();
      setAlert({ title: 'Saved', message: 'Gemini API key saved on this device.' });
    } catch (error) {
      setAlert({ title: 'Could not save key', message: error instanceof Error ? error.message : 'Try again.' });
    }
  }

  async function remove() {
    await clearGeminiApiKey();
    setHasKey(false);
    setKey('');
    queryClient.invalidateQueries();
  }

  return (
    <SettingsScreen>
      {!isWeb ? (
        <SettingsGroup title="Gemini API key">
          <View className="gap-3 px-4 py-4">
            <View
              className="bg-sf-bg-3 flex-row items-center gap-2 rounded-xl px-3.5 py-1"
              style={{ borderCurve: 'continuous', borderWidth: 1, borderColor: colors.separator }}>
              <TextInput
                value={key}
                onChangeText={setKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showKey}
                placeholder="Paste your Gemini API key"
                placeholderTextColor={colors.text3}
                className="text-sf-text flex-1 py-2.5 text-base"
              />
              <Pressable
                onPress={() => setShowKey((v) => !v)}
                hitSlop={10}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <MaterialCommunityIcons
                  name={showKey ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={colors.text2}
                />
              </Pressable>
            </View>
            <View className="flex-row items-center gap-3">
              <Pressable onPress={save} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, flex: 1 })}>
                <View
                  className="bg-sf-blue items-center rounded-xl py-3"
                  style={{ borderCurve: 'continuous' }}>
                  <Text className="text-sf-on-accent text-base font-semibold">Save key</Text>
                </View>
              </Pressable>
              {hasKey ? (
                <Pressable onPress={remove} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                  <Text className="text-sf-red px-2 text-sm font-semibold">Remove</Text>
                </Pressable>
              ) : null}
            </View>
            <Text className="text-sf-text-3 text-xs">
              Get a free key at aistudio.google.com. It stays on this device (BYOK) and powers AI
              image import.
            </Text>
          </View>
        </SettingsGroup>
      ) : null}

      {lists.length > 0 ? (
        <SettingsGroup title="Default import list">
          <View className="px-4 py-4">
            <View className="flex-row flex-wrap items-center gap-2">
              {lists.map((list) => (
                <ToggleChip
                  key={list.id}
                  label={list.name}
                  selected={list.id === aiDefaultListId}
                  onPress={() => setAiDefaultListId(list.id === aiDefaultListId ? null : list.id)}
                />
              ))}
            </View>
          </View>
        </SettingsGroup>
      ) : null}

      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />
    </SettingsScreen>
  );
}
