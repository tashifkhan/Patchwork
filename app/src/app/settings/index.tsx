import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, Switch } from 'react-native';

import { getApiBaseUrl } from '@/api/client';
import { Icon } from '@/components/ui/icon';
import { useHealth } from '@/hooks/use-health';
import { useTaskLists } from '@/hooks/use-tasks';
import { ensureNotificationPermissions } from '@/lib/notifications';
import { useSettingsStore, type ThemeMode } from '@/stores/settings-store';
import { ScrollView, Text, TextInput, View, useCSSVariable } from '@/tw';

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export default function SettingsScreen() {
  const textSecondary = useCSSVariable('--sf-text-2');
  const green = useCSSVariable('--sf-green');
  const red = useCSSVariable('--sf-red');
  const queryClient = useQueryClient();

  const proxyUrl = useSettingsStore((s) => s.proxyUrl);
  const setProxyUrl = useSettingsStore((s) => s.setProxyUrl);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const setAiDefaultListId = useSettingsStore((s) => s.setAiDefaultListId);

  const healthQuery = useHealth();
  const listsQuery = useTaskLists();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  const [urlDraft, setUrlDraft] = useState(proxyUrl);

  function saveProxyUrl() {
    setProxyUrl(urlDraft.trim());
    queryClient.invalidateQueries();
    Alert.alert('Saved', 'Proxy URL updated.');
  }

  async function toggleNotifications(value: boolean) {
    if (value) {
      const granted = await ensureNotificationPermissions();
      if (!granted) {
        Alert.alert('Permission needed', 'Enable notifications in system settings to get reminders.');
        return;
      }
    }
    setNotificationsEnabled(value);
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-6 px-4 py-4 pb-12">
      <Section title="Connection">
        <View className="gap-2 px-3 py-3">
          <Text className="text-sf-text-2 text-xs font-semibold uppercase">Proxy URL</Text>
          <TextInput
            value={urlDraft}
            onChangeText={setUrlDraft}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://localhost:8000"
            placeholderTextColor={textSecondary as string}
            className="text-sf-text bg-sf-bg rounded-lg px-3 py-2.5 text-base"
            style={{ borderCurve: 'continuous' }}
          />
          <Pressable onPress={saveProxyUrl} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text className="text-sf-blue py-1 text-base">Save</Text>
          </Pressable>
        </View>
        <Divider />
        <StatusRow
          label="Backend reachable"
          ok={!healthQuery.isError && !!healthQuery.data}
          color={(!healthQuery.isError && healthQuery.data ? green : red) as string}
        />
        <Divider />
        <StatusRow
          label="Nextcloud configured"
          ok={!!healthQuery.data?.nextcloud_configured}
          color={(healthQuery.data?.nextcloud_configured ? green : red) as string}
        />
        <Divider />
        <StatusRow
          label="Gemini configured"
          ok={!!healthQuery.data?.gemini_configured}
          color={(healthQuery.data?.gemini_configured ? green : red) as string}
        />
        <Divider />
        <Pressable
          onPress={() => queryClient.invalidateQueries()}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View className="flex-row items-center gap-2 px-3 py-3">
            <Icon name="arrow.clockwise" size={18} color={textSecondary as string} />
            <Text className="text-sf-blue text-base">Refresh all data</Text>
          </View>
        </Pressable>
      </Section>

      <Section title="Appearance">
        <View className="gap-2 px-3 py-3">
          <View className="flex-row gap-2">
            {THEME_OPTIONS.map((option) => {
              const selected = option.value === themeMode;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setThemeMode(option.value)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flex: 1 })}>
                  <View
                    className={`items-center rounded-lg py-2 ${selected ? 'bg-sf-blue' : 'bg-sf-bg'}`}
                    style={{ borderCurve: 'continuous' }}>
                    <Text className={`text-sm ${selected ? 'text-white' : 'text-sf-text-2'}`}>
                      {option.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Section>

      <Section title="Notifications">
        <View className="flex-row items-center justify-between px-3 py-3">
          <Text className="text-sf-text text-base">Task reminders</Text>
          <Switch value={notificationsEnabled} onValueChange={toggleNotifications} />
        </View>
      </Section>

      {lists.length > 0 ? (
        <Section title="AI Import">
          <View className="gap-2 px-3 py-3">
            <Text className="text-sf-text-2 text-xs font-semibold uppercase">Default list</Text>
            <View className="flex-row flex-wrap gap-2">
              {lists.map((list) => {
                const selected = list.id === aiDefaultListId;
                return (
                  <Pressable
                    key={list.id}
                    onPress={() => setAiDefaultListId(selected ? null : list.id)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                    <View
                      className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg'}`}
                      style={{ borderCurve: 'continuous' }}>
                      <Text className={`text-sm ${selected ? 'text-white' : 'text-sf-text-2'}`}>
                        {list.name}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>
      ) : null}

      <View className="items-center gap-1 pt-4">
        <Text selectable className="text-sf-text-3 text-xs">
          {getApiBaseUrl()}
        </Text>
        <Text className="text-sf-text-3 text-xs">
          v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sf-text-2 px-3 text-xs font-semibold uppercase">{title}</Text>
      <View className="bg-sf-bg-2 overflow-hidden rounded-2xl" style={{ borderCurve: 'continuous' }}>
        {children}
      </View>
    </View>
  );
}

function Divider() {
  return <View className="bg-sf-separator ml-3 h-px" />;
}

function StatusRow({ label, ok, color }: { label: string; ok: boolean; color: string }) {
  return (
    <View className="flex-row items-center justify-between px-3 py-3">
      <Text className="text-sf-text text-base">{label}</Text>
      <Icon name={ok ? 'checkmark.circle.fill' : 'xmark.circle.fill'} size={20} color={color} />
    </View>
  );
}
