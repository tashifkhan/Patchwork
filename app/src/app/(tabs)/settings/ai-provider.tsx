import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable } from 'react-native';

import { AiProviderIcon } from '@/components/settings/ai-provider-icon';
import {
  RowSeparator,
  SETTINGS_IOS,
  SettingsActionRow,
  SettingsDivider,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsSearchField,
  SettingsTextField,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { RELAYROOM_DEFAULT_URL, fetchRelayroomModelOptions, relayroomTarget } from '@/api/relayroom';
import { useAiCatalog, useInvalidateAiKeys } from '@/hooks/use-ai';
import { aiCredentialId, modelBadges, type AiModelInfo, type ReasoningEffort } from '@/lib/ai-models';
import { assertSafeAiBaseUrl } from '@/lib/secure-url';
import { clearAiApiKey, getAiApiKey, saveAiApiKey } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

/** Rendering every OpenRouter model would mean 300+ rows in one ScrollView. */
const MODEL_PAGE = 40;

export default function AiProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const invalidateKeys = useInvalidateAiKeys();

  const { providers, relayroom, refresh } = useAiCatalog();
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
              reasoningEfforts: model?.reasoningEfforts,
              modes: model?.modes,
            },
          ]
    );
    if (isRelay && !selectedIds.has(modelId)) void loadRouteOptions(modelId);
  }

  /**
   * RelayRoom is the authority on what a route accepts: exact reasoning
   * levels, and whether it carries images and audio. Ask once on pick.
   */
  async function loadRouteOptions(modelId: string) {
    try {
      const apiKey = await getAiApiKey('relayroom');
      if (!apiKey) return;
      const baseUrl = assertSafeAiBaseUrl(aiBaseUrlOverrides.relayroom?.trim() || RELAYROOM_DEFAULT_URL);
      const options = await fetchRelayroomModelOptions({ baseUrl, apiKey }, relayroomTarget(modelId));
      const efforts = options.reasoningLevels.filter((level): level is ReasoningEffort =>
        ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(level)
      );
      const store = useSettingsStore.getState();
      store.setAiModelSelections(
        store.aiModelSelections.map((s) =>
          s.providerId === 'relayroom' && s.modelId === modelId
            ? { ...s, input: options.inputTypes, reasoning: efforts.length > 0, reasoningEfforts: efforts }
            : s
        )
      );
    } catch {
      // Keep the catalog capabilities; the chain still works without them.
    }
  }

  async function saveKey() {
    if (!provider) return;
    setSaving(true);
    try {
      await saveAiApiKey(provider.id, key);
      setHasKey(true);
      invalidateKeys();
      if (provider.id === 'relayroom') void refresh();
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

  const eye = (
    <Pressable
      onPress={() => setShowKey((value) => !value)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={showKey ? 'Hide key' : 'Show key'}
      style={({ pressed }) => ({
        minWidth: 32,
        minHeight: 32,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.5 : 1,
      })}>
      {SETTINGS_IOS ? (
        <SymbolView name={showKey ? 'eye.slash' : 'eye'} size={18} tintColor={colors.text2} />
      ) : (
        <MaterialCommunityIcons
          name={showKey ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={colors.text2}
        />
      )}
    </Pressable>
  );

  const keyFooter = [
    hasKey ? 'Stored in the Keychain on this device.' : `Paste your ${provider.env}.`,
    provider.id === 'relayroom'
      ? 'Issue a gateway key in the RelayRoom console under API keys. On a phone, replace 127.0.0.1 with your computer\'s LAN address.'
      : null,
    sharesKeyWith.length > 0
      ? `The same ${provider.env} is used by ${sharesKeyWith.join(', ')}, so saving here configures both.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  const isRelay = provider.kind === 'relayroom';
  const baseUrlOverride =
    (provider.kind === 'openai-compatible' && !provider.custom) || isRelay;

  return (
    <>
      <SettingsScreen>
        <Stack.Screen options={{ title: provider.name }} />

        {/* Identity + status */}
        <SettingsGroup>
          <SettingsRow
            leading={
              <AiProviderIcon
                providerId={provider.id}
                custom={provider.custom}
                configured={hasKey}
                size={SETTINGS_IOS ? 30 : 44}
              />
            }
            title={provider.name}
            subtitle={`${hasKey ? 'Key saved' : 'No key yet'} · ${provider.models.length} model${provider.models.length === 1 ? '' : 's'}`}
          />
          {provider.docs ? (
            <>
              <RowSeparator />
              <SettingsRow
                icon="open-in-new"
                title="Documentation"
                showChevron
                onPress={() => Linking.openURL(provider.docs)}
              />
            </>
          ) : null}
        </SettingsGroup>

        {/* Credentials */}
        <SettingsGroup title="API key" footer={keyFooter}>
          <SettingsTextField
            label={SETTINGS_IOS ? 'Key' : 'API key'}
            icon="key-outline"
            labelWidth={baseUrlOverride ? 80 : 50}
            value={key}
            onChangeText={setKey}
            autoCapitalize="none"
            secureTextEntry={!showKey}
            placeholder={provider.env}
            mono
            trailing={eye}
          />
          {baseUrlOverride ? (
            <>
              <SettingsDivider />
              <SettingsTextField
                label="Base URL"
                icon="web"
                labelWidth={80}
                value={aiBaseUrlOverrides[provider.id] ?? provider.defaultBaseUrl ?? ''}
                onChangeText={(value) => setAiBaseUrlOverride(provider.id, value)}
                autoCapitalize="none"
                keyboardType="url"
                placeholder={isRelay ? RELAYROOM_DEFAULT_URL : 'OpenAI-compatible URL'}
              />
            </>
          ) : null}
          <SettingsDivider />
          <SettingsActionRow
            title={hasKey ? 'Update Key' : 'Save Key'}
            variant="filled"
            onPress={saveKey}
            disabled={!key.trim()}
            loading={saving}
          />
          {hasKey ? (
            <>
              <SettingsDivider />
              <SettingsActionRow title="Remove Key" destructive variant="text" onPress={removeKey} />
            </>
          ) : null}
        </SettingsGroup>

        {/* Models */}
        <View style={{ gap: 12 }}>
          {provider.models.length > 0 ? (
            <SettingsSearchField
              value={filter}
              onChangeText={(value) => {
                setFilter(value);
                setLimit(MODEL_PAGE);
              }}
              placeholder="Search models"
            />
          ) : null}
          <SettingsGroup
            title={selectedIds.size > 0 ? `Models · ${selectedIds.size} selected` : 'Models'}
            footer={
              visibleModels.length === 0
                ? provider.models.length === 0
                  ? isRelay
                    ? relayroom.error ??
                      (relayroom.loading
                        ? 'Loading your gateway catalog…'
                        : hasKey
                          ? 'The gateway has no live models. Add credentials in the RelayRoom console.'
                          : 'Save a gateway key to load your aliases and every model RelayRoom routes.')
                    : 'This provider has no catalog models. Add a model id below.'
                  : 'No models match that search.'
                : isRelay
                  ? 'Aliases fail over along their ladder. Each model can route through Auto, Subscription or API key on the AI import page.'
                  : 'Checked models join the fallback chain on the AI import page.'
            }>
            {visibleModels.slice(0, limit).map((model, index) => {
              const badges = modelBadges(model);
              return (
                <Fragment key={model.id}>
                  {index > 0 ? <SettingsDivider /> : null}
                  <SettingsRow
                    title={model.name}
                    subtitle={
                      isRelay
                        ? [model.providerName, badges.join(' · ') || null, model.alias ? null : relayroomTarget(model.id).model]
                            .filter(Boolean)
                            .join(' · ')
                        : `${badges.length > 0 ? `${badges.join(' · ')} · ` : ''}${model.id}`
                    }
                    selected={selectedIds.has(model.id)}
                    onPress={() => toggleModel(model.id, model)}
                  />
                </Fragment>
              );
            })}
            {visibleModels.length > limit ? (
              <>
                <SettingsDivider />
                <SettingsActionRow
                  title={`Show More (${visibleModels.length - limit} left)`}
                  variant="text"
                  onPress={() => setLimit((value) => value + MODEL_PAGE)}
                />
              </>
            ) : null}
          </SettingsGroup>
        </View>

        {/* Manual model id */}
        <SettingsGroup
          title="Add model by id"
          footer="For models the catalog does not list yet, or your own deployment names.">
          <SettingsTextField
            icon="plus"
            value={manualModelId}
            onChangeText={setManualModelId}
            autoCapitalize="none"
            placeholder="my-org/my-model"
            mono
            onSubmitEditing={addManualModel}
            returnKeyType="done"
          />
          <SettingsDivider />
          <SettingsActionRow
            title="Add to Chain"
            onPress={addManualModel}
            disabled={!manualModelId.trim()}
          />
        </SettingsGroup>

        {provider.custom ? (
          <SettingsGroup>
            <SettingsActionRow title="Delete Provider" destructive onPress={deleteProvider} />
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
