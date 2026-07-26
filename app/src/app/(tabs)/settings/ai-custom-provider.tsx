import { useRouter } from 'expo-router';
import { useState } from 'react';

import { SettingsGroup, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { NativeAlert } from '@/components/ui/native-alert';
import { useInvalidateAiKeys } from '@/hooks/use-ai';
import { saveAiApiKey } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, TextInput, View } from '@/tw';

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secure?: boolean;
  autoCapitalize?: 'none' | 'words';
}

/**
 * Labelled text field. Defined at module scope — declaring it inside the screen
 * would remount the input on every keystroke and drop the keyboard focus.
 */
function Field({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  secure,
  autoCapitalize = 'none',
}: FieldProps) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5">
      <Text className="text-sf-text text-sm font-semibold">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={colors.gray}
        className="text-sf-text rounded-2xl px-3 py-3 text-base"
        style={{ backgroundColor: colors.bg3, minHeight: 48, borderCurve: 'continuous' }}
      />
      {hint ? <Text className="text-sf-text-3 text-xs">{hint}</Text> : null}
    </View>
  );
}

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

  return (
    <>
      <SettingsScreen>
        <SettingsGroup>
          <View className="gap-4 px-4 py-4">
            <Text className="text-sf-text-2 text-sm">
              Point Patchwork at any OpenAI-compatible endpoint — a local llama.cpp or LM Studio
              server, vLLM, or a self-hosted gateway.
            </Text>

            <Field
              label="Display name"
              value={name}
              onChangeText={setName}
              placeholder="Home server"
              autoCapitalize="words"
            />
            <Field
              label="Base URL"
              hint="HTTPS, or HTTP for a local/LAN server."
              value={baseUrl}
              onChangeText={setBaseUrl}
              placeholder="http://192.168.1.10:11434/v1"
            />
            <Field
              label="Model id"
              hint="Optional — you can add more from the provider screen."
              value={modelId}
              onChangeText={setModelId}
              placeholder="qwen2.5-coder:14b"
            />
            <Field
              label="API key"
              hint="Optional — many local servers do not need one."
              value={key}
              onChangeText={setKey}
              placeholder="sk-…"
              secure
            />

            <Button
              label="Add provider"
              onPress={submit}
              disabled={!name.trim() || !baseUrl.trim()}
            />
          </View>
        </SettingsGroup>
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
