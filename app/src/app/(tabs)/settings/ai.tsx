import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable } from 'react-native';

import { SettingsGroup, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useTaskLists } from '@/hooks/use-tasks';
import {
  AI_PROVIDERS,
  buildProvidersWithCustom,
  capabilityLabel,
  loadAiProviders,
  modelBadges,
  modelById,
  type AiModelInfo,
  type AiProviderId,
  type AiProviderInfo,
  type LoadProvidersResult,
} from '@/lib/ai-models';
import { clearAiApiKey, getAiApiKey, saveAiApiKey } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, TextInput, View } from '@/tw';

export default function AiScreen() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';

  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const setAiDefaultListId = useSettingsStore((s) => s.setAiDefaultListId);
  const aiModelSelections = useSettingsStore((s) => s.aiModelSelections);
  const setAiModelSelections = useSettingsStore((s) => s.setAiModelSelections);
  const aiBaseUrlOverrides = useSettingsStore((s) => s.aiBaseUrlOverrides);
  const setAiBaseUrlOverride = useSettingsStore((s) => s.setAiBaseUrlOverride);
  const aiCustomProviders = useSettingsStore((s) => s.aiCustomProviders);
  const upsertAiCustomProvider = useSettingsStore((s) => s.upsertAiCustomProvider);
  const removeAiCustomProvider = useSettingsStore((s) => s.removeAiCustomProvider);
  const listsQuery = useTaskLists();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  const [keys, setKeys] = useState<Partial<Record<AiProviderId, string>>>({});
  const [hasKeys, setHasKeys] = useState<Partial<Record<AiProviderId, boolean>>>({});
  const [showKeys, setShowKeys] = useState<Partial<Record<AiProviderId, boolean>>>({});
  const [customModelInputs, setCustomModelInputs] = useState<Partial<Record<AiProviderId, string>>>({});
  const [providerFilters, setProviderFilters] = useState<Partial<Record<AiProviderId, string>>>({});
  const [expanded, setExpanded] = useState<Partial<Record<AiProviderId, boolean>>>({});
  const [baseProviders, setBaseProviders] = useState<AiProviderInfo[]>(AI_PROVIDERS);
  const [loadState, setLoadState] = useState<LoadProvidersResult>({ providers: AI_PROVIDERS, source: 'fallback' });
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [newCustom, setNewCustom] = useState({ name: '', baseUrl: '', key: '', modelId: '' });

  const allProviders = useMemo(
    () => buildProvidersWithCustom(baseProviders, aiCustomProviders),
    [baseProviders, aiCustomProviders]
  );

  function refresh() {
    setLoading(true);
    loadAiProviders().then((result) => {
      setBaseProviders(result.providers);
      setLoadState(result);
      setLoading(false);
    });
  }

  useEffect(() => {
    let active = true;
    loadAiProviders().then((result) => {
      if (!active) return;
      setBaseProviders(result.providers);
      setLoadState(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isWeb) return;
    let active = true;
    Promise.all(
      allProviders.map(async (provider) => [provider.id, await getAiApiKey(provider.id)] as const)
    ).then((entries) => {
      if (!active) return;
      setKeys((prev) => ({ ...prev, ...Object.fromEntries(entries.map(([id, value]) => [id, value ?? prev[id] ?? ''])) }));
      setHasKeys((prev) => ({ ...prev, ...Object.fromEntries(entries.map(([id, value]) => [id, !!value])) }));
    });
    return () => {
      active = false;
    };
  }, [isWeb, allProviders]);

  async function saveKey(providerId: AiProviderId) {
    try {
      await saveAiApiKey(providerId, keys[providerId] ?? '');
      setHasKeys((value) => ({ ...value, [providerId]: true }));
      queryClient.invalidateQueries();
      setAlert({ title: 'Saved', message: 'API key stored securely on this device.' });
    } catch (error) {
      setAlert({ title: 'Could not save key', message: error instanceof Error ? error.message : 'Try again.' });
    }
  }

  async function removeKey(providerId: AiProviderId) {
    await clearAiApiKey(providerId);
    setHasKeys((value) => ({ ...value, [providerId]: false }));
    setKeys((value) => ({ ...value, [providerId]: '' }));
    queryClient.invalidateQueries();
  }

  function isSelected(providerId: AiProviderId, modelId: string) {
    return aiModelSelections.some((s) => s.providerId === providerId && s.modelId === modelId);
  }

  function toggleSelection(providerId: AiProviderId, modelId: string, model?: AiModelInfo) {
    setAiModelSelections(
      isSelected(providerId, modelId)
        ? aiModelSelections.filter((s) => s.providerId !== providerId || s.modelId !== modelId)
        : [
            ...aiModelSelections,
            {
              providerId,
              modelId,
              modelName: model?.name,
              input: model?.input,
              output: model?.output,
              reasoning: model?.reasoning,
            },
          ]
    );
  }

  function moveSelection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= aiModelSelections.length) return;
    const next = [...aiModelSelections];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setAiModelSelections(next);
  }

  function addCustomModelId(providerId: AiProviderId) {
    const modelId = customModelInputs[providerId]?.trim();
    if (!modelId) return;
    toggleSelection(providerId, modelId);
    setCustomModelInputs((value) => ({ ...value, [providerId]: '' }));
  }

  async function addCustomProvider() {
    const name = newCustom.name.trim();
    const baseUrl = newCustom.baseUrl.trim();
    if (!name || !baseUrl) {
      setAlert({ title: 'Missing fields', message: 'Name and Base URL are required.' });
      return;
    }
    const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
    const modelIds = newCustom.modelId.trim() ? [newCustom.modelId.trim()] : [];
    try {
      upsertAiCustomProvider({ id, name, baseUrl, modelIds });
    } catch (error) {
      setAlert({
        title: 'Invalid base URL',
        message: error instanceof Error ? error.message : 'Use HTTPS, or HTTP only for a local/LAN model server.',
      });
      return;
    }
    if (newCustom.key.trim()) {
      try {
        await saveAiApiKey(id, newCustom.key.trim());
        setHasKeys((value) => ({ ...value, [id]: true }));
      } catch {}
    }
    setNewCustom({ name: '', baseUrl: '', key: '', modelId: '' });
  }

  const sourceLabel =
    loadState.source === 'network'
      ? 'Live from models.dev'
      : loadState.source === 'cache'
        ? 'Cached models.dev catalog'
        : 'Offline — using provider defaults';
  const totalModels = baseProviders.reduce((sum, p) => sum + p.models.length, 0);

  return (
    <SettingsScreen>
      <SettingsGroup>
        <View className="gap-3 px-4 py-4">
          <View className="flex-row items-center gap-3">
            <View
              className="bg-sf-blue h-10 w-10 items-center justify-center rounded-full"
              style={{ borderCurve: 'continuous' }}>
              <MaterialCommunityIcons name="brain" size={22} color={colors.onAccent} />
            </View>
            <View className="flex-1">
              <Text className="text-sf-text text-base font-semibold">Model catalog</Text>
              <Text className="text-sf-text-2 text-xs">{sourceLabel} · {totalModels} models</Text>
            </View>
            <Pressable
              onPress={refresh}
              disabled={loading}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed || loading ? 0.5 : 1 })}>
              {loading ? (
                <ActivityIndicator />
              ) : (
                <MaterialCommunityIcons name="refresh" size={22} color={colors.accent} />
              )}
            </Pressable>
          </View>
          {loadState.error ? (
            <View className="bg-sf-bg-3 flex-row gap-2 rounded-xl px-3 py-2" style={{ borderCurve: 'continuous' }}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.orange} />
              <Text className="text-sf-text-2 flex-1 text-xs">{loadState.error}. Showing cached or default models. Tap refresh to retry.</Text>
            </View>
          ) : null}
        </View>
      </SettingsGroup>

      {aiModelSelections.length > 0 ? (
        <SettingsGroup title={`Fallback chain · ${aiModelSelections.length}`}>
          <View className="gap-1 px-2 py-2">
            {aiModelSelections.map((selection, index) => {
              const provider = allProviders.find((item) => item.id === selection.providerId);
              const model = modelById(selection, allProviders);
              const badges = modelBadges(model ?? selection);
              return (
                <View
                  key={`${selection.providerId}:${selection.modelId}:${index}`}
                  className="bg-sf-bg-3 flex-row items-center gap-2 rounded-2xl px-3 py-2.5"
                  style={{ borderCurve: 'continuous' }}>
                  <View
                    className="bg-sf-blue h-7 w-7 items-center justify-center rounded-full"
                    style={{ borderCurve: 'continuous' }}>
                    <Text className="text-sf-on-accent text-xs font-semibold">{index + 1}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sf-text text-sm font-semibold" numberOfLines={1}>
                      {provider?.name ?? selection.providerId} · {model?.name ?? selection.modelName ?? selection.modelId}
                    </Text>
                    <View className="mt-0.5 flex-row flex-wrap items-center gap-1">
                      {badges.map((badge) => (
                        <View
                          key={badge}
                          className="bg-sf-bg-2 rounded-full px-2 py-0.5"
                          style={{ borderCurve: 'continuous' }}>
                          <Text className="text-sf-text-2 text-[10px] font-medium">{badge}</Text>
                        </View>
                      ))}
                      <Text className="text-sf-text-3 text-[10px]">{selection.modelId}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => moveSelection(index, -1)}
                    disabled={index === 0}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: index === 0 ? 0.25 : pressed ? 0.6 : 1 })}>
                    <MaterialCommunityIcons name="arrow-up" size={20} color={colors.text2} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveSelection(index, 1)}
                    disabled={index === aiModelSelections.length - 1}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: index === aiModelSelections.length - 1 ? 0.25 : pressed ? 0.6 : 1 })}>
                    <MaterialCommunityIcons name="arrow-down" size={20} color={colors.text2} />
                  </Pressable>
                  <Pressable
                    onPress={() => toggleSelection(selection.providerId, selection.modelId)}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <MaterialCommunityIcons name="close-circle" size={20} color={colors.red} />
                  </Pressable>
                </View>
              );
            })}
            <Text className="text-sf-text-3 px-2 pt-1 text-xs">
              Models are tried top-to-bottom. Image prompts skip text-only models.
            </Text>
          </View>
        </SettingsGroup>
      ) : null}

      {!isWeb ? (
        <SettingsGroup title="Providers">
          <View className="gap-2 px-2 py-2">
            {allProviders.map((provider) => {
              const isOpen = expanded[provider.id] ?? false;
              const selectedCount = aiModelSelections.filter((s) => s.providerId === provider.id).length;
              const filter = providerFilters[provider.id]?.toLowerCase() ?? '';
              const visibleModels = filter
                ? provider.models.filter((m) => m.id.toLowerCase().includes(filter) || m.name.toLowerCase().includes(filter))
                : provider.models;

              return (
                <View
                  key={provider.id}
                  className="bg-sf-bg-3 rounded-2xl"
                  style={{ borderCurve: 'continuous' }}>
                  <Pressable
                    onPress={() => setExpanded((value) => ({ ...value, [provider.id]: !isOpen }))}
                    android_ripple={{ color: colors.gray3 }}
                    style={({ pressed }) => ({ opacity: pressed && Platform.OS !== 'android' ? 0.7 : 1 })}>
                    <View className="flex-row items-center gap-3 px-3 py-3">
                      <View
                        className="h-9 w-9 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: hasKeys[provider.id] ? colors.green : colors.bg2,
                          borderCurve: 'continuous',
                        }}>
                        <MaterialCommunityIcons
                          name={provider.custom ? 'puzzle' : 'key-variant'}
                          size={18}
                          color={hasKeys[provider.id] ? colors.onAccent : colors.text2}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sf-text text-base font-semibold">{provider.name}</Text>
                        <Text className="text-sf-text-2 text-xs" numberOfLines={1}>
                          {provider.models.length} models
                          {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
                          {hasKeys[provider.id] ? ' · key saved' : ''}
                        </Text>
                      </View>
                      {provider.custom ? (
                        <Pressable
                          onPress={() => removeAiCustomProvider(provider.id)}
                          hitSlop={8}
                          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                          <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.red} />
                        </Pressable>
                      ) : null}
                      <MaterialCommunityIcons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={22}
                        color={colors.text2}
                      />
                    </View>
                  </Pressable>

                  {isOpen ? (
                    <View className="gap-3 px-3 pb-3">
                      <View
                        className="bg-sf-bg-2 flex-row items-center gap-2 rounded-xl px-3"
                        style={{ borderCurve: 'continuous' }}>
                        <TextInput
                          value={keys[provider.id] ?? ''}
                          onChangeText={(value) => setKeys((current) => ({ ...current, [provider.id]: value }))}
                          autoCapitalize="none"
                          autoCorrect={false}
                          secureTextEntry={!showKeys[provider.id]}
                          placeholder={`${provider.env} · paste here`}
                          placeholderTextColor={colors.text3}
                          className="text-sf-text flex-1 py-2.5 text-sm"
                        />
                        <Pressable
                          onPress={() => setShowKeys((value) => ({ ...value, [provider.id]: !value[provider.id] }))}
                          hitSlop={8}
                          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                          <MaterialCommunityIcons
                            name={showKeys[provider.id] ? 'eye-off-outline' : 'eye-outline'}
                            size={20}
                            color={colors.text2}
                          />
                        </Pressable>
                      </View>

                      {provider.kind === 'openai-compatible' && !provider.custom ? (
                        <TextInput
                          value={aiBaseUrlOverrides[provider.id] ?? provider.defaultBaseUrl ?? ''}
                          onChangeText={(value) => setAiBaseUrlOverride(provider.id, value)}
                          autoCapitalize="none"
                          autoCorrect={false}
                          placeholder="OpenAI-compatible base URL"
                          placeholderTextColor={colors.text3}
                          className="text-sf-text bg-sf-bg-2 rounded-xl px-3 py-2.5 text-xs"
                          style={{ borderCurve: 'continuous' }}
                        />
                      ) : null}

                      <View className="flex-row items-center gap-3">
                        <Pressable
                          onPress={() => saveKey(provider.id)}
                          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, flex: 1 })}>
                          <View
                            className="bg-sf-blue items-center rounded-xl py-2.5"
                            style={{ borderCurve: 'continuous' }}>
                            <Text className="text-sf-on-accent text-sm font-semibold">
                              {hasKeys[provider.id] ? 'Update key' : 'Save key'}
                            </Text>
                          </View>
                        </Pressable>
                        {hasKeys[provider.id] ? (
                          <Pressable onPress={() => removeKey(provider.id)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                            <Text className="text-sf-red px-2 text-sm font-semibold">Remove</Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {provider.models.length > 0 ? (
                        <View
                          className="bg-sf-bg-2 flex-row items-center gap-2 rounded-xl px-3"
                          style={{ borderCurve: 'continuous' }}>
                          <MaterialCommunityIcons name="magnify" size={16} color={colors.text3} />
                          <TextInput
                            value={providerFilters[provider.id] ?? ''}
                            onChangeText={(value) =>
                              setProviderFilters((current) => ({ ...current, [provider.id]: value }))
                            }
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder="Filter models"
                            placeholderTextColor={colors.text3}
                            className="text-sf-text flex-1 py-2 text-xs"
                          />
                        </View>
                      ) : null}

                      {provider.models.length > 0 ? (
                        <View className="flex-row flex-wrap gap-1.5">
                          {visibleModels.slice(0, 60).map((model) => {
                            const selected = isSelected(provider.id, model.id);
                            const badges = modelBadges(model);
                            return (
                              <Pressable
                                key={model.id}
                                onPress={() => toggleSelection(provider.id, model.id, model)}
                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                                <View
                                  className="rounded-2xl px-2.5 py-1.5"
                                  style={{
                                    backgroundColor: selected ? colors.accent : colors.bg2,
                                    borderCurve: 'continuous',
                                  }}>
                                  <Text
                                    className="text-xs font-semibold"
                                    style={{ color: selected ? colors.onAccent : colors.text }}>
                                    {model.name}
                                  </Text>
                                  {badges.length > 0 ? (
                                    <Text
                                      className="text-[10px]"
                                      style={{ color: selected ? colors.onAccent : colors.text2 }}>
                                      {badges.join(' · ')}
                                    </Text>
                                  ) : null}
                                </View>
                              </Pressable>
                            );
                          })}
                          {visibleModels.length === 0 ? (
                            <Text className="text-sf-text-3 text-xs">No matches.</Text>
                          ) : null}
                          {visibleModels.length > 60 ? (
                            <Text className="text-sf-text-3 text-xs">
                              + {visibleModels.length - 60} more — keep typing to filter.
                            </Text>
                          ) : null}
                        </View>
                      ) : (
                        <Text className="text-sf-text-3 text-xs">{capabilityLabel(provider.models[0] ?? { id: '', name: '', input: ['text'], output: ['text'] })}</Text>
                      )}

                      <View className="flex-row gap-2">
                        <TextInput
                          value={customModelInputs[provider.id] ?? ''}
                          onChangeText={(value) =>
                            setCustomModelInputs((current) => ({ ...current, [provider.id]: value }))
                          }
                          autoCapitalize="none"
                          autoCorrect={false}
                          placeholder="Add model id manually"
                          placeholderTextColor={colors.text3}
                          className="text-sf-text bg-sf-bg-2 flex-1 rounded-xl px-3 py-2 text-xs"
                          style={{ borderCurve: 'continuous' }}
                        />
                        <Pressable
                          onPress={() => addCustomModelId(provider.id)}
                          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                          <View
                            className="bg-sf-bg-2 items-center justify-center rounded-xl px-3 py-2"
                            style={{ borderCurve: 'continuous' }}>
                            <Text className="text-sf-blue text-xs font-semibold">Add</Text>
                          </View>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </SettingsGroup>
      ) : null}

      {!isWeb ? (
        <SettingsGroup title="Custom provider (OpenAI-compatible)">
          <View className="gap-2 px-4 py-4">
            <Text className="text-sf-text-3 text-xs">
              Add any OpenAI-compatible endpoint — local llama.cpp, vLLM, LM Studio, a self-hosted gateway, anything.
            </Text>
            <TextInput
              value={newCustom.name}
              onChangeText={(name) => setNewCustom((c) => ({ ...c, name }))}
              autoCapitalize="words"
              placeholder="Display name (e.g. Home server)"
              placeholderTextColor={colors.text3}
              className="text-sf-text bg-sf-bg-3 rounded-xl px-3 py-2.5 text-sm"
              style={{ borderCurve: 'continuous' }}
            />
            <TextInput
              value={newCustom.baseUrl}
              onChangeText={(baseUrl) => setNewCustom((c) => ({ ...c, baseUrl }))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Base URL (e.g. http://192.168.1.10:11434/v1)"
              placeholderTextColor={colors.text3}
              className="text-sf-text bg-sf-bg-3 rounded-xl px-3 py-2.5 text-sm"
              style={{ borderCurve: 'continuous' }}
            />
            <TextInput
              value={newCustom.modelId}
              onChangeText={(modelId) => setNewCustom((c) => ({ ...c, modelId }))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Model id (optional — you can add more later)"
              placeholderTextColor={colors.text3}
              className="text-sf-text bg-sf-bg-3 rounded-xl px-3 py-2.5 text-sm"
              style={{ borderCurve: 'continuous' }}
            />
            <TextInput
              value={newCustom.key}
              onChangeText={(key) => setNewCustom((c) => ({ ...c, key }))}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="API key (optional)"
              placeholderTextColor={colors.text3}
              className="text-sf-text bg-sf-bg-3 rounded-xl px-3 py-2.5 text-sm"
              style={{ borderCurve: 'continuous' }}
            />
            <Pressable onPress={addCustomProvider} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
              <View className="bg-sf-blue items-center rounded-xl py-2.5" style={{ borderCurve: 'continuous' }}>
                <Text className="text-sf-on-accent text-sm font-semibold">Add provider</Text>
              </View>
            </Pressable>
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
