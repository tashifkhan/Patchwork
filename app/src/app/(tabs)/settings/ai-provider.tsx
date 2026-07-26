import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable } from 'react-native';

import { AiProviderIcon } from '@/components/settings/ai-provider-icon';
import { SettingsGroup, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { NativeAlert } from '@/components/ui/native-alert';
import { useAiCatalog, useInvalidateAiKeys } from '@/hooks/use-ai';
import { aiCredentialId, modelBadges, type AiModelInfo } from '@/lib/ai-models';
import { clearAiApiKey, getAiApiKey, saveAiApiKey } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, TextInput, View } from '@/tw';

/** Rendering every OpenRouter model would mean 300+ rows in one ScrollView. */
const MODEL_PAGE = 40;

export default function AiProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const invalidateKeys = useInvalidateAiKeys();

  const { providers } = useAiCatalog();
  const provider = providers.find((item) => item.id === id) ?? null;

  const aiModelSelections = useSettingsStore((s) => s.aiModelSelections);
  const setAiModelSelections = useSettingsStore((s) => s.setAiModelSelections);
  const aiBaseUrlOverrides = useSettingsStore((s) => s.aiBaseUrlOverrides);
  const setAiBaseUrlOverride = useSettingsStore((s) => s.setAiBaseUrlOverride);
  const removeAiCustomProvider = useSettingsStore((s) => s.removeAiCustomProvider);

  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(MODEL_PAGE);
  const [manualModelId, setManualModelId] = useState('');
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getAiApiKey(id).then((stored) => {
      if (!active) return;
      setKey(stored ?? '');
      setHasKey(Boolean(stored));
    });
    return () => {
      active = false;
    };
  }, [id]);

  const visibleModels = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const models = provider?.models ?? [];
    if (!query) return models;
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query)
    );
  }, [provider?.models, filter]);

  if (!provider) {
    return (
      <SettingsScreen>
        <Stack.Screen options={{ title: 'Provider' }} />
        <SettingsGroup>
          <View className="gap-1 px-4 py-6">
            <Text className="text-sf-text text-base font-semibold">Provider not found</Text>
            <Text className="text-sf-text-2 text-sm">
              It may have been removed. Go back and pick another one.
            </Text>
          </View>
        </SettingsGroup>
      </SettingsScreen>
    );
  }

  const selectedIds = new Set(
    aiModelSelections.filter((s) => s.providerId === provider.id).map((s) => s.modelId)
  );

  // Providers backed by the same keychain entry (OpenCode Zen / Go).
  const credentialSlot = aiCredentialId(provider.id);
  const sharesKeyWith = providers
    .filter((item) => item.id !== provider.id && aiCredentialId(item.id) === credentialSlot)
    .map((item) => item.name);

  function toggleModel(modelId: string, model?: AiModelInfo) {
    if (!provider) return;
    setAiModelSelections(
      selectedIds.has(modelId)
        ? aiModelSelections.filter((s) => s.providerId !== provider.id || s.modelId !== modelId)
        : [
            ...aiModelSelections,
            {
              providerId: provider.id,
              modelId,
              modelName: model?.name,
              input: model?.input,
              output: model?.output,
              reasoning: model?.reasoning,
            },
          ]
    );
  }

  async function saveKey() {
    if (!provider) return;
    setSaving(true);
    try {
      await saveAiApiKey(provider.id, key);
      setHasKey(true);
      invalidateKeys();
      setAlert({ title: 'Saved', message: 'API key stored securely on this device.' });
    } catch (error) {
      setAlert({
        title: 'Could not save key',
        message: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    if (!provider) return;
    await clearAiApiKey(provider.id);
    setHasKey(false);
    setKey('');
    invalidateKeys();
  }

  function addManualModel() {
    const modelId = manualModelId.trim();
    if (!modelId) return;
    toggleModel(modelId);
    setManualModelId('');
  }

  function deleteProvider() {
    if (!provider) return;
    removeAiCustomProvider(provider.id);
    setAiModelSelections(aiModelSelections.filter((s) => s.providerId !== provider.id));
    router.back();
  }

  return (
    <>
      <SettingsScreen>
        <Stack.Screen options={{ title: provider.name }} />

        {/* Identity + status */}
        <SettingsGroup>
          <View className="flex-row items-center gap-3 px-4 py-4">
            <AiProviderIcon
              providerId={provider.id}
              custom={provider.custom}
              configured={hasKey}
              size={52}
            />
            <View className="flex-1 gap-0.5">
              <Text className="text-sf-text text-lg font-bold">{provider.name}</Text>
              <Text className="text-sf-text-2 text-sm">
                {hasKey ? 'Key saved on this device' : 'No key yet'} ·{' '}
                {provider.models.length} model{provider.models.length === 1 ? '' : 's'}
              </Text>
            </View>
            {provider.docs ? (
              <Pressable
                onPress={() => Linking.openURL(provider.docs)}
                hitSlop={12}
                accessibilityRole="link"
                accessibilityLabel={`Open ${provider.name} documentation`}
                style={({ pressed }) => ({
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.5 : 1,
                })}>
                <MaterialCommunityIcons name="open-in-new" size={20} color={colors.accent} />
              </Pressable>
            ) : null}
          </View>
        </SettingsGroup>

        {/* Credentials */}
        <SettingsGroup title="API key">
          <View className="gap-3 px-4 py-4">
            <View
              className="flex-row items-center rounded-2xl px-3"
              style={{ backgroundColor: colors.bg3, minHeight: 48, borderCurve: 'continuous' }}>
              <TextInput
                value={key}
                onChangeText={setKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showKey}
                placeholder={provider.env}
                placeholderTextColor={colors.gray}
                className="text-sf-text flex-1 py-3 text-base"
              />
              <Pressable
                onPress={() => setShowKey((value) => !value)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={showKey ? 'Hide key' : 'Show key'}
                style={({ pressed }) => ({
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.5 : 1,
                })}>
                <MaterialCommunityIcons
                  name={showKey ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.text2}
                />
              </Pressable>
            </View>

            {sharesKeyWith.length > 0 ? (
              <Text className="text-sf-text-3 text-sm">
                Uses the same {provider.env} as {sharesKeyWith.join(', ')} — saving here configures
                both.
              </Text>
            ) : null}

            {provider.kind === 'openai-compatible' && !provider.custom ? (
              <TextInput
                value={aiBaseUrlOverrides[provider.id] ?? provider.defaultBaseUrl ?? ''}
                onChangeText={(value) => setAiBaseUrlOverride(provider.id, value)}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="OpenAI-compatible base URL"
                placeholderTextColor={colors.gray}
                className="text-sf-text rounded-2xl px-3 py-3 text-base"
                style={{ backgroundColor: colors.bg3, minHeight: 48, borderCurve: 'continuous' }}
              />
            ) : null}

            <Button
              label={hasKey ? 'Update key' : 'Save key'}
              onPress={saveKey}
              disabled={!key.trim() || saving}
              loading={saving}
            />
            {hasKey ? <Button variant="text" label="Remove key" onPress={removeKey} /> : null}
          </View>
        </SettingsGroup>

        {/* Models */}
        <SettingsGroup
          title={selectedIds.size > 0 ? `Models · ${selectedIds.size} selected` : 'Models'}>
          {provider.models.length > 0 ? (
            <View className="px-4 py-4">
              <View
                className="flex-row items-center rounded-2xl px-3"
                style={{ backgroundColor: colors.bg3, minHeight: 48, borderCurve: 'continuous' }}>
                <MaterialCommunityIcons name="magnify" size={20} color={colors.text2} />
                <TextInput
                  value={filter}
                  onChangeText={(value) => {
                    setFilter(value);
                    setLimit(MODEL_PAGE);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Search models"
                  placeholderTextColor={colors.gray}
                  className="text-sf-text flex-1 px-2.5 py-3 text-base"
                />
                {filter ? (
                  <Pressable
                    onPress={() => setFilter('')}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search">
                    <MaterialCommunityIcons name="close-circle" size={18} color={colors.text2} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {visibleModels.slice(0, limit).map((model, index) => {
            const selected = selectedIds.has(model.id);
            const badges = modelBadges(model);
            return (
              <View key={model.id}>
                <View className="bg-sf-separator ml-4 h-px" />
                <Pressable
                  onPress={() => toggleModel(model.id, model)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  android_ripple={{ color: colors.separator }}
                  style={({ pressed }) => ({
                    minHeight: 56,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: selected ? colors.selectionBg : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  })}>
                  <View className="flex-1 gap-0.5">
                    <Text
                      className="text-base font-medium"
                      style={{ color: selected ? colors.onSelectionBg : colors.text }}
                      numberOfLines={1}>
                      {model.name}
                    </Text>
                    <Text className="text-sf-text-2 text-sm" numberOfLines={1}>
                      {badges.length > 0 ? `${badges.join(' · ')} · ` : ''}
                      {model.id}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={selected ? 'check-circle' : 'circle-outline'}
                    size={22}
                    color={selected ? colors.accent : colors.text3}
                  />
                </Pressable>
              </View>
            );
          })}

          {visibleModels.length === 0 ? (
            <View className="gap-1 px-4 pb-4">
              <Text className="text-sf-text-2 text-sm">
                {provider.models.length === 0
                  ? 'This provider has no catalog models. Add a model id manually below.'
                  : 'No models match that search.'}
              </Text>
            </View>
          ) : null}

          {visibleModels.length > limit ? (
            <>
              <View className="bg-sf-separator ml-4 h-px" />
              <Pressable
                onPress={() => setLimit((value) => value + MODEL_PAGE)}
                accessibilityRole="button"
                android_ripple={{ color: colors.separator }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}>
                <Text className="text-sf-blue text-base font-semibold">
                  Show more ({visibleModels.length - limit} left)
                </Text>
              </Pressable>
            </>
          ) : null}
        </SettingsGroup>

        {/* Manual model id */}
        <SettingsGroup title="Add model by id">
          <View className="gap-3 px-4 py-4">
            <Text className="text-sf-text-2 text-sm">
              For models the catalog does not list yet, or your own deployment names.
            </Text>
            <TextInput
              value={manualModelId}
              onChangeText={setManualModelId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="e.g. my-org/my-model"
              placeholderTextColor={colors.gray}
              className="text-sf-text rounded-2xl px-3 py-3 text-base"
              style={{ backgroundColor: colors.bg3, minHeight: 48, borderCurve: 'continuous' }}
            />
            <Button
              variant="tonal"
              label="Add to chain"
              onPress={addManualModel}
              disabled={!manualModelId.trim()}
            />
          </View>
        </SettingsGroup>

        {provider.custom ? (
          <SettingsGroup>
            <View className="px-4 py-4">
              <Button variant="danger" label="Delete provider" onPress={deleteProvider} />
            </View>
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
