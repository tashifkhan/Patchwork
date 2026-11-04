import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import {
  HeaderTextButton,
  SETTINGS_IOS,
  SettingsActionRow,
  SettingsDivider,
  SettingsGroup,
  SettingsScreen,
  SettingsTextField,
} from '@/components/settings/settings-list';
import { NativeAlert } from '@/components/ui/native-alert';
import { useInvalidateAiKeys } from '@/hooks/use-ai';
import { saveAiApiKey } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';

export default function AiCustomProviderScreen() {
  const router = useRouter();
  const invalidateKeys = useInvalidateAiKeys();
  const upsertAiCustomProvider = useSettingsStore((s) => s.upsertAiCustomProvider);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [key, setKey] = useState('');
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  async function submit() {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim();
    if (!trimmedName || !trimmedUrl) {
      setAlert({ title: 'Missing fields', message: 'Name and base URL are required.' });
      return;
    }

    const id = `custom-${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
    const modelIds = modelId.trim() ? [modelId.trim()] : [];

    try {
      upsertAiCustomProvider({ id, name: trimmedName, baseUrl: trimmedUrl, modelIds });
    } catch (error) {
      setAlert({
        title: 'Invalid base URL',
        message:
          error instanceof Error
            ? error.message
            : 'Use HTTPS, or HTTP only for a local/LAN model server.',
      });
      return;
    }

    if (key.trim()) {
      try {
        await saveAiApiKey(id, key.trim());
        invalidateKeys();
      } catch {
        // The provider is saved either way — the key can be added from its screen.
      }
    }

    router.back();
  }

  const canAdd = Boolean(name.trim() && baseUrl.trim());

  return (
    <>
      <SettingsScreen>
        <Stack.Screen
          options={{
            title: SETTINGS_IOS ? 'Custom Provider' : 'Custom provider',
            headerRight: SETTINGS_IOS
              ? () => <HeaderTextButton label="Add" onPress={submit} disabled={!canAdd} />
              : undefined,
          }}
        />

        <SettingsGroup
          title="Server"
          footer="Any OpenAI-compatible endpoint: a local llama.cpp or LM Studio server, vLLM, or a self-hosted gateway. Use HTTPS, or HTTP for a local or LAN server.">
          <SettingsTextField
            label="Name"
            icon="tag-outline"
            labelWidth={80}
            value={name}
            onChangeText={setName}
            placeholder="Home server"
            autoCapitalize="words"
          />
          <SettingsDivider />
          <SettingsTextField
            label="Base URL"
            icon="web"
            labelWidth={80}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="http://192.168.1.10:11434/v1"
            autoCapitalize="none"
            keyboardType="url"
          />
        </SettingsGroup>

        <SettingsGroup
          title="Optional"
          footer="Add more models later from the provider page. Many local servers do not need a key.">
          <SettingsTextField
            label="Model id"
            icon="cube-outline"
            labelWidth={80}
            value={modelId}
            onChangeText={setModelId}
            placeholder="qwen2.5-coder:14b"
            autoCapitalize="none"
            mono
          />
          <SettingsDivider />
          <SettingsTextField
            label="API key"
            icon="key-outline"
            labelWidth={80}
            value={key}
            onChangeText={setKey}
            placeholder="sk-…"
            autoCapitalize="none"
            secureTextEntry
            mono
          />
        </SettingsGroup>

        {!SETTINGS_IOS ? (
          <SettingsGroup>
            <SettingsActionRow
              title="Add provider"
              variant="filled"
              onPress={submit}
              disabled={!canAdd}
            />
          </SettingsGroup>
        ) : null}
      </SettingsScreen>

      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />
    </>
  );
}
